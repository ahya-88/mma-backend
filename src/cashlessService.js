const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("./db");

const DEFAULT_DURASI_BLOKIR_HARI = 1;
const JENIS_TRANSAKSI_BMT = ["Top Up", "Tarik Tunai"];
const KATEGORI_TRANSAKSI_BMT = ["Jajan Harian", "Kebutuhan Khusus"];
const JENIS_PERMINTAAN_BMT = ["Ubah Limit Jajan Harian", "Ubah Durasi Blokir", "Buka Blokir Sekarang", "Top Up Saldo"];
const uid = () => crypto.randomUUID();
const todayISO = () => new Date().toISOString().slice(0, 10);
const todayLabel = () => new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const tambahHariISO = (isoAwal, n) => {
  const date = new Date(isoAwal + "T00:00:00");
  date.setDate(date.getDate() + Number(n || 0));
  return date.toISOString().slice(0, 10);
};
const formatTanggalISO = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : null);

class CashlessError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function getSantriRow(santriId, lock = false) {
  const row = await queryOne(`SELECT * FROM "Santri" WHERE "id" = $1${lock ? " FOR UPDATE" : ""}`, [santriId]);
  if (!row) throw new CashlessError(404, "Santri tidak ditemukan.");
  return row;
}

async function terpakaiHariIni(santriId) {
  const row = await queryOne(`
    SELECT COALESCE(SUM("jumlah"), 0) AS "total" FROM "TransaksiCashless"
    WHERE "santriId" = $1 AND "tanggalISO" = $2 AND "jenis" = 'Tarik Tunai'
      AND ("kategori" IS NULL OR "kategori" = 'Jajan Harian')
  `, [santriId, todayISO()]);
  return Number(row.total);
}

async function sisaLimitHarian(santri) {
  const limit = santri.limitJajanHarian || 0;
  if (!limit) return null;
  return Math.max(0, Number(limit) - await terpakaiHariIni(santri.id));
}

function isBlokirAktif(santri) {
  return !!(santri.blokirAktif && santri.blokirSampaiISO && santri.blokirSampaiISO >= todayISO());
}

const SANTRI_BIODATA_FIELDS = [
  "jenisKelamin", "tempatLahir", "tanggalLahir", "alamat", "asrama", "golDarah",
  "noDarurat", "catatanKesehatan", "halaqoh", "foto", "namaAyah", "namaIbu",
  "asalSekolah", "programPilihan", "citaCita", "pendidikanSD", "tahunSD",
  "pendidikanSMP", "tahunSMP", "pendidikanSMA", "tahunSMA",
];

async function toPublicSantri(santri, includeFoto = false) {
  const biodata = {};
  for (const field of SANTRI_BIODATA_FIELDS) {
    if (field === "foto" && !includeFoto) continue;
    biodata[field] = santri[field] ?? "";
  }
  let riwayatKelas = [];
  try { riwayatKelas = santri.riwayatKelas ? JSON.parse(santri.riwayatKelas) : []; } catch { riwayatKelas = []; }
  return {
    id: santri.id,
    nama: santri.nama,
    kelas: santri.kelas,
    nis: santri.nis ?? "",
    nisn: santri.nisn ?? "",
    waliId: santri.waliId ?? "",
    saldo: santri.saldo,
    limitJajanHarian: santri.limitJajanHarian,
    durasiBlokirHari: santri.durasiBlokirHari || DEFAULT_DURASI_BLOKIR_HARI,
    sisaLimitHariIni: await sisaLimitHarian(santri),
    hasFoto: !!(santri.foto && santri.foto.length > 0),
    blokir: isBlokirAktif(santri) ? {
      aktif: true,
      sejakISO: santri.blokirSejakISO,
      sampaiISO: santri.blokirSampaiISO,
      sampaiLabel: formatTanggalISO(santri.blokirSampaiISO),
      alasan: santri.blokirAlasan,
    } : { aktif: false },
    ...biodata,
    riwayatKelas,
  };
}

async function toSaldoPublik(santri) {
  const pub = await toPublicSantri(santri);
  return { nama: pub.nama, saldo: pub.saldo, limitJajanHarian: pub.limitJajanHarian, sisaLimitHariIni: pub.sisaLimitHariIni, blokir: pub.blokir };
}

