const crypto = require("crypto");
const { query, queryOne, queryAll } = require("./db");
const { CashlessError } = require("./cashlessService");

const uid = () => crypto.randomUUID();
const todayISO = () => new Date().toISOString().slice(0, 10);

// Hafalan (LPTQ)
async function semuaHafalan() {
  return queryAll(`
    SELECT h.*, s."nama" AS "namaSantri", s."kelas"
    FROM "Hafalan" h
    LEFT JOIN "Santri" s ON h."santriId" = s."id"
    ORDER BY h."createdAt" DESC
  `);
}

async function catatHafalan({ santriId, juz, dicatatOleh }) {
  if (!santriId || !juz) throw new CashlessError(400, "santriId dan juz wajib diisi.");
  const id = uid();
  const tISO = todayISO();
  await query(
    `INSERT INTO "Hafalan" ("id", "santriId", "juz", "tanggalISO", "dicatatOleh")
     VALUES ($1, $2, $3, $4, $5)`,
    [id, santriId, String(juz), tISO, dicatatOleh || null],
  );
  return queryOne('SELECT * FROM "Hafalan" WHERE "id" = $1', [id]);
}

async function hapusHafalan(id) {
  const row = await queryOne('SELECT * FROM "Hafalan" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Data hafalan tidak ditemukan.");
  await query('DELETE FROM "Hafalan" WHERE "id" = $1', [id]);
  return { id, deleted: true };
}

// Penilaian Ubudiyah (LPTQ)
async function semuaUbudiyah() {
  return queryAll(`
    SELECT u.*, s."nama" AS "namaSantri", s."kelas"
    FROM "PenilaianUbudiyah" u
    LEFT JOIN "Santri" s ON u."santriId" = s."id"
    ORDER BY u."createdAt" DESC
  `);
}

async function catatUbudiyah({ santriId, jenis, materi, predikat, catatan, dicatatOleh }) {
  if (!santriId || !jenis || !predikat) throw new CashlessError(400, "santriId, jenis, dan predikat wajib diisi.");
  const id = uid();
  const tISO = todayISO();
  await query(
    `INSERT INTO "PenilaianUbudiyah" ("id", "santriId", "jenis", "materi", "predikat", "catatan", "tanggalISO", "dicatatOleh")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, santriId, jenis, materi || null, predikat, catatan || null, tISO, dicatatOleh || null],
  );
  return queryOne('SELECT * FROM "PenilaianUbudiyah" WHERE "id" = $1', [id]);
}

async function hapusUbudiyah(id) {
  const row = await queryOne('SELECT * FROM "PenilaianUbudiyah" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Data ubudiyah tidak ditemukan.");
  await query('DELETE FROM "PenilaianUbudiyah" WHERE "id" = $1', [id]);
  return { id, deleted: true };
}

// Nilai Akademik (Pengajaran)
async function semuaNilai() {
  return queryAll(`
    SELECT n.*, s."nama" AS "namaSantri", s."kelas"
    FROM "Nilai" n
    LEFT JOIN "Santri" s ON n."santriId" = s."id"
    ORDER BY n."createdAt" DESC
  `);
}

async function catatNilai({ santriId, mapel, nilai, dicatatOleh }) {
  if (!santriId || !mapel || nilai === undefined || nilai === null) {
    throw new CashlessError(400, "santriId, mapel, dan nilai wajib diisi.");
  }
  const numNilai = Number(nilai);
  if (Number.isNaN(numNilai) || numNilai < 0 || numNilai > 100) {
    throw new CashlessError(400, "Nilai harus berupa angka antara 0 sampai 100.");
  }
  const id = uid();
  const tISO = todayISO();
  await query(
    `INSERT INTO "Nilai" ("id", "santriId", "mapel", "nilai", "tanggalISO", "dicatatOleh")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, santriId, mapel.trim(), numNilai, tISO, dicatatOleh || null],
  );
  return queryOne('SELECT * FROM "Nilai" WHERE "id" = $1', [id]);
}

async function hapusNilai(id) {
  const row = await queryOne('SELECT * FROM "Nilai" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Data nilai tidak ditemukan.");
  await query('DELETE FROM "Nilai" WHERE "id" = $1', [id]);
  return { id, deleted: true };
}

// Prestasi (Pengajaran)
async function semuaPrestasi() {
  return queryAll(`
    SELECT p.*, s."nama" AS "namaSantri", s."kelas"
    FROM "Prestasi" p
    LEFT JOIN "Santri" s ON p."santriId" = s."id"
    ORDER BY p."createdAt" DESC
  `);
}

async function catatPrestasi({ santriId, judul, tingkat, dicatatOleh }) {
  if (!santriId || !judul) throw new CashlessError(400, "santriId dan judul prestasi wajib diisi.");
  const id = uid();
  const tISO = todayISO();
  await query(
    `INSERT INTO "Prestasi" ("id", "santriId", "judul", "tingkat", "tanggalISO", "dicatatOleh")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, santriId, judul.trim(), tingkat || null, tISO, dicatatOleh || null],
  );
  return queryOne('SELECT * FROM "Prestasi" WHERE "id" = $1', [id]);
}

async function hapusPrestasi(id) {
  const row = await queryOne('SELECT * FROM "Prestasi" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Data prestasi tidak ditemukan.");
  await query('DELETE FROM "Prestasi" WHERE "id" = $1', [id]);
  return { id, deleted: true };
}

module.exports = {
  semuaHafalan, catatHafalan, hapusHafalan,
  semuaUbudiyah, catatUbudiyah, hapusUbudiyah,
  semuaNilai, catatNilai, hapusNilai,
  semuaPrestasi, catatPrestasi, hapusPrestasi,
};
