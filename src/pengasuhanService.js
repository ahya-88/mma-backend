const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("./db");
const { CashlessError, getSantriRow, todayISO, todayLabel } = require("./cashlessService");

const uid = () => crypto.randomUUID();
const STATUS_ABSENSI = ["Hadir", "Sakit", "Izin", "Alpa"];
const STATUS_PERIZINAN = ["Menunggu", "Disetujui", "Ditolak", "Selesai"];

async function catatAbsensi({ santriId, tanggalISO, status, keterangan, dicatatOleh }) {
  return withTransaction(async () => {
    await getSantriRow(santriId, true);
    if (!STATUS_ABSENSI.includes(status)) throw new CashlessError(400, "Status absensi tidak valid.");
    const tanggal = tanggalISO || todayISO();
    const ada = await queryOne('SELECT "id" FROM "Absensi" WHERE "santriId" = $1 AND "tanggalISO" = $2 FOR UPDATE', [santriId, tanggal]);
    if (ada) {
      await query('UPDATE "Absensi" SET "status" = $1, "keterangan" = $2, "dicatatOleh" = $3 WHERE "id" = $4',
        [status, keterangan || null, dicatatOleh || null, ada.id]);
      return queryOne('SELECT * FROM "Absensi" WHERE "id" = $1', [ada.id]);
    }
    const row = { id: uid(), santriId, tanggalISO: tanggal, status, keterangan: keterangan || null, dicatatOleh: dicatatOleh || null };
    await query('INSERT INTO "Absensi" ("id", "santriId", "tanggalISO", "status", "keterangan", "dicatatOleh") VALUES ($1, $2, $3, $4, $5, $6)',
      [row.id, row.santriId, row.tanggalISO, row.status, row.keterangan, row.dicatatOleh]);
    return queryOne('SELECT * FROM "Absensi" WHERE "id" = $1', [row.id]);
  });
}

async function riwayatAbsensi(santriId) {
  await getSantriRow(santriId);
  const rows = await queryAll('SELECT * FROM "Absensi" WHERE "santriId" = $1 ORDER BY "tanggalISO" DESC', [santriId]);
  const rekap = Object.fromEntries(STATUS_ABSENSI.map((status) => [status, rows.filter((row) => row.status === status).length]));
  return { rows, rekap };
}

const absensiPadaTanggal = (tanggalISO) => queryAll('SELECT * FROM "Absensi" WHERE "tanggalISO" = $1', [tanggalISO || todayISO()]);

async function ajukanPerizinan({ santriId, jenis, tanggalKeluar, tanggalKembali, alasan, diajukanOleh }) {
  return withTransaction(async () => {
    await getSantriRow(santriId);
    if (!jenis || !tanggalKeluar) throw new CashlessError(400, "Jenis izin dan tanggal keluar wajib diisi.");
    const row = {
      id: uid(), santriId, jenis, tanggalKeluar, tanggalKembali: tanggalKembali || null, alasan: alasan || null,
      status: "Menunggu", diajukanOleh: diajukanOleh || null, disetujuiOleh: null, tanggalProses: null,
    };
    await query('INSERT INTO "Perizinan" ("id", "santriId", "jenis", "tanggalKeluar", "tanggalKembali", "alasan", "status", "diajukanOleh", "disetujuiOleh", "tanggalProses") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [row.id, row.santriId, row.jenis, row.tanggalKeluar, row.tanggalKembali, row.alasan, row.status, row.diajukanOleh, row.disetujuiOleh, row.tanggalProses]);
    return queryOne('SELECT * FROM "Perizinan" WHERE "id" = $1', [row.id]);
  });
}

async function prosesPerizinan({ id, statusBaru, disetujuiOleh }) {
  return withTransaction(async () => {
    if (!STATUS_PERIZINAN.includes(statusBaru)) throw new CashlessError(400, "Status perizinan tidak valid.");
    const perizinan = await queryOne('SELECT * FROM "Perizinan" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!perizinan) throw new CashlessError(404, "Data perizinan tidak ditemukan.");
    await query('UPDATE "Perizinan" SET "status" = $1, "disetujuiOleh" = $2, "tanggalProses" = $3 WHERE "id" = $4',
      [statusBaru, disetujuiOleh || null, todayLabel(), id]);
    return queryOne('SELECT * FROM "Perizinan" WHERE "id" = $1', [id]);
  });
}

async function daftarPerizinan({ santriId, status } = {}) {
  const conditions = [];
  const params = [];
  if (santriId) { params.push(santriId); conditions.push(`"santriId" = $${params.length}`); }
  if (status && status !== "Semua") { params.push(status); conditions.push(`"status" = $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return queryAll(`SELECT * FROM "Perizinan" ${where} ORDER BY "createdAt" DESC`, params);
}

async function catatPelanggaran({ santriId, jenis, poin, tanggalISO, keterangan, dicatatOleh }) {
  return withTransaction(async () => {
    await getSantriRow(santriId);
    if (!jenis) throw new CashlessError(400, "Jenis pelanggaran wajib diisi.");
    const row = { id: uid(), santriId, jenis, poin: Number(poin) || 0, tanggalISO: tanggalISO || todayISO(), keterangan: keterangan || null, dicatatOleh: dicatatOleh || null };
    await query('INSERT INTO "Pelanggaran" ("id", "santriId", "jenis", "poin", "tanggalISO", "keterangan", "dicatatOleh") VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [row.id, row.santriId, row.jenis, row.poin, row.tanggalISO, row.keterangan, row.dicatatOleh]);
    return queryOne('SELECT * FROM "Pelanggaran" WHERE "id" = $1', [row.id]);
  });
}

async function riwayatPelanggaran(santriId) {
  await getSantriRow(santriId);
  const rows = await queryAll('SELECT * FROM "Pelanggaran" WHERE "santriId" = $1 ORDER BY "createdAt" DESC', [santriId]);
  return { rows, totalPoin: rows.reduce((total, row) => total + Number(row.poin), 0) };
}

const semuaPelanggaran = () => queryAll('SELECT * FROM "Pelanggaran" ORDER BY "createdAt" DESC');

async function hapusPelanggaran(id) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "Pelanggaran" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Data pelanggaran tidak ditemukan.");
    await query('DELETE FROM "Pelanggaran" WHERE "id" = $1', [id]);
    return row;
  });
}

async function profilPengasuhan(santriId) {
  const santri = await getSantriRow(santriId);
  const { rekap } = await riwayatAbsensi(santriId);
  const { totalPoin } = await riwayatPelanggaran(santriId);
  const perizinanAktif = await queryAll('SELECT * FROM "Perizinan" WHERE "santriId" = $1 AND "status" IN (\'Menunggu\', \'Disetujui\') ORDER BY "createdAt" DESC', [santriId]);
  return { santri: { id: santri.id, nama: santri.nama, kelas: santri.kelas, nis: santri.nis, nisn: santri.nisn }, rekapAbsensi: rekap, totalPoinPelanggaran: totalPoin, perizinanAktif };
}

module.exports = {
  STATUS_ABSENSI, STATUS_PERIZINAN,
  catatAbsensi, riwayatAbsensi, absensiPadaTanggal,
  ajukanPerizinan, prosesPerizinan, daftarPerizinan,
  catatPelanggaran, riwayatPelanggaran, semuaPelanggaran, hapusPelanggaran,
  profilPengasuhan,
};