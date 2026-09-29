const crypto = require("crypto");
const db = require("./db");

const DEFAULT_DURASI_BLOKIR_HARI = 1;
const JENIS_TRANSAKSI_BMT = ["Top Up", "Tarik Tunai"];
const KATEGORI_TRANSAKSI_BMT = ["Jajan Harian", "Kebutuhan Khusus"];
const JENIS_PERMINTAAN_BMT = ["Ubah Limit Jajan Harian", "Ubah Durasi Blokir", "Buka Blokir Sekarang", "Top Up Saldo"];

const uid = () => crypto.randomUUID();
const todayISO = () => new Date().toISOString().slice(0, 10);
const todayLabel = () => new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const tambahHariISO = (isoAwal, n) => {
  const d = new Date(isoAwal + "T00:00:00");
  d.setDate(d.getDate() + Number(n || 0));
  return d.toISOString().slice(0, 10);
};
const formatTanggalISO = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : null);

class CashlessError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function getSantriRow(santriId) {
  const s = db.prepare("SELECT * FROM Santri WHERE id = ?").get(santriId);
  if (!s) throw new CashlessError(404, "Santri tidak ditemukan.");
  return s;
}

// Hanya transaksi kategori "Jajan Harian" (atau tanpa kategori — dianggap Jajan Harian) yang dihitung ke limit harian.
function terpakaiHariIni(santriId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(jumlah), 0) AS total FROM TransaksiCashless
    WHERE santriId = ? AND tanggalISO = ? AND jenis = 'Tarik Tunai'
      AND (kategori IS NULL OR kategori = 'Jajan Harian')
  `).get(santriId, todayISO());
  return row.total;
}

function sisaLimitHarian(santri) {
  const limit = santri.limitJajanHarian || 0;
  if (!limit) return null; // tidak dibatasi
  return Math.max(0, limit - terpakaiHariIni(santri.id));
}

function isBlokirAktif(santri) {
  return !!(santri.blokirAktif && santri.blokirSampaiISO && santri.blokirSampaiISO >= todayISO());
}

// Field biodata lengkap (Master Data Santri — Sekretariat). Dipisah dari field cashless/inti
// supaya mudah dipakai ulang oleh toPublicSantri di bawah maupun endpoint list/upsert di santri.js.
const SANTRI_BIODATA_FIELDS = [
  "jenisKelamin", "tempatLahir", "tanggalLahir", "alamat", "asrama", "golDarah",
  "noDarurat", "catatanKesehatan", "halaqoh", "foto", "namaAyah", "namaIbu",
  "asalSekolah", "programPilihan", "citaCita", "pendidikanSD", "tahunSD",
  "pendidikanSMP", "tahunSMP", "pendidikanSMA", "tahunSMA",
];

// Bentuk objek santri yang aman dikirim ke klien, dengan status blokir/limit yang sudah dihitung.
function toPublicSantri(santri) {
  const biodata = {};
  for (const f of SANTRI_BIODATA_FIELDS) biodata[f] = santri[f] ?? "";
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
    sisaLimitHariIni: sisaLimitHarian(santri),
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

// Info minimal untuk kios cek saldo mandiri (Bagian C dokumen konsep) — tanpa data pribadi sensitif.
function toSaldoPublik(santri) {
  const pub = toPublicSantri(santri);
  return { nama: pub.nama, saldo: pub.saldo, limitJajanHarian: pub.limitJajanHarian, sisaLimitHariIni: pub.sisaLimitHariIni, blokir: pub.blokir };
}

/**
 * Catat transaksi Top Up / Tarik Tunai.
 * Skema: Tarik Tunai kategori "Jajan Harian" yang melewati limit tetap diproses,
 * tapi otomatis memicu blokir untuk transaksi berikutnya selama durasiBlokirHari (default 1 hari).
 * Top Up selalu boleh; Tarik Tunai ditolak jika status blokir sedang aktif atau saldo tidak cukup.
 */
const catatTransaksi = db.transaction(({ santriId, unit, jenis, kategori, subKategori, jumlah, keterangan, bulan }) => {
  if (!JENIS_TRANSAKSI_BMT.includes(jenis)) throw new CashlessError(400, "Jenis transaksi tidak valid.");
  jumlah = Number(jumlah);
  if (!jumlah || jumlah <= 0) throw new CashlessError(400, "Jumlah transaksi harus lebih dari 0.");

  const santri = getSantriRow(santriId);
  const saldoSekarang = santri.saldo || 0;

  if (jenis === "Tarik Tunai") {
    if (!KATEGORI_TRANSAKSI_BMT.includes(kategori)) throw new CashlessError(400, "Kategori transaksi tidak valid.");
    if (isBlokirAktif(santri)) {
      throw new CashlessError(409, `Cashless santri ini sedang diblokir sampai ${formatTanggalISO(santri.blokirSampaiISO)} (${santri.blokirAlasan}). Wali dapat mengajukan buka blokir ke BMT.`);
    }
    if (jumlah > saldoSekarang) {
      throw new CashlessError(400, `Saldo santri tidak cukup. Saldo saat ini: ${saldoSekarang}`);
    }
  }

  let lewatLimit = false;
  let blokirBaru = null;
  if (jenis === "Tarik Tunai" && kategori === "Jajan Harian" && Number(santri.limitJajanHarian)) {
    const terpakaiSetelah = terpakaiHariIni(santriId) + jumlah;
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

  db.prepare(`
    UPDATE Santri SET saldo = ?, updatedAt = datetime('now')
      ${blokirBaru ? ", blokirAktif = 1, blokirSejakISO = ?, blokirSampaiISO = ?, blokirAlasan = ?" : ""}
    WHERE id = ?
  `).run(...(blokirBaru ? [saldoBaru, blokirBaru.sejakISO, blokirBaru.sampaiISO, blokirBaru.alasan, santriId] : [saldoBaru, santriId]));

  const transaksi = {
    id: uid(), santriId, unit, jenis,
    kategori: jenis === "Tarik Tunai" ? kategori : null,
    subKategori: jenis === "Tarik Tunai" && kategori === "Kebutuhan Khusus" ? (subKategori || null) : null,
    jumlah, keterangan: keterangan || null, saldoSetelah: saldoBaru,
    tanggalISO: todayISO(), tanggalLabel: todayLabel(), bulan: bulan || todayLabel(),
  };
  db.prepare(`
    INSERT INTO TransaksiCashless (id, santriId, unit, jenis, kategori, subKategori, jumlah, keterangan, saldoSetelah, tanggalISO, tanggalLabel, bulan)
    VALUES (@id, @santriId, @unit, @jenis, @kategori, @subKategori, @jumlah, @keterangan, @saldoSetelah, @tanggalISO, @tanggalLabel, @bulan)
  `).run(transaksi);

  return {
    transaksi,
    lewatLimit,
    pesan: lewatLimit ? `Transaksi tercatat, namun melebihi limit jajan harian. Cashless santri otomatis diblokir sampai ${formatTanggalISO(blokirBaru.sampaiISO)}.` : null,
    santri: toPublicSantri(getSantriRow(santriId)),
  };
});

function riwayatSantri(santriId) {
  getSantriRow(santriId); // pastikan ada, lempar 404 jika tidak
  return db.prepare("SELECT * FROM TransaksiCashless WHERE santriId = ? ORDER BY createdAt DESC").all(santriId);
}

const ajukanPermintaan = db.transaction(({ santriId, waliId, jenis, nilaiDiminta, alasan, buktiTransfer }) => {
  if (!JENIS_PERMINTAAN_BMT.includes(jenis)) throw new CashlessError(400, "Jenis permintaan tidak valid.");
  if (!alasan || !alasan.trim()) throw new CashlessError(400, "Alasan permintaan wajib diisi.");
  const santri = getSantriRow(santriId);
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
    status: "Menunggu",
    tanggalAjukan: todayLabel(), tanggalDiproses: null, diprosesOleh: null, catatanBMT: null,
  };
  db.prepare(`
    INSERT INTO PermintaanBMT (id, santriId, waliId, jenis, nilaiDiminta, alasan, buktiTransfer, status, tanggalAjukan, tanggalDiproses, diprosesOleh, catatanBMT)
    VALUES (@id, @santriId, @waliId, @jenis, @nilaiDiminta, @alasan, @buktiTransfer, @status, @tanggalAjukan, @tanggalDiproses, @diprosesOleh, @catatanBMT)
  `).run(permintaan);
  return permintaan;
});

const prosesPermintaan = db.transaction(({ id, disetujui, diprosesOleh, catatan }) => {
  const p = db.prepare("SELECT * FROM PermintaanBMT WHERE id = ?").get(id);
  if (!p) throw new CashlessError(404, "Permintaan tidak ditemukan.");
  if (p.status !== "Menunggu") throw new CashlessError(409, "Permintaan ini sudah diproses sebelumnya.");

  if (disetujui) {
    if (p.jenis === "Ubah Limit Jajan Harian") {
      db.prepare("UPDATE Santri SET limitJajanHarian = ?, updatedAt = datetime('now') WHERE id = ?").run(p.nilaiDiminta, p.santriId);
    } else if (p.jenis === "Ubah Durasi Blokir") {
      db.prepare("UPDATE Santri SET durasiBlokirHari = ?, updatedAt = datetime('now') WHERE id = ?").run(p.nilaiDiminta, p.santriId);
    } else if (p.jenis === "Buka Blokir Sekarang") {
      db.prepare("UPDATE Santri SET blokirAktif = 0, updatedAt = datetime('now') WHERE id = ?").run(p.santriId);
    } else if (p.jenis === "Top Up Saldo") {
      // BMT sudah mencocokkan bukti transfer dengan mutasi rekening yayasan secara manual di luar
      // sistem sebelum menyetujui — di sinilah saldo baru benar-benar bertambah (bukan saat wali
      // mengajukan). Reuse catatTransaksi supaya tercatat juga di riwayat TransaksiCashless.
      catatTransaksi({
        santriId: p.santriId, unit: "BMT", jenis: "Top Up",
        jumlah: p.nilaiDiminta,
        keterangan: `Top up via transfer manual (disetujui oleh ${diprosesOleh})`,
      });
    }
  }
  db.prepare(`
    UPDATE PermintaanBMT SET status = ?, tanggalDiproses = ?, diprosesOleh = ?, catatanBMT = ? WHERE id = ?
  `).run(disetujui ? "Disetujui" : "Ditolak", todayLabel(), diprosesOleh, catatan || null, id);

  return db.prepare("SELECT * FROM PermintaanBMT WHERE id = ?").get(id);
});

function daftarPermintaan(status) {
  if (status && status !== "Semua") {
    return db.prepare("SELECT * FROM PermintaanBMT WHERE status = ? ORDER BY createdAt DESC").all(status);
  }
  return db.prepare("SELECT * FROM PermintaanBMT ORDER BY createdAt DESC").all();
}

module.exports = {
  CashlessError,
  DEFAULT_DURASI_BLOKIR_HARI, JENIS_TRANSAKSI_BMT, KATEGORI_TRANSAKSI_BMT, JENIS_PERMINTAAN_BMT,
  uid, todayISO, todayLabel, tambahHariISO, formatTanggalISO,
  getSantriRow, terpakaiHariIni, sisaLimitHarian, isBlokirAktif, toPublicSantri, toSaldoPublik, SANTRI_BIODATA_FIELDS,
  catatTransaksi, riwayatSantri, ajukanPermintaan, prosesPermintaan, daftarPermintaan,
};
