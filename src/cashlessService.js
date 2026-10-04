const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction, PENGATURAN_TOPUP_DEFAULT } = require("./db");
const { decodeBuktiTransfer } = require("./topupEvidence");

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

async function getPengaturanTopUp() {
  const row = await queryOne('SELECT "nilai" FROM "Pengaturan" WHERE "kunci" = $1', ["topup"]);
  if (!row) return { ...PENGATURAN_TOPUP_DEFAULT };
  try {
    return { ...PENGATURAN_TOPUP_DEFAULT, ...JSON.parse(row.nilai) };
  } catch (error) {
    throw new Error("Pengaturan top-up tersimpan dalam format yang tidak valid.", { cause: error });
  }
}

async function catatAuditTx({ aktorId, aktorRole, aksi, targetTipe, targetId, detail }) {
  await query(`
    INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
  `, [uid(), aktorId || null, aktorRole, aksi, targetTipe, targetId || null, JSON.stringify(detail || {})]);
}

function sanitasiPermintaan(row, buktiDiDaftar) {
  const result = { ...row, adaBukti: !!row.buktiTransfer };
  delete result.buktiHash;
  if (!buktiDiDaftar) delete result.buktiTransfer;
  return result;
}

async function getSantriRow(santriId, lock = false) {
  const row = await queryOne(`SELECT * FROM "Santri" WHERE ("id" = $1 OR "nis" = $1 OR "kartuToken" = $1)${lock ? " FOR UPDATE" : ""}`, [santriId]);
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
  return {
    id: pub.id,
    nis: pub.nis,
    nisn: pub.nisn,
    nama: pub.nama,
    kelas: pub.kelas,
    saldo: pub.saldo,
    limitJajanHarian: pub.limitJajanHarian,
    sisaLimitHariIni: pub.sisaLimitHariIni,
    blokir: pub.blokir,
  };
}

function markIdempotentReplay(response) {
  Object.defineProperty(response, "idempotentReplay", { value: true });
  return response;
}