async function catatTransaksiTx({ santriId, unit, jenis, kategori, subKategori, jumlah, keterangan, bulan, metode, pin, validasiPin, petugasId }) {
  return withTransaction(async () => {
    if (!JENIS_TRANSAKSI_BMT.includes(jenis)) throw new CashlessError(400, "Jenis transaksi tidak valid.");
    jumlah = Number(jumlah);
    if (!jumlah || jumlah <= 0) throw new CashlessError(400, "Jumlah transaksi harus lebih dari 0.");

    const santri = await getSantriRow(santriId, true);
    const saldoSekarang = Number(santri.saldo || 0);
    if (jenis === "Tarik Tunai") {
      if (!KATEGORI_TRANSAKSI_BMT.includes(kategori)) throw new CashlessError(400, "Kategori transaksi tidak valid.");
      const qrTanpaPin = metode === "qr" && !santri.pinHash;
      if (validasiPin && !qrTanpaPin) {
        const { verifikasiPin } = require("./pinService");
        const pinError = await verifikasiPin(santri, pin, { unit, petugasId });
        if (pinError) return { pinError };
      }
      if (isBlokirAktif(santri)) {
        throw new CashlessError(409, `Cashless santri ini sedang diblokir sampai ${formatTanggalISO(santri.blokirSampaiISO)} (${santri.blokirAlasan}). Wali dapat mengajukan buka blokir ke BMT.`);
      }
      if (jumlah > saldoSekarang) throw new CashlessError(400, `Saldo santri tidak cukup. Saldo saat ini: ${saldoSekarang}`);
    }

    let lewatLimit = false;
    let blokirBaru = null;
    if (jenis === "Tarik Tunai" && kategori === "Jajan Harian" && Number(santri.limitJajanHarian)) {
      const terpakaiSetelah = await terpakaiHariIni(santriId) + jumlah;
      if (terpakaiSetelah > Number(santri.limitJajanHarian)) {
        lewatLimit = true;
        const durasi = Number(santri.durasiBlokirHari) || DEFAULT_DURASI_BLOKIR_HARI;
        blokirBaru = {
          sejakISO: todayISO(),
          sampaiISO: tambahHariISO(todayISO(), durasi),
          alasan: `Melebihi limit jajan harian (${santri.limitJajanHarian}/hari)`,
        };
      }
    }

    const saldoBaru = jenis === "Top Up" ? saldoSekarang + jumlah : saldoSekarang - jumlah;
    const now = `to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
    if (blokirBaru) {
      await query(`UPDATE "Santri" SET "saldo" = $1, "updatedAt" = ${now}, "blokirAktif" = 1, "blokirSejakISO" = $2, "blokirSampaiISO" = $3, "blokirAlasan" = $4 WHERE "id" = $5`,
        [saldoBaru, blokirBaru.sejakISO, blokirBaru.sampaiISO, blokirBaru.alasan, santriId]);
    } else {
      await query(`UPDATE "Santri" SET "saldo" = $1, "updatedAt" = ${now} WHERE "id" = $2`, [saldoBaru, santriId]);
    }

    const transaksi = {
      id: uid(), santriId, unit, jenis,
      kategori: jenis === "Tarik Tunai" ? kategori : null,
      subKategori: jenis === "Tarik Tunai" && kategori === "Kebutuhan Khusus" ? (subKategori || null) : null,
      metode: ["qr", "wajah", "manual"].includes(metode) ? metode : null,
      jumlah, keterangan: keterangan || null, saldoSetelah: saldoBaru,
      tanggalISO: todayISO(), tanggalLabel: todayLabel(), bulan: bulan || todayLabel(),
    };
    await query(`
      INSERT INTO "TransaksiCashless" ("id", "santriId", "unit", "jenis", "kategori", "subKategori", "metode", "jumlah", "keterangan", "saldoSetelah", "tanggalISO", "tanggalLabel", "bulan")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [transaksi.id, transaksi.santriId, transaksi.unit, transaksi.jenis, transaksi.kategori, transaksi.subKategori, transaksi.metode,
      transaksi.jumlah, transaksi.keterangan, transaksi.saldoSetelah, transaksi.tanggalISO, transaksi.tanggalLabel, transaksi.bulan]);

    return {
      transaksi,
      lewatLimit,
      pesan: lewatLimit ? `Transaksi tercatat, namun melebihi limit jajan harian. Cashless santri otomatis diblokir sampai ${formatTanggalISO(blokirBaru.sampaiISO)}.` : null,
      santri: await toPublicSantri(await getSantriRow(santriId)),
    };
  });
}

async function catatTransaksi(input) {
  const hasil = await catatTransaksiTx(input);
  if (hasil.pinError) throw new CashlessError(hasil.pinError.status, hasil.pinError.message, hasil.pinError.details);
  return hasil;
}

async function riwayatSantri(santriId) {
  await getSantriRow(santriId);
  return queryAll('SELECT * FROM "TransaksiCashless" WHERE "santriId" = $1 ORDER BY "createdAt" DESC', [santriId]);
}

