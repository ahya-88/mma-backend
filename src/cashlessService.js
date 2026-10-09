const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("./db");
const { decodeBuktiTransfer } = require("./topupEvidence");

class CashlessError extends Error {
  constructor(statusCode, message, extra = {}) {
    super(message);
    this.name = "CashlessError";
    this.statusCode = statusCode;
    this.status = statusCode;
    Object.assign(this, extra);
  }
}

const DEFAULT_DURASI_BLOKIR_HARI = 3;
const JENIS_TRANSAKSI_BMT = ["Tarik Tunai", "Setor Tunai", "Kredit", "Buka Blokir", "Tarik Tunai BMT", "Setor Tunai BMT"];
const KATEGORI_TRANSAKSI_BMT = ["Jajan Harian", "Setor Tunai", "Transfer Saldo", "Buka Blokir Manual", "Belanja Kantin", "Belanja Kopel", "Katering Dapur", "Administrasi BMT"];
const JENIS_PERMINTAAN_BMT = ["Top Up Saldo", "Buka Blokir Sekarang", "Ubah Limit Jajan", "Tarik Tunai BMT"];

const uid = () => crypto.randomUUID();

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function todayLabel() {
  return new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function tambahHariISO(isoStr, hari) {
  const base = isoStr ? new Date(`${isoStr.slice(0, 10)}T00:00:00.000Z`) : new Date();
  base.setUTCDate(base.getUTCDate() + Number(hari || 0));
  return base.toISOString().slice(0, 10);
}

function formatTanggalISO(isoStr) {
  if (!isoStr) return "-";
  const date = new Date(`${isoStr.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return isoStr;
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

async function getSantriRow(id, forUpdate = false) {
  const sql = `SELECT * FROM "Santri" WHERE "id" = $1 ${forUpdate ? "FOR UPDATE" : ""}`;
  const row = await queryOne(sql, [id]);
  if (!row) throw new CashlessError(404, "Data santri tidak ditemukan.");
  return row;
}

async function terpakaiHariIni(santriId, tanggal = todayISO()) {
  const row = await queryOne(
    `SELECT COALESCE(SUM("jumlah"), 0) AS "total"
     FROM "TransaksiCashless"
     WHERE "santriId" = $1
       AND "jenis" = 'Tarik Tunai'
       AND "kategori" = 'Jajan Harian'
       AND "tanggalISO" = $2`,
    [santriId, tanggal],
  );
  return Number(row?.total || 0);
}

async function sisaLimitHarian(santri) {
  const limit = Number(santri.limitJajanHarian || 0);
  if (!limit) return null;
  const terpakai = await terpakaiHariIni(santri.id);
  return Math.max(0, limit - terpakai);
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

async function toPublicSantri(santri, includeFoto = true) {
  const biodata = {};
  for (const field of SANTRI_BIODATA_FIELDS) {
    if (field === "foto" && !includeFoto) continue;
    biodata[field] = santri[field] ?? "";
  }
  let riwayatKelas = [];
  try { riwayatKelas = santri.riwayatKelas ? JSON.parse(santri.riwayatKelas) : []; } catch (_) {}
  return {
    id: santri.id,
    nama: santri.nama,
    kelas: santri.kelas ?? "",
    nis: santri.nis ?? "",
    nisn: santri.nisn ?? "",
    waliId: santri.waliId ?? null,
    saldo: Number(santri.saldo || 0),
    limitJajanHarian: santri.limitJajanHarian ? Number(santri.limitJajanHarian) : null,
    durasiBlokirHari: Number(santri.durasiBlokirHari || DEFAULT_DURASI_BLOKIR_HARI),
    sisaLimitHariIni: await sisaLimitHarian(santri),
    blokir: isBlokirAktif(santri) ? {
      aktif: true,
      sejakISO: santri.blokirSejakISO,
      sampaiISO: santri.blokirSampaiISO,
      sampaiLabel: formatTanggalISO(santri.blokirSampaiISO),
      alasan: santri.blokirAlasan || "Batas jajan harian terlampaui",
    } : { aktif: false },
    kartuTerbit: santri.kartuTerbit || null,
    punyaPin: !!(santri.pinHash && santri.pinHash.trim() !== ""),
    punyaWajah: !!(santri.faceEmbedding && santri.faceEmbedding.trim() !== ""),
    riwayatKelas,
    ...biodata,
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
  if (response && typeof response === "object") {
    Object.defineProperty(response, "idempotentReplay", { value: true, configurable: true, writable: true });
  }
  return response;
}

function computePayloadHash(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload || {})).digest("hex");
}

async function handleIdempotencyCheck({ idempotencyKey, payload }) {
  if (!idempotencyKey) return null;
  if (typeof idempotencyKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    throw new CashlessError(400, "idempotencyKey harus berupa UUID.");
  }
  const requestHash = computePayloadHash(payload);

  const existing = await queryOne(
    `SELECT "idempotencyKey", "requestHash", "response", "statusCode"
     FROM "TransaksiCashlessIdempotency"
     WHERE "idempotencyKey" = $1 AND "createdAt" >= (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - INTERVAL '72 hours', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))`,
    [idempotencyKey]
  );

  if (existing) {
    if (existing.requestHash && existing.requestHash !== requestHash) {
      throw new CashlessError(409, "Payload mismatch for idempotency key.", { code: "IDEMPOTENCY_PAYLOAD_MISMATCH" });
    }
    if (existing.response) {
      const respObj = typeof existing.response === "string" ? JSON.parse(existing.response) : existing.response;
      return { replay: true, response: markIdempotentReplay(respObj), statusCode: existing.statusCode || 200 };
    }
  }

  await query(
    `INSERT INTO "TransaksiCashlessIdempotency" ("idempotencyKey", "requestHash", "createdAt")
     VALUES ($1, $2, to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
     ON CONFLICT ("idempotencyKey") DO UPDATE SET "requestHash" = EXCLUDED."requestHash" WHERE "TransaksiCashlessIdempotency"."response" IS NULL`,
    [idempotencyKey, requestHash]
  );

  return { replay: false, requestHash };
}

async function handleIdempotencySave({ idempotencyKey, requestHash, response, statusCode = 200 }) {
  if (!idempotencyKey) return;
  await query(
    `UPDATE "TransaksiCashlessIdempotency"
     SET "response" = $1::jsonb, "statusCode" = $2, "requestHash" = COALESCE("requestHash", $3)
     WHERE "idempotencyKey" = $4`,
    [JSON.stringify(response), statusCode, requestHash || null, idempotencyKey]
  );
}

async function handleIdempotencyClear({ idempotencyKey }) {
  if (!idempotencyKey) return;
  await query('DELETE FROM "TransaksiCashlessIdempotency" WHERE "idempotencyKey" = $1 AND "response" IS NULL', [idempotencyKey]);
}

async function catatTransaksiTx({ santriId, unit, jenis, kategori, subKategori, jumlah, keterangan, bulan, metode, pin, validasiPin, petugasId, idempotencyKey }) {
  return withTransaction(async () => {
    if (!JENIS_TRANSAKSI_BMT.includes(jenis)) throw new CashlessError(400, "Jenis transaksi tidak valid.");
    jumlah = Number(jumlah);
    if (!jumlah || jumlah <= 0) throw new CashlessError(400, "Jumlah transaksi harus lebih dari 0.");

    const payload = { santriId, unit, jenis, kategori, subKategori, jumlah, keterangan, bulan, metode };
    const idemCheck = await handleIdempotencyCheck({ idempotencyKey, payload });
    if (idemCheck?.replay) return idemCheck.response;

    try {
      const santri = await getSantriRow(santriId, true);
      const saldoSekarang = Number(santri.saldo || 0);
      if (jenis === "Tarik Tunai") {
        if (!KATEGORI_TRANSAKSI_BMT.includes(kategori)) throw new CashlessError(400, "Kategori transaksi tidak valid.");
        const bypassPin = (metode === "wajah") || (metode === "qr" && !santri.pinHash) || ["cash", "qris"].includes(metode);
        if (validasiPin && !bypassPin) {
          const { verifikasiPin } = require("./pinService");
          const pinError = await verifikasiPin(santri, pin, { unit, petugasId });
          if (pinError) {
            if (idempotencyKey) await handleIdempotencyClear({ idempotencyKey });
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
            aktif: 1,
            sejakISO: todayISO(),
            sampaiISO: tambahHariISO(todayISO(), durasi),
            alasan: `Limit jajan harian Rp ${Number(santri.limitJajanHarian).toLocaleString("id-ID")} terlampaui (transaksi Rp ${jumlah.toLocaleString("id-ID")})`,
          };
        }
      }

      const delta = jenis === "Tarik Tunai" ? -jumlah : jumlah;
      const saldoSetelah = saldoSekarang + delta;
      const tISO = todayISO();
      const tLabel = todayLabel();
      const bLabel = bulan || tISO.slice(0, 7);
      const txId = uid();

      await query(
        `INSERT INTO "Ledger" ("id", "santriId", "jenis", "jumlah", "saldoSetelah", "referensi", "pelaku", "waktu")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [uid(), santriId, jenis, delta, saldoSetelah, txId, petugasId || unit || "sistem", new Date().toISOString()]
      );

      await query(
        `UPDATE "Santri" SET "saldo" = $1 ${
          blokirBaru ? ', "blokirAktif" = $2, "blokirSejakISO" = $3, "blokirSampaiISO" = $4, "blokirAlasan" = $5' : ""
        } WHERE "id" = ${blokirBaru ? '$6' : '$2'}`,
        blokirBaru
          ? [saldoSetelah, blokirBaru.aktif, blokirBaru.sejakISO, blokirBaru.sampaiISO, blokirBaru.alasan, santriId]
          : [saldoSetelah, santriId],
      );

      await query(
        `INSERT INTO "TransaksiCashless"
          ("id", "santriId", "unit", "jenis", "kategori", "subKategori", "jumlah", "keterangan", "saldoSetelah", "saldoSebelum", "saldoSesudah", "idempotencyKey", "tanggalISO", "tanggalLabel", "bulan", "metode")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [txId, santriId, unit, jenis, kategori || null, subKategori || null, jumlah, keterangan || null, saldoSetelah, saldoSekarang, saldoSetelah, idempotencyKey || null, tISO, tLabel, bLabel, metode || null],
      );

      const santriBaru = await getSantriRow(santriId);
      const result = {
        transaksi: { id: txId, santriId, unit, jenis, kategori, subKategori, jumlah, keterangan, saldoSetelah, saldoSebelum: saldoSekarang, saldoSesudah: saldoSetelah, idempotencyKey, tanggalISO: tISO, tanggalLabel: tLabel, bulan: bLabel, metode },
        santri: await toPublicSantri(santriBaru),
        lewatLimit,
      };

      if (idempotencyKey) {
        await handleIdempotencySave({ idempotencyKey, requestHash: idemCheck?.requestHash, response: result, statusCode: 201 });
      }

      return result;
    } catch (err) {
      if (idempotencyKey) await handleIdempotencyClear({ idempotencyKey });
      throw err;
    }
  });
}

async function catatTransaksi(params) {
  return catatTransaksiTx(params);
}

async function riwayatSantri(santriId) {
  const rows = await queryAll('SELECT * FROM "TransaksiCashless" WHERE "santriId" = $1 ORDER BY "createdAt" DESC', [santriId]);
  return rows.map((row) => ({
    id: row.id,
    santriId: row.santriId,
    unit: row.unit,
    jenis: row.jenis,
    kategori: row.kategori,
    subKategori: row.subKategori,
    jumlah: Number(row.jumlah),
    saldoSetelah: Number(row.saldoSetelah),
    saldoSebelum: Number(row.saldoSebelum ?? row.saldoSetelah),
    saldoSesudah: Number(row.saldoSesudah ?? row.saldoSetelah),
    keterangan: row.keterangan,
    tanggalISO: row.tanggalISO,
    tanggalLabel: row.tanggalLabel,
    bulan: row.bulan,
    metode: row.metode,
  }));
}

async function auditSaldo() {
  const rows = await queryAll(`
    SELECT s."id", s."nama", s."saldo",
      COALESCE(l."totalLedger", 0) AS "saldoLedger",
      COALESCE(t."totalTransactions", 0) AS "saldoTransactions"
    FROM "Santri" s
    LEFT JOIN (
      SELECT "santriId", SUM("jumlah") AS "totalLedger" FROM "Ledger" GROUP BY "santriId"
    ) l ON s."id" = l."santriId"
    LEFT JOIN (
      SELECT "santriId", SUM(CASE WHEN "jenis" = 'Tarik Tunai' THEN -"jumlah" ELSE "jumlah" END) AS "totalTransactions"
      FROM "TransaksiCashless" GROUP BY "santriId"
    ) t ON s."id" = t."santriId"
  `);
  const tidakCocok = rows.filter((row) => Number(row.saldo) !== Number(row.saldoLedger)).map((row) => ({
    id: row.id,
    nama: row.nama,
    saldo: Number(row.saldo),
    saldoLedger: Number(row.saldoLedger),
    saldoTransactions: Number(row.saldoTransactions),
    selisih: Number(row.saldo) - Number(row.saldoLedger),
  }));
  return { jumlahSantri: rows.length, jumlahTidakCocok: tidakCocok.length, tidakCocok };
}

async function koreksiSaldo({ santriId, jumlah, alasan, dikoreksiOleh, idempotencyKey }) {
  return withTransaction(async () => {
    const payload = { santriId, jumlah, alasan, dikoreksiOleh };
    const idemCheck = await handleIdempotencyCheck({ idempotencyKey, payload });
    if (idemCheck?.replay) return idemCheck.response;

    try {
      const nominal = Number(jumlah);
      if (!nominal) throw new CashlessError(400, "Jumlah koreksi tidak boleh nol.");
      if (!alasan?.trim()) throw new CashlessError(400, "Alasan koreksi wajib diisi.");

      const santri = await getSantriRow(santriId, true);
      const saldoSekarang = Number(santri.saldo || 0);
      const saldoSetelah = saldoSekarang + nominal;
      if (saldoSetelah < 0) {
        throw new CashlessError(400, `Koreksi tidak valid, saldo menjadi negatif (${saldoSetelah}).`);
      }

      const txId = uid();
      const jenisTx = nominal > 0 ? "Setor Tunai" : "Tarik Tunai";
      const absJumlah = Math.abs(nominal);

      await query(
        `INSERT INTO "Ledger" ("id", "santriId", "jenis", "jumlah", "saldoSetelah", "referensi", "pelaku", "waktu")
         VALUES ($1, $2, 'Koreksi', $3, $4, $5, $6, $7)`,
        [uid(), santriId, nominal, saldoSetelah, txId, dikoreksiOleh || "sistem", new Date().toISOString()]
      );

      await query('UPDATE "Santri" SET "saldo" = $1 WHERE "id" = $2', [saldoSetelah, santriId]);

      await query(
        `INSERT INTO "TransaksiCashless"
          ("id", "santriId", "unit", "jenis", "kategori", "jumlah", "keterangan", "saldoSetelah", "saldoSebelum", "saldoSesudah", "idempotencyKey", "tanggalISO", "tanggalLabel", "bulan", "metode")
         VALUES ($1, $2, 'BMT', $3, 'Koreksi Saldo', $4, $5, $6, $7, $8, $9, $10, $11, $12, 'koreksi')`,
        [txId, santriId, jenisTx, absJumlah, `Koreksi: ${alasan.trim()}`, saldoSetelah, saldoSekarang, saldoSetelah, idempotencyKey || null, todayISO(), todayLabel(), todayISO().slice(0, 7)]
      );

      const santriBaru = await getSantriRow(santriId);
      const res = {
        transaksiId: txId,
        santriId,
        jumlahKoreksi: nominal,
        saldoSebelum: saldoSekarang,
        saldoSetelah,
        alasan: alasan.trim(),
        santri: await toPublicSantri(santriBaru),
      };

      if (idempotencyKey) {
        await handleIdempotencySave({ idempotencyKey, requestHash: idemCheck?.requestHash, response: res, statusCode: 200 });
      }

      return res;
    } catch (err) {
      if (idempotencyKey) await handleIdempotencyClear({ idempotencyKey });
      throw err;
    }
  });
}

async function ajukanPermintaan({ santriId, waliId, jenis, nilaiDiminta, alasan, buktiTransfer }) {
  let bukti = null;
  if (jenis === "Top Up Saldo") {
    try {
      bukti = await decodeBuktiTransfer(buktiTransfer);
    } catch (error) {
      throw new CashlessError(400, error.message);
    }
  }

  return withTransaction(async () => {
    if (!JENIS_PERMINTAAN_BMT.includes(jenis)) throw new CashlessError(400, "Jenis permintaan tidak valid.");
    if (!alasan || typeof alasan !== "string" || !alasan.trim()) throw new CashlessError(400, "Alasan permintaan wajib diisi.");

    const santri = await getSantriRow(santriId, jenis === "Top Up Saldo");
    if (santri.waliId !== waliId) throw new CashlessError(403, "Santri ini bukan anak dari akun wali yang bersangkutan.");
    if (jenis !== "Buka Blokir Sekarang" && !nilaiDiminta) throw new CashlessError(400, "Nilai yang diminta wajib diisi.");

    const nominal = jenis === "Buka Blokir Sekarang" ? null : Number(nilaiDiminta);
    const settings = jenis === "Top Up Saldo" ? await getPengaturanTopUp() : null;

    if (jenis === "Top Up Saldo") {
      const duplikatHash = await queryOne(
        'SELECT "id" FROM "PermintaanBMT" WHERE "jenis" = \'Top Up Saldo\' AND "status" <> \'Ditolak\' AND "buktiHash" = $1',
        [bukti.hash],
      );
      if (duplikatHash) throw new CashlessError(409, "Bukti transfer ini sudah pernah dipakai.");
    }

    const id = uid();
    const tISO = todayISO();
    await query(
      `INSERT INTO "PermintaanBMT"
        ("id", "santriId", "waliId", "jenis", "nilaiDiminta", "alasan", "buktiTransfer", "buktiHash", "status", "tanggalAjukan", "nominalDisetujui")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Menunggu', $9, $10)`,
      [id, santriId, waliId, jenis, nominal, alasan.trim(), bukti ? buktiTransfer : null, bukti ? bukti.hash : null, tISO, nominal],
    );

    const row = await queryOne('SELECT * FROM "PermintaanBMT" WHERE "id" = $1', [id]);
    return sanitasiPermintaan(row, !!settings?.buktiDiDaftar);
  });
}