async function catatTransaksiTx({ santriId, unit, jenis, kategori, subKategori, jumlah, keterangan, bulan, metode, pin, validasiPin, petugasId, idempotencyKey }) {
  return withTransaction(async () => {
    if (!JENIS_TRANSAKSI_BMT.includes(jenis)) throw new CashlessError(400, "Jenis transaksi tidak valid.");
    jumlah = Number(jumlah);
    if (!jumlah || jumlah <= 0) throw new CashlessError(400, "Jumlah transaksi harus lebih dari 0.");
    if (idempotencyKey != null && (typeof idempotencyKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idempotencyKey))) {
      throw new CashlessError(400, "idempotencyKey harus berupa UUID.");
    }

    if (idempotencyKey) {
      const reservation = await query(`INSERT INTO "TransaksiCashlessIdempotency" ("idempotencyKey")
        VALUES ($1) ON CONFLICT ("idempotencyKey") DO NOTHING RETURNING "idempotencyKey"`, [idempotencyKey]);
      if (!reservation.rowCount) {
        const previous = await queryOne('SELECT "response" FROM "TransaksiCashlessIdempotency" WHERE "idempotencyKey" = $1', [idempotencyKey]);
        if (!previous?.response) throw new Error("Respons idempotensi belum tersedia setelah konflik kunci.");
        return markIdempotentReplay({ ...previous.response });
      }
    }

    const santri = await getSantriRow(santriId, true);
    const saldoSekarang = Number(santri.saldo || 0);
    if (jenis === "Tarik Tunai") {
      if (!KATEGORI_TRANSAKSI_BMT.includes(kategori)) throw new CashlessError(400, "Kategori transaksi tidak valid.");
      const qrTanpaPin = metode === "qr" && !santri.pinHash;
      if (validasiPin && !qrTanpaPin) {
        const { verifikasiPin } = require("./pinService");
        const pinError = await verifikasiPin(santri, pin, { unit, petugasId });
        if (pinError) {
          if (idempotencyKey) await query('DELETE FROM "TransaksiCashlessIdempotency" WHERE "idempotencyKey" = $1', [idempotencyKey]);
          return { pinError };
        }
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
      INSERT INTO "TransaksiCashless" ("id", "santriId", "unit", "jenis", "kategori", "subKategori", "metode", "jumlah", "keterangan", "saldoSetelah", "tanggalISO", "tanggalLabel", "bulan", "idempotencyKey", "saldoSebelum", "saldoSesudah")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    `, [transaksi.id, transaksi.santriId, transaksi.unit, transaksi.jenis, transaksi.kategori, transaksi.subKategori, transaksi.metode,
      transaksi.jumlah, transaksi.keterangan, transaksi.saldoSetelah, transaksi.tanggalISO, transaksi.tanggalLabel, transaksi.bulan,
      idempotencyKey || null, saldoSekarang, saldoBaru]);
    await catatAuditTx({
      aktorId: petugasId,
      aktorRole: "guru",
      aksi: "cashless.transaction_recorded",
      targetTipe: "Santri",
      targetId: santriId,
      detail: { transaksiId: transaksi.id, unit, jenis, kategori: transaksi.kategori, jumlah, saldoSebelum: saldoSekarang, saldoSesudah: saldoBaru },
    });

    const response = {
      transaksi,
      lewatLimit,
      pesan: lewatLimit ? `Transaksi tercatat, namun melebihi limit jajan harian. Cashless santri otomatis diblokir sampai ${formatTanggalISO(blokirBaru.sampaiISO)}.` : null,
      santri: await toPublicSantri(await getSantriRow(santriId)),
    };
    if (idempotencyKey) {
      await query('UPDATE "TransaksiCashlessIdempotency" SET "response" = $1::jsonb WHERE "idempotencyKey" = $2',
        [JSON.stringify(response), idempotencyKey]);
    }
    return response;
  });
}

async function catatTransaksi(input) {
  const hasil = await catatTransaksiTx(input);
  if (hasil.pinError) throw new CashlessError(hasil.pinError.status, hasil.pinError.message, hasil.pinError.details);
  return hasil;
}

async function riwayatSantri(santriId) {
  await getSantriRow(santriId);
  return queryAll(`SELECT "id", "santriId", "unit", "jenis", "kategori", "subKategori", "jumlah", "keterangan", "saldoSetelah",
    "tanggalISO", "tanggalLabel", "bulan", "metode", "createdAt" FROM "TransaksiCashless" WHERE "santriId" = $1 ORDER BY "createdAt" DESC`, [santriId]);
}

async function auditSaldo() {
  const rows = await queryAll(`
    WITH ordered AS (
      SELECT "santriId", "id", "createdAt", "jenis", "jumlah", "saldoSetelah", "saldoSebelum", "saldoSesudah",
        ROW_NUMBER() OVER (PARTITION BY "santriId" ORDER BY "createdAt", "id") AS rn
      FROM "TransaksiCashless"
    ), first_complete AS (
      SELECT "santriId", MIN(rn) FILTER (WHERE "saldoSebelum" IS NOT NULL AND "saldoSesudah" IS NOT NULL) AS first_rn
      FROM ordered GROUP BY "santriId"
    ), ledger AS (
      SELECT o."santriId",
        CASE WHEN f.first_rn IS NULL THEN
          (ARRAY_AGG(COALESCE(o."saldoSesudah", o."saldoSetelah") ORDER BY o.rn DESC))[1]
        ELSE
          (ARRAY_AGG(o."saldoSebelum" ORDER BY o.rn) FILTER (WHERE o.rn = f.first_rn))[1]
          + COALESCE(SUM(CASE WHEN o."jenis" = 'Top Up' THEN o."jumlah" WHEN o."jenis" = 'Tarik Tunai' THEN -o."jumlah" ELSE 0 END)
            FILTER (WHERE o.rn >= f.first_rn), 0)
        END AS "saldoLedger"
      FROM ordered o JOIN first_complete f ON f."santriId" = o."santriId"
      GROUP BY o."santriId", f.first_rn
    )
    SELECT s."id", s."nama", s."saldo", COALESCE(l."saldoLedger", 0)::BIGINT AS "saldoLedger",
      s."saldo" - COALESCE(l."saldoLedger", 0)::BIGINT AS "selisih"
    FROM "Santri" s LEFT JOIN ledger l ON l."santriId" = s."id"
    ORDER BY s."nama"
  `);
  const tidakCocok = rows.filter((row) => Number(row.selisih) !== 0).map((row) => ({
    id: row.id, nama: row.nama, saldo: Number(row.saldo), saldoLedger: Number(row.saldoLedger), selisih: Number(row.selisih),
  }));
  return { jumlahSantri: rows.length, jumlahTidakCocok: tidakCocok.length, tidakCocok };
}

async function catatPercobaanDuplikat({ aktorId, aktorRole, hash, targetId }) {
  const duplicateId = targetId || (await queryOne(`
    SELECT "id" FROM "PermintaanBMT"
    WHERE "jenis" = 'Top Up Saldo' AND "status" <> 'Ditolak' AND "buktiHash" = $1
    LIMIT 1
  `, [hash]))?.id;
  await withTransaction(() => catatAuditTx({
    aktorId, aktorRole, aksi: "topup.bukti_duplikat", targetTipe: "PermintaanBMT", targetId: duplicateId,
    detail: { buktiHash: hash },
  }));
  throw new CashlessError(409, "Bukti transfer ini sudah pernah dipakai");
}

async function ajukanPermintaan({ santriId, waliId, jenis, nilaiDiminta, alasan, buktiTransfer }) {
  let bukti = null;
  let targetDuplikat = null;
  if (jenis === "Top Up Saldo") {
    try {
      bukti = await decodeBuktiTransfer(buktiTransfer);
    } catch (error) {
      throw new CashlessError(400, error.message);
    }
  }
  try {
    const result = await withTransaction(async () => {
      if (!JENIS_PERMINTAAN_BMT.includes(jenis)) throw new CashlessError(400, "Jenis permintaan tidak valid.");
      if (!alasan || typeof alasan !== "string" || !alasan.trim()) throw new CashlessError(400, "Alasan permintaan wajib diisi.");

      const santri = await getSantriRow(santriId, jenis === "Top Up Saldo");
      if (santri.waliId !== waliId) throw new CashlessError(403, "Santri ini bukan anak dari akun wali yang login.");
      if (jenis !== "Buka Blokir Sekarang" && !nilaiDiminta) throw new CashlessError(400, "Nilai yang diminta wajib diisi.");

      const nominal = jenis === "Buka Blokir Sekarang" ? null : Number(nilaiDiminta);
      const settings = jenis === "Top Up Saldo" ? await getPengaturanTopUp() : null;
      if (jenis === "Top Up Saldo") {
        if (!Number.isSafeInteger(nominal) || nominal < Number(settings.nominalMinimum) || nominal > Number(settings.nominalMaksimum)) {
          throw new CashlessError(400, `Nominal top up harus antara Rp ${Number(settings.nominalMinimum).toLocaleString("id-ID")} dan Rp ${Number(settings.nominalMaksimum).toLocaleString("id-ID")}.`);
        }
        const duplicate = await queryOne(`
          SELECT "id" FROM "PermintaanBMT"
          WHERE "jenis" = 'Top Up Saldo' AND "status" <> 'Ditolak' AND "buktiHash" = $1
          LIMIT 1
        `, [bukti.hash]);
        if (duplicate) {
          targetDuplikat = duplicate.id;
          await catatAuditTx({
            aktorId: waliId, aktorRole: "wali", aksi: "topup.bukti_duplikat",
            targetTipe: "PermintaanBMT", targetId: duplicate.id, detail: { buktiHash: bukti.hash },
          });
          return { duplicate: true };
        }

        const pending = await queryOne(`
          SELECT COUNT(*) AS "jumlah" FROM "PermintaanBMT"
          WHERE "santriId" = $1 AND "waliId" = $2 AND "jenis" = 'Top Up Saldo' AND "status" = 'Menunggu'
        `, [santriId, waliId]);
        if (Number(pending.jumlah) >= Number(settings.maxPermintaanMenunggu)) {
          throw new CashlessError(409, `Maksimal ${settings.maxPermintaanMenunggu} permintaan Top Up Saldo berstatus Menunggu untuk santri ini.`);
        }
      }

      const permintaan = {
        id: uid(), santriId, waliId, jenis, nilaiDiminta: nominal,
        alasan: alasan.trim(),
        buktiTransfer: bukti ? `data:${bukti.mime};base64,${bukti.bytes.toString("base64")}` : null,
        status: "Menunggu", tanggalAjukan: todayLabel(), tanggalDiproses: null,
        diprosesOleh: null, catatanBMT: null,
      };
      await query(`
        INSERT INTO "PermintaanBMT" ("id", "santriId", "waliId", "jenis", "nilaiDiminta", "alasan", "buktiTransfer", "buktiHash", "status", "tanggalAjukan", "tanggalDiproses", "diprosesOleh", "catatanBMT")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [permintaan.id, permintaan.santriId, permintaan.waliId, permintaan.jenis, permintaan.nilaiDiminta, permintaan.alasan,
        permintaan.buktiTransfer, bukti?.hash || null, permintaan.status, permintaan.tanggalAjukan,
        permintaan.tanggalDiproses, permintaan.diprosesOleh, permintaan.catatanBMT]);
      if (jenis === "Top Up Saldo") {
        await catatAuditTx({
          aktorId: waliId, aktorRole: "wali", aksi: "topup.diajukan",
          targetTipe: "PermintaanBMT", targetId: permintaan.id,
          detail: { santriId, nilaiDiminta: nominal, buktiHash: bukti.hash },
        });
      }
      return sanitasiPermintaan(permintaan, true);
    });
    if (result?.duplicate) throw new CashlessError(409, "Bukti transfer ini sudah pernah dipakai");
    return result;
  } catch (error) {
    if (error.code === "23505" && error.constraint === "idx_permintaan_bukti_hash_unique" && bukti) {
      return catatPercobaanDuplikat({ aktorId: waliId, aktorRole: "wali", hash: bukti.hash, targetId: targetDuplikat });
    }
    throw error;
  }
}

