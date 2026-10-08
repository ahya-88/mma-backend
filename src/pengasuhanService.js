const crypto = require("crypto");
const { query, queryOne, queryAll } = require("./db");
const { CashlessError, getSantriRow, toPublicSantri } = require("./cashlessService");

const uid = () => crypto.randomUUID();
const todayISO = () => new Date().toISOString().slice(0, 10);

// Profil Pengasuhan
async function profilPengasuhan(santriId) {
  const santri = await getSantriRow(santriId);
  const [absensi, perizinan, pelanggaran] = await Promise.all([
    queryAll('SELECT * FROM "Absensi" WHERE "santriId" = $1 ORDER BY "tanggalISO" DESC LIMIT 30', [santriId]),
    queryAll('SELECT * FROM "Perizinan" WHERE "santriId" = $1 ORDER BY "createdAt" DESC LIMIT 30', [santriId]),
    queryAll('SELECT * FROM "Pelanggaran" WHERE "santriId" = $1 ORDER BY "tanggalISO" DESC LIMIT 30', [santriId]),
  ]);
  const totalPoinPelanggaran = pelanggaran.reduce((sum, p) => sum + Number(p.poin || 0), 0);

  return {
    santri: await toPublicSantri(santri),
    absensi,
    perizinan,
    pelanggaran,
    totalPoinPelanggaran,
  };
}

// Absensi
async function catatAbsensi({ santriId, tanggalISO, status, keterangan, dicatatOleh }) {
  if (!santriId || !status) throw new CashlessError(400, "santriId dan status absensi wajib diisi.");
  const tISO = tanggalISO || todayISO();
  const id = uid();
  await query(
    `INSERT INTO "Absensi" ("id", "santriId", "tanggalISO", "status", "keterangan", "dicatatOleh")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, santriId, tISO, status, keterangan || null, dicatatOleh || null],
  );
  return queryOne('SELECT * FROM "Absensi" WHERE "id" = $1', [id]);
}

async function absensiPadaTanggal(tanggalISO) {
  const tISO = tanggalISO || todayISO();
  return queryAll(`
    SELECT a.*, s."nama" AS "namaSantri", s."kelas"
    FROM "Absensi" a
    LEFT JOIN "Santri" s ON a."santriId" = s."id"
    WHERE a."tanggalISO" = $1
    ORDER BY s."nama"
  `, [tISO]);
}

async function riwayatAbsensi(santriId) {
  return queryAll('SELECT * FROM "Absensi" WHERE "santriId" = $1 ORDER BY "tanggalISO" DESC', [santriId]);
}

// Perizinan
async function ajukanPerizinan({ santriId, jenis, tanggalKeluar, tanggalKembali, alasan, diajukanOleh }) {
  if (!santriId || !jenis || !alasan) throw new CashlessError(400, "santriId, jenis, dan alasan perizinan wajib diisi.");
  const id = uid();
  const tKeluar = tanggalKeluar || todayISO();
  await query(
    `INSERT INTO "Perizinan" ("id", "santriId", "jenis", "tanggalKeluar", "tanggalKembali", "alasan", "status", "diajukanOleh")
     VALUES ($1, $2, $3, $4, $5, $6, 'Menunggu', $7)`,
    [id, santriId, jenis, tKeluar, tanggalKembali || null, alasan.trim(), diajukanOleh || null],
  );
  return queryOne('SELECT * FROM "Perizinan" WHERE "id" = $1', [id]);
}

async function daftarPerizinan({ santriId, status } = {}) {
  const kondisi = [];
  const params = [];
  if (santriId) { params.push(santriId); kondisi.push(`p."santriId" = $${params.length}`); }
  if (status && status !== "Semua") { params.push(status); kondisi.push(`p."status" = $${params.length}`); }
  const where = kondisi.length ? `WHERE ${kondisi.join(" AND ")}` : "";

  return queryAll(`
    SELECT p.*, s."nama" AS "namaSantri", s."kelas"
    FROM "Perizinan" p
    LEFT JOIN "Santri" s ON p."santriId" = s."id"
    ${where}
    ORDER BY p."createdAt" DESC
  `, params);
}

async function prosesPerizinan({ id, statusBaru, disetujuiOleh }) {
  if (!["Disetujui", "Ditolak"].includes(statusBaru)) {
    throw new CashlessError(400, "Status baru harus 'Disetujui' atau 'Ditolak'.");
  }
  const row = await queryOne('SELECT * FROM "Perizinan" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Data perizinan tidak ditemukan.");

  await query(
    'UPDATE "Perizinan" SET "status" = $1, "disetujuiOleh" = $2, "tanggalProses" = $3 WHERE "id" = $4',
    [statusBaru, disetujuiOleh || null, todayISO(), id],
  );

  return queryOne('SELECT * FROM "Perizinan" WHERE "id" = $1', [id]);
}

// Pelanggaran
async function catatPelanggaran({ santriId, jenis, poin, tanggalISO, keterangan, dicatatOleh }) {
  if (!santriId || !jenis) throw new CashlessError(400, "santriId dan jenis pelanggaran wajib diisi.");
  const id = uid();
  const tISO = tanggalISO || todayISO();
  const numPoin = Number(poin || 0);
  await query(
    `INSERT INTO "Pelanggaran" ("id", "santriId", "jenis", "poin", "tanggalISO", "keterangan", "dicatatOleh")
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, santriId, jenis, numPoin, tISO, keterangan || null, dicatatOleh || null],
  );
  return queryOne('SELECT * FROM "Pelanggaran" WHERE "id" = $1', [id]);
}

async function semuaPelanggaran() {
  return queryAll(`
    SELECT p.*, s."nama" AS "namaSantri", s."kelas"
    FROM "Pelanggaran" p
    LEFT JOIN "Santri" s ON p."santriId" = s."id"
    ORDER BY p."tanggalISO" DESC
  `);
}

async function riwayatPelanggaran(santriId) {
  return queryAll('SELECT * FROM "Pelanggaran" WHERE "santriId" = $1 ORDER BY "tanggalISO" DESC', [santriId]);
}

async function hapusPelanggaran(id) {
  const row = await queryOne('SELECT * FROM "Pelanggaran" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Data pelanggaran tidak ditemukan.");
  await query('DELETE FROM "Pelanggaran" WHERE "id" = $1', [id]);
  return { id, deleted: true };
}

module.exports = {
  profilPengasuhan,
  catatAbsensi, absensiPadaTanggal, riwayatAbsensi,
  ajukanPerizinan, daftarPerizinan, prosesPerizinan,
  catatPelanggaran, semuaPelanggaran, riwayatPelanggaran, hapusPelanggaran,
};