async function ajukanPermintaan({ santriId, waliId, jenis, nilaiDiminta, alasan, buktiTransfer }) {
  return withTransaction(async () => {
    if (!JENIS_PERMINTAAN_BMT.includes(jenis)) throw new CashlessError(400, "Jenis permintaan tidak valid.");
    if (!alasan || !alasan.trim()) throw new CashlessError(400, "Alasan permintaan wajib diisi.");
    const santri = await getSantriRow(santriId);
    if (santri.waliId !== waliId) throw new CashlessError(403, "Santri ini bukan anak dari akun wali yang login.");
    if (jenis !== "Buka Blokir Sekarang" && !nilaiDiminta) throw new CashlessError(400, "Nilai yang diminta wajib diisi.");
    if (jenis === "Top Up Saldo") {
      if (Number(nilaiDiminta) <= 0) throw new CashlessError(400, "Nominal top up harus lebih dari 0.");
      if (!buktiTransfer) throw new CashlessError(400, "Bukti transfer wajib diupload.");
    }
    const permintaan = {
      id: uid(), santriId, waliId, jenis,
      nilaiDiminta: jenis === "Buka Blokir Sekarang" ? null : Number(nilaiDiminta),
      alasan: alasan.trim(), buktiTransfer: jenis === "Top Up Saldo" ? buktiTransfer : null,
      status: "Menunggu", tanggalAjukan: todayLabel(), tanggalDiproses: null, diprosesOleh: null, catatanBMT: null,
    };
    await query(`
      INSERT INTO "PermintaanBMT" ("id", "santriId", "waliId", "jenis", "nilaiDiminta", "alasan", "buktiTransfer", "status", "tanggalAjukan", "tanggalDiproses", "diprosesOleh", "catatanBMT")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [permintaan.id, permintaan.santriId, permintaan.waliId, permintaan.jenis, permintaan.nilaiDiminta, permintaan.alasan,
      permintaan.buktiTransfer, permintaan.status, permintaan.tanggalAjukan, permintaan.tanggalDiproses, permintaan.diprosesOleh, permintaan.catatanBMT]);
    return permintaan;
  });
}

async function prosesPermintaan({ id, disetujui, diprosesOleh, catatan }) {
  return withTransaction(async () => {
    const permintaan = await queryOne('SELECT * FROM "PermintaanBMT" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!permintaan) throw new CashlessError(404, "Permintaan tidak ditemukan.");
    if (permintaan.status !== "Menunggu") throw new CashlessError(409, "Permintaan ini sudah diproses sebelumnya.");

    if (disetujui) {
      const now = `to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
      if (permintaan.jenis === "Ubah Limit Jajan Harian") {
        await query(`UPDATE "Santri" SET "limitJajanHarian" = $1, "updatedAt" = ${now} WHERE "id" = $2`, [permintaan.nilaiDiminta, permintaan.santriId]);
      } else if (permintaan.jenis === "Ubah Durasi Blokir") {
        await query(`UPDATE "Santri" SET "durasiBlokirHari" = $1, "updatedAt" = ${now} WHERE "id" = $2`, [permintaan.nilaiDiminta, permintaan.santriId]);
      } else if (permintaan.jenis === "Buka Blokir Sekarang") {
        await query(`UPDATE "Santri" SET "blokirAktif" = 0, "updatedAt" = ${now} WHERE "id" = $1`, [permintaan.santriId]);
      } else if (permintaan.jenis === "Top Up Saldo") {
        await catatTransaksiTx({
          santriId: permintaan.santriId, unit: "BMT", jenis: "Top Up", jumlah: permintaan.nilaiDiminta,
          keterangan: `Top up via transfer manual (disetujui oleh ${diprosesOleh})`,
        });
      }
    }
    await query('UPDATE "PermintaanBMT" SET "status" = $1, "tanggalDiproses" = $2, "diprosesOleh" = $3, "catatanBMT" = $4 WHERE "id" = $5',
      [disetujui ? "Disetujui" : "Ditolak", todayLabel(), diprosesOleh, catatan || null, id]);
    return queryOne('SELECT * FROM "PermintaanBMT" WHERE "id" = $1', [id]);
  });
}

async function daftarPermintaan(status) {
  if (status && status !== "Semua") return queryAll('SELECT * FROM "PermintaanBMT" WHERE "status" = $1 ORDER BY "createdAt" DESC', [status]);
  return queryAll('SELECT * FROM "PermintaanBMT" ORDER BY "createdAt" DESC');
}

module.exports = {
  CashlessError,
  DEFAULT_DURASI_BLOKIR_HARI, JENIS_TRANSAKSI_BMT, KATEGORI_TRANSAKSI_BMT, JENIS_PERMINTAAN_BMT,
  uid, todayISO, todayLabel, tambahHariISO, formatTanggalISO,
  getSantriRow, terpakaiHariIni, sisaLimitHarian, isBlokirAktif, toPublicSantri, toSaldoPublik, SANTRI_BIODATA_FIELDS,
  catatTransaksi, riwayatSantri, ajukanPermintaan, prosesPermintaan, daftarPermintaan,
};