async function prosesPermintaan({
  id, disetujui, diprosesOleh, diprosesOlehId, aktorRole = "BMT", catatan,
  nominalDisetujui, referensiMutasi,
}) {
  return withTransaction(async () => {
    const permintaan = await queryOne('SELECT * FROM "PermintaanBMT" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!permintaan) throw new CashlessError(404, "Permintaan tidak ditemukan.");
    if (permintaan.status !== "Menunggu") throw new CashlessError(409, "Permintaan ini sudah diproses sebelumnya.");

    const isTopUp = permintaan.jenis === "Top Up Saldo";
    const settings = isTopUp ? await getPengaturanTopUp() : null;
    if (!disetujui && isTopUp && (!catatan || typeof catatan !== "string" || !catatan.trim())) {
      throw new CashlessError(400, "Alasan penolakan wajib diisi.");
    }

    if (disetujui) {
      const now = `to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
      if (permintaan.jenis === "Ubah Limit Jajan Harian") {
        await query(`UPDATE "Santri" SET "limitJajanHarian" = $1, "updatedAt" = ${now} WHERE "id" = $2`, [permintaan.nilaiDiminta, permintaan.santriId]);
      } else if (permintaan.jenis === "Ubah Durasi Blokir") {
        await query(`UPDATE "Santri" SET "durasiBlokirHari" = $1, "updatedAt" = ${now} WHERE "id" = $2`, [permintaan.nilaiDiminta, permintaan.santriId]);
      } else if (permintaan.jenis === "Buka Blokir Sekarang") {
        await query(`UPDATE "Santri" SET "blokirAktif" = 0, "updatedAt" = ${now} WHERE "id" = $1`, [permintaan.santriId]);
      } else if (isTopUp) {
        const amount = nominalDisetujui == null
          ? Number(permintaan.nominalDisetujui ?? permintaan.nilaiDiminta)
          : Number(nominalDisetujui);
        if (!Number.isSafeInteger(amount) || amount <= 0 || amount > Number(settings.nominalMaksimum)
          || (nominalDisetujui != null && amount < Number(settings.nominalMinimum))) {
          throw new CashlessError(400, `Nominal yang disetujui harus antara Rp ${Number(settings.nominalMinimum).toLocaleString("id-ID")} dan Rp ${Number(settings.nominalMaksimum).toLocaleString("id-ID")}.`);
        }
        const reference = typeof referensiMutasi === "string"
          ? referensiMutasi.trim()
          : String(permintaan.referensiMutasi || "").trim();
        if (referensiMutasi != null && typeof referensiMutasi !== "string") {
          throw new CashlessError(400, "referensiMutasi harus berupa teks.");
        }
        if (settings.wajibReferensiMutasi && !reference) {
          throw new CashlessError(400, "Referensi mutasi wajib diisi saat menyetujui Top Up Saldo.");
        }
        const persetujuanKeduaAktif = !!settings.persetujuanKeduaAktif;
        const butuhPersetujuanKedua = permintaan.perluPersetujuanKedua
          || (persetujuanKeduaAktif && amount > Number(settings.batasPersetujuanTunggal));
        if (butuhPersetujuanKedua && !permintaan.perluPersetujuanKedua) {
          await query(`
            UPDATE "PermintaanBMT" SET "nominalDisetujui" = $1, "referensiMutasi" = $2,
              "perluPersetujuanKedua" = TRUE, "diprosesPertamaOleh" = $3, "diprosesPada" = ${now}
            WHERE "id" = $4
          `, [amount, reference || null, diprosesOlehId, id]);
          await catatAuditTx({
            aktorId: diprosesOlehId, aktorRole, aksi: "topup.persetujuan_pertama",
            targetTipe: "PermintaanBMT", targetId: id,
            detail: { nilaiDiminta: Number(permintaan.nilaiDiminta), nominalDisetujui: amount, referensiMutasi: reference || null },
          });
          return sanitasiPermintaan(await queryOne('SELECT * FROM "PermintaanBMT" WHERE "id" = $1', [id]), !!settings.buktiDiDaftar);
        }
        if (permintaan.perluPersetujuanKedua && permintaan.diprosesPertamaOleh === diprosesOlehId) {
          throw new CashlessError(409, "Persetujuan kedua harus dilakukan oleh staf yang berbeda.");
        }
        await catatTransaksiTx({
          santriId: permintaan.santriId, unit: "BMT", jenis: "Top Up", jumlah: amount,
          keterangan: `Top up via transfer manual (disetujui oleh ${diprosesOleh})`,
        });
        await query(`
          UPDATE "PermintaanBMT" SET "nominalDisetujui" = $1, "referensiMutasi" = $2,
            "status" = 'Disetujui', "tanggalDiproses" = $3, "diprosesOleh" = $4,
            "diprosesPada" = ${now}, "catatanBMT" = $5 WHERE "id" = $6
        `, [amount, reference || null, todayLabel(), diprosesOleh, catatan || null, id]);
        await catatAuditTx({
          aktorId: diprosesOlehId, aktorRole, aksi: "topup.disetujui",
          targetTipe: "PermintaanBMT", targetId: id,
          detail: { nilaiDiminta: Number(permintaan.nilaiDiminta), nominalDisetujui: amount, referensiMutasi: reference || null },
        });
      }
    }

    if (!disetujui && isTopUp) {
      await query(`
        UPDATE "PermintaanBMT" SET "status" = 'Ditolak', "tanggalDiproses" = $1,
          "diprosesOleh" = $2, "diprosesPada" = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          "catatanBMT" = $3 WHERE "id" = $4
      `, [todayLabel(), diprosesOleh, catatan.trim(), id]);
      await catatAuditTx({
        aktorId: diprosesOlehId, aktorRole, aksi: "topup.ditolak",
        targetTipe: "PermintaanBMT", targetId: id, detail: { alasan: catatan.trim() },
      });
      return sanitasiPermintaan(await queryOne('SELECT * FROM "PermintaanBMT" WHERE "id" = $1', [id]), !!settings.buktiDiDaftar);
    }

    if (!isTopUp) {
      await query('UPDATE "PermintaanBMT" SET "status" = $1, "tanggalDiproses" = $2, "diprosesOleh" = $3, "catatanBMT" = $4 WHERE "id" = $5',
        [disetujui ? "Disetujui" : "Ditolak", todayLabel(), diprosesOleh, catatan || null, id]);
    }
    const finalRow = await queryOne('SELECT * FROM "PermintaanBMT" WHERE "id" = $1', [id]);
    return sanitasiPermintaan(finalRow, isTopUp ? !!settings.buktiDiDaftar : true);
  });
}

async function daftarPermintaan(status) {
  const settings = await getPengaturanTopUp();
  const rows = status && status !== "Semua"
    ? await queryAll('SELECT * FROM "PermintaanBMT" WHERE "status" = $1 ORDER BY "createdAt" DESC', [status])
    : await queryAll('SELECT * FROM "PermintaanBMT" ORDER BY "createdAt" DESC');
  return rows.map((row) => sanitasiPermintaan(row, !!settings.buktiDiDaftar));
}

async function daftarPermintaanWali(waliId, santriId) {
  const settings = await getPengaturanTopUp();
  const rows = santriId
    ? await queryAll('SELECT * FROM "PermintaanBMT" WHERE "waliId" = $1 AND "santriId" = $2 ORDER BY "createdAt" DESC', [waliId, santriId])
    : await queryAll('SELECT * FROM "PermintaanBMT" WHERE "waliId" = $1 ORDER BY "createdAt" DESC', [waliId]);
  return rows.map((row) => sanitasiPermintaan(row, !!settings.buktiDiDaftar));
}

async function ambilBuktiTransfer(id) {
  const row = await queryOne('SELECT "buktiTransfer" FROM "PermintaanBMT" WHERE "id" = $1', [id]);
  if (!row?.buktiTransfer) throw new CashlessError(404, "Bukti transfer tidak ditemukan.");
  try {
    return await decodeBuktiTransfer(row.buktiTransfer);
  } catch (error) {
    throw new CashlessError(404, "Bukti transfer tidak tersedia atau formatnya tidak valid.");
  }
}

async function simpanPengaturanTopUp(patch, aktor) {
  const current = await getPengaturanTopUp();
  const allowed = ["wajibReferensiMutasi", "buktiDiDaftar", "persetujuanKeduaAktif",
    "maxPermintaanMenunggu", "nominalMinimum", "nominalMaksimum",
    "batasPersetujuanTunggal", "nomorRekening"];
  for (const key of Object.keys(patch)) {
    if (!allowed.includes(key)) throw new CashlessError(400, `Pengaturan top-up tidak dikenal: ${key}.`);
  }
  const next = { ...current, ...patch };
  for (const key of ["wajibReferensiMutasi", "buktiDiDaftar", "persetujuanKeduaAktif"]) {
    if (typeof next[key] !== "boolean") throw new CashlessError(400, `${key} harus berupa boolean.`);
  }
  for (const key of ["maxPermintaanMenunggu", "nominalMinimum", "nominalMaksimum", "batasPersetujuanTunggal"]) {
    if (!Number.isSafeInteger(Number(next[key])) || Number(next[key]) < (key === "batasPersetujuanTunggal" ? 0 : 1)) {
      throw new CashlessError(400, `${key} harus berupa bilangan bulat positif.`);
    }
    next[key] = Number(next[key]);
  }
  if (next.nominalMinimum > next.nominalMaksimum) throw new CashlessError(400, "nominalMinimum tidak boleh melebihi nominalMaksimum.");
  if (typeof next.nomorRekening !== "string") throw new CashlessError(400, "nomorRekening harus berupa teks.");
  const changed = Object.fromEntries(Object.keys(next)
    .filter((key) => JSON.stringify(current[key]) !== JSON.stringify(next[key]))
    .map((key) => [key, { dari: current[key], ke: next[key] }]));
  await withTransaction(async () => {
    await query(`
      INSERT INTO "Pengaturan" ("kunci", "nilai") VALUES ('topup', $1)
      ON CONFLICT ("kunci") DO UPDATE SET "nilai" = EXCLUDED."nilai"
    `, [JSON.stringify(next)]);
    if (Object.keys(changed).length) {
      await catatAuditTx({
        aktorId: aktor.id, aktorRole: aktor.role, aksi: "topup.pengaturan_diubah",
        targetTipe: "Pengaturan", targetId: "topup", detail: changed,
      });
    }
  });
  return next;
}

async function daftarAudit({ aksi, dari, sampai, page, limit }) {
  const kondisi = [];
  const params = [];
  if (aksi) { params.push(aksi); kondisi.push(`"aksi" = $${params.length}`); }
  if (dari) { params.push(`${dari}T00:00:00`); kondisi.push(`"waktu" >= $${params.length}`); }
  if (sampai) { params.push(`${sampai}T23:59:59.999`); kondisi.push(`"waktu" <= $${params.length}`); }
  const where = kondisi.length ? `WHERE ${kondisi.join(" AND ")}` : "";
  const count = await queryOne(`SELECT COUNT(*) AS "total" FROM "AuditLog" ${where}`, params);
  const offset = (page - 1) * limit;
  const rows = await queryAll(`SELECT * FROM "AuditLog" ${where} ORDER BY "waktu" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]);
  return { data: rows, total: Number(count.total), page, limit };
}

async function laporanTopUpHarian(tanggalISO) {
  const status = await queryAll(`
    SELECT "status", COUNT(*) AS "jumlah"
    FROM "PermintaanBMT"
    WHERE "jenis" = 'Top Up Saldo' AND LEFT("createdAt", 10) = $1
    GROUP BY "status" ORDER BY "status"
  `, [tanggalISO]);
  const approved = await queryAll(`
    SELECT "id", "santriId", "waliId", "nilaiDiminta",
      COALESCE("nominalDisetujui", "nilaiDiminta") AS "nominalDisetujui",
      "referensiMutasi", "diprosesOleh", "diprosesPada"
    FROM "PermintaanBMT"
    WHERE "jenis" = 'Top Up Saldo' AND "status" = 'Disetujui'
      AND LEFT(COALESCE("diprosesPada", "createdAt"), 10) = $1
    ORDER BY "createdAt", "id"
  `, [tanggalISO]);
  const saldo = await queryOne('SELECT COALESCE(SUM("saldo"), 0) AS "totalSaldo" FROM "Santri"');
  return {
    tanggalISO,
    jumlahPerStatus: {
      Menunggu: 0, Disetujui: 0, Ditolak: 0,
      ...Object.fromEntries(status.map((row) => [row.status, Number(row.jumlah)])),
    },
    totalNominalDisetujui: approved.reduce((total, row) => total + Number(row.nominalDisetujui || 0), 0),
    permintaanDisetujui: approved,
    totalSaldoSeluruhSantri: Number(saldo.totalSaldo),
  };
}

module.exports = {
  CashlessError,
  DEFAULT_DURASI_BLOKIR_HARI, JENIS_TRANSAKSI_BMT, KATEGORI_TRANSAKSI_BMT, JENIS_PERMINTAAN_BMT,
  uid, todayISO, todayLabel, tambahHariISO, formatTanggalISO,
  getSantriRow, terpakaiHariIni, sisaLimitHarian, isBlokirAktif, toPublicSantri, toSaldoPublik, SANTRI_BIODATA_FIELDS,
  catatTransaksi, riwayatSantri, auditSaldo, ajukanPermintaan, prosesPermintaan,
  daftarPermintaan, daftarPermintaanWali, ambilBuktiTransfer,
  getPengaturanTopUp, simpanPengaturanTopUp, daftarAudit, laporanTopUpHarian,
};