function sanitasiPermintaan(row, includeBukti = false) {
  if (!row) return null;
  const res = { ...row, nilaiDiminta: row.nilaiDiminta ? Number(row.nilaiDiminta) : null, nominalDisetujui: row.nominalDisetujui ? Number(row.nominalDisetujui) : null };
  if (!includeBukti) delete res.buktiTransfer;
  return res;
}

async function prosesPermintaan({ id, disetujui, diprosesOleh, diprosesOlehId, aktorRole, catatan, nominalDisetujui, referensiMutasi, idempotencyKey }) {
  return withTransaction(async () => {
    const payload = { id, disetujui, nominalDisetujui, referensiMutasi, catatan };
    const idemCheck = await handleIdempotencyCheck({ idempotencyKey, payload });
    if (idemCheck?.replay) return idemCheck.response;

    try {
      const row = await queryOne('SELECT * FROM "PermintaanBMT" WHERE "id" = $1 FOR UPDATE', [id]);
      if (!row) throw new CashlessError(404, "Permintaan tidak ditemukan.");
      if (row.status !== "Menunggu") throw new CashlessError(400, "Permintaan ini sudah diproses sebelumnya.");

      const isTopUp = row.jenis === "Top Up Saldo";
      const settings = isTopUp ? await getPengaturanTopUp() : null;

      if (disetujui && isTopUp) {
        const nominalFinal = nominalDisetujui !== undefined && nominalDisetujui !== null ? Number(nominalDisetujui) : Number(row.nilaiDiminta || 0);
        if (!nominalFinal || nominalFinal <= 0) throw new CashlessError(400, "Nominal disetujui harus lebih besar dari 0.");

        const santri = await getSantriRow(row.santriId, true);
        const saldoSekarang = Number(santri.saldo || 0);
        const saldoBaru = saldoSekarang + nominalFinal;

        await query(
          `INSERT INTO "Ledger" ("id", "santriId", "jenis", "jumlah", "saldoSetelah", "referensi", "pelaku", "waktu")
           VALUES ($1, $2, 'Top Up', $3, $4, $5, $6, $7)`,
          [uid(), row.santriId, nominalFinal, saldoBaru, id, diprosesOleh || diprosesOlehId || "BMT", new Date().toISOString()]
        );

        await query('UPDATE "Santri" SET "saldo" = $1 WHERE "id" = $2', [saldoBaru, row.santriId]);
        await query(
          `INSERT INTO "TransaksiCashless"
            ("id", "santriId", "unit", "jenis", "kategori", "jumlah", "keterangan", "saldoSetelah", "saldoSebelum", "saldoSesudah", "tanggalISO", "tanggalLabel", "bulan", "metode")
           VALUES ($1, $2, 'BMT', 'Setor Tunai', 'Setor Tunai', $3, $4, $5, $6, $7, $8, $9, $10, 'topup_approved')`,
          [uid(), row.santriId, nominalFinal, `Top Up BMT: ${row.alasan}`, saldoBaru, saldoSekarang, saldoBaru, todayISO(), todayLabel(), todayISO().slice(0, 7)],
        );

        await query(
          'UPDATE "PermintaanBMT" SET "status" = \'Disetujui\', "nominalDisetujui" = $1, "referensiMutasi" = $2, "diprosesOleh" = $3, "diprosesPada" = $4, "catatanBMT" = $5 WHERE "id" = $6',
          [nominalFinal, referensiMutasi || null, diprosesOleh, todayISO(), catatan || null, id],
        );
      } else {
        await query(
          'UPDATE "PermintaanBMT" SET "status" = $1, "diprosesOleh" = $2, "diprosesPada" = $3, "catatanBMT" = $4 WHERE "id" = $5',
          [disetujui ? "Disetujui" : "Ditolak", diprosesOleh, todayISO(), catatan || null, id],
        );
      }

      const finalRow = await queryOne('SELECT * FROM "PermintaanBMT" WHERE "id" = $1', [id]);
      const res = sanitasiPermintaan(finalRow, isTopUp ? !!settings.buktiDiDaftar : true);

      if (idempotencyKey) {
        await handleIdempotencySave({ idempotencyKey, requestHash: idemCheck?.requestHash, response: res, statusCode: 200 });
      }

      return res;
    } catch (err) {
      if (idempotencyKey) await handleIdempotencyClear({ idempotencyKey });
      throw err;
    }
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
  } catch (_) {
    throw new CashlessError(404, "Bukti transfer tidak tersedia atau formatnya tidak valid.");
  }
}

async function getPengaturanTopUp() {
  const row = await queryOne('SELECT "nilai" FROM "Pengaturan" WHERE "kunci" = \'topup_settings\'');
  if (!row) return { buktiDiDaftar: false, minTopUp: 10000, maksTopUp: 5000000 };
  try { return JSON.parse(row.nilai); } catch (_) { return { buktiDiDaftar: false, minTopUp: 10000, maksTopUp: 5000000 }; }
}

async function simpanPengaturanTopUp(settings) {
  const nilai = JSON.stringify(settings || {});
  await query(
    'INSERT INTO "Pengaturan" ("kunci", "nilai") VALUES ($1, $2) ON CONFLICT ("kunci") DO UPDATE SET "nilai" = EXCLUDED."nilai"',
    ["topup_settings", nilai],
  );
  return getPengaturanTopUp();
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

async function sinkronisasiOfflineKasir({ items, kasirId, unit }) {
  if (!Array.isArray(items) || !items.length) {
    throw new CashlessError(400, "Daftar antrian transaksi offline tidak boleh kosong.");
  }

  const hasilDetail = [];
  let suksesCount = 0;
  let gagalCount = 0;

  for (const item of items) {
    const { idempotencyKey, santriId, jenis, kategori, subKategori, jumlah, keterangan, bulan, pin, metode, items: itemProduk } = item || {};
    const itemUnit = unit || item.unit || "Kantin";

    if (!idempotencyKey || !santriId || !jumlah) {
      gagalCount++;
      hasilDetail.push({ idempotencyKey, status: "Gagal", pesanError: "Parameter transaksi offline tidak lengkap." });
      continue;
    }

    try {
      if (santriId === "UMUM") {
        const nominal = Number(jumlah);
        if (!nominal || nominal <= 0) {
          throw new CashlessError(400, "Jumlah belanja harus lebih dari 0.");
        }
        const { catatTransaksiUnitUsaha } = require("./keuanganService");
        const txUnit = await catatTransaksiUnitUsaha({
          jenis: "Dana Masuk",
          unitAsal: null,
          unitTujuan: itemUnit,
          jumlah: nominal,
          keterangan: keterangan || "Penjualan Kasir Umum (Offline Sync)",
          dicatatOleh: kasirId || "Kasir",
        });

        const listItems = itemProduk || item?.cartItems;
        if (Array.isArray(listItems) && listItems.length) {
          for (const it of listItems) {
            const qty = Number(it.qty || 1);
            if (qty > 0) {
              if (it.id) {
                await query(`UPDATE "ProdukUnitUsaha" SET "stok" = GREATEST(0, "stok" - $1) WHERE "id" = $2`, [qty, it.id]);
              } else if (it.nama) {
                await query(`UPDATE "ProdukUnitUsaha" SET "stok" = GREATEST(0, "stok" - $1) WHERE "nama" = $2 AND "unit" = $3`, [qty, it.nama, itemUnit]);
              }
            }
          }
        }

        suksesCount++;
        hasilDetail.push({ idempotencyKey, status: "Sukses", respons: { transaksi: txUnit } });
        await query(
          `INSERT INTO "QueueOfflineKasir" ("id", "idempotencyKey", "unit", "santriId", "jenis", "jumlah", "keterangan", "kasirId", "statusSync", "syncedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Sukses', to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
           ON CONFLICT ("idempotencyKey") DO UPDATE SET "statusSync" = 'Sukses', "syncedAt" = EXCLUDED."syncedAt"`,
          [uid(), idempotencyKey, itemUnit, santriId, "Dana Masuk", nominal, keterangan || null, kasirId || null]
        );
        continue;
      }

      const res = await catatTransaksi({
        santriId, unit: itemUnit, jenis: jenis || "Tarik Tunai", kategori: kategori || "Jajan Harian",
        subKategori, jumlah, keterangan, bulan, idempotencyKey,
        pin, validasiPin: (jenis || "Tarik Tunai") === "Tarik Tunai", petugasId: kasirId,
        metode: ["qr", "wajah", "manual", "kartu", "rfid", "cash", "cashless", "qris"].includes(metode) ? metode : "manual",
      });

      if (res.pinError) {
        gagalCount++;
        hasilDetail.push({ idempotencyKey, status: "Gagal", pesanError: res.pinError });
        await query(
          `INSERT INTO "QueueOfflineKasir" ("id", "idempotencyKey", "unit", "santriId", "jenis", "jumlah", "keterangan", "kasirId", "statusSync", "pesanError", "syncedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Ditolak', $9, to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
           ON CONFLICT ("idempotencyKey") DO UPDATE SET "statusSync" = 'Ditolak', "pesanError" = EXCLUDED."pesanError", "syncedAt" = EXCLUDED."syncedAt"`,
          [uid(), idempotencyKey, itemUnit, santriId, jenis || "Tarik Tunai", Number(jumlah), keterangan || null, kasirId || null, res.pinError]
        );
      } else {
        suksesCount++;
        hasilDetail.push({ idempotencyKey, status: "Sukses", respons: res });
        await query(
          `INSERT INTO "QueueOfflineKasir" ("id", "idempotencyKey", "unit", "santriId", "jenis", "jumlah", "keterangan", "kasirId", "statusSync", "syncedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Sukses', to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
           ON CONFLICT ("idempotencyKey") DO UPDATE SET "statusSync" = 'Sukses', "syncedAt" = EXCLUDED."syncedAt"`,
          [uid(), idempotencyKey, itemUnit, santriId, jenis || "Tarik Tunai", Number(jumlah), keterangan || null, kasirId || null]
        );
      }
    } catch (error) {
      gagalCount++;
      const msg = error.message || "Gagal sinkronisasi";
      hasilDetail.push({ idempotencyKey, status: "Gagal", pesanError: msg });
      await query(
        `INSERT INTO "QueueOfflineKasir" ("id", "idempotencyKey", "unit", "santriId", "jenis", "jumlah", "keterangan", "kasirId", "statusSync", "pesanError", "syncedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Ditolak', $9, to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
         ON CONFLICT ("idempotencyKey") DO UPDATE SET "statusSync" = 'Ditolak', "pesanError" = EXCLUDED."pesanError", "syncedAt" = EXCLUDED."syncedAt"`,
        [uid(), idempotencyKey, itemUnit, santriId, jenis || "Tarik Tunai", Number(jumlah), keterangan || null, kasirId || null, msg]
      );
    }
  }

  return { totalItem: items.length, suksesCount, gagalCount, hasilDetail };
}

async function laporanOfflineKasir({ page = 1, limit = 50, statusSync } = {}) {
  page = Math.max(1, Number(page || 1));
  limit = Math.min(100, Math.max(1, Number(limit || 50)));
  const offset = (page - 1) * limit;

  const kondisi = [];
  const params = [];
  if (statusSync && statusSync !== "Semua") {
    params.push(statusSync);
    kondisi.push(`q."statusSync" = $${params.length}`);
  }
  const where = kondisi.length ? `WHERE ${kondisi.join(" AND ")}` : "";

  const countQuery = `SELECT COUNT(*) AS "total" FROM "QueueOfflineKasir" q ${where}`;
  const itemsQuery = `
    SELECT q.*, s."nama" AS "namaSantri", s."kelas"
    FROM "QueueOfflineKasir" q
    LEFT JOIN "Santri" s ON q."santriId" = s."id"
    ${where}
    ORDER BY q."createdAt" DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  const [countRes, items] = await Promise.all([
    queryOne(countQuery, params),
    queryAll(itemsQuery, [...params, limit, offset]),
  ]);

  const total = Number(countRes?.total || 0);
  return {
    data: items.map((row) => ({
      ...row,
      jumlah: Number(row.jumlah),
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

module.exports = {
  CashlessError,
  DEFAULT_DURASI_BLOKIR_HARI, JENIS_TRANSAKSI_BMT, KATEGORI_TRANSAKSI_BMT, JENIS_PERMINTAAN_BMT,
  uid, todayISO, todayLabel, tambahHariISO, formatTanggalISO,
  getSantriRow, terpakaiHariIni, sisaLimitHarian, isBlokirAktif, toPublicSantri, toSaldoPublik, SANTRI_BIODATA_FIELDS,
  catatTransaksi, riwayatSantri, auditSaldo, koreksiSaldo, ajukanPermintaan, prosesPermintaan,
  daftarPermintaan, daftarPermintaanWali, ambilBuktiTransfer,
  getPengaturanTopUp, simpanPengaturanTopUp, daftarAudit, laporanTopUpHarian,
  sinkronisasiOfflineKasir, laporanOfflineKasir,
  computePayloadHash, handleIdempotencyCheck, handleIdempotencySave, handleIdempotencyClear,
};
