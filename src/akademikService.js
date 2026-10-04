const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("./db");
const { CashlessError, getSantriRow, todayISO } = require("./cashlessService");
const { recordAudit } = require("./auditLog");

const uid = () => crypto.randomUUID();
const PREDIKAT_LIST = ["Sangat Baik", "Baik", "Cukup", "Perlu Bimbingan"];

async function catatNilai({ santriId, mapel, nilai, dicatatOleh }) {
  return withTransaction(async () => {
    await getSantriRow(santriId);
    if (!mapel || nilai === undefined || nilai === null || nilai === "") throw new CashlessError(400, "Mata pelajaran dan nilai wajib diisi.");
    const row = { id: uid(), santriId, mapel, nilai: Number(nilai), tanggalISO: todayISO(), dicatatOleh: dicatatOleh || null };
    await query('INSERT INTO "Nilai" ("id", "santriId", "mapel", "nilai", "tanggalISO", "dicatatOleh") VALUES ($1, $2, $3, $4, $5, $6)',
      [row.id, row.santriId, row.mapel, row.nilai, row.tanggalISO, row.dicatatOleh]);
    return row;
  });
}
const semuaNilai = () => queryAll('SELECT * FROM "Nilai" ORDER BY "createdAt" DESC');
async function hapusNilai(id, actorId) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "Nilai" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Data nilai tidak ditemukan.");
    await query('DELETE FROM "Nilai" WHERE "id" = $1', [id]);
    await recordAudit({ actorId, actorRole: "guru", action: "data.nilai_deleted", targetType: "Nilai", targetId: id });
    return row;
  });
}

async function catatPrestasi({ santriId, judul, tingkat, dicatatOleh }) {
  return withTransaction(async () => {
    await getSantriRow(santriId);
    if (!judul) throw new CashlessError(400, "Judul prestasi wajib diisi.");
    const row = { id: uid(), santriId, judul, tingkat: tingkat || null, tanggalISO: todayISO(), dicatatOleh: dicatatOleh || null };
    await query('INSERT INTO "Prestasi" ("id", "santriId", "judul", "tingkat", "tanggalISO", "dicatatOleh") VALUES ($1, $2, $3, $4, $5, $6)',
      [row.id, row.santriId, row.judul, row.tingkat, row.tanggalISO, row.dicatatOleh]);
    return row;
  });
}
const semuaPrestasi = () => queryAll('SELECT * FROM "Prestasi" ORDER BY "createdAt" DESC');
async function hapusPrestasi(id, actorId) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "Prestasi" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Data prestasi tidak ditemukan.");
    await query('DELETE FROM "Prestasi" WHERE "id" = $1', [id]);
    await recordAudit({ actorId, actorRole: "guru", action: "data.prestasi_deleted", targetType: "Prestasi", targetId: id });
    return row;
  });
}

async function catatHafalan({ santriId, juz, dicatatOleh }) {
  return withTransaction(async () => {
    await getSantriRow(santriId);
    if (!juz) throw new CashlessError(400, "Juz/Surah/materi wajib diisi.");
    const row = { id: uid(), santriId, juz, tanggalISO: todayISO(), dicatatOleh: dicatatOleh || null };
    await query('INSERT INTO "Hafalan" ("id", "santriId", "juz", "tanggalISO", "dicatatOleh") VALUES ($1, $2, $3, $4, $5)',
      [row.id, row.santriId, row.juz, row.tanggalISO, row.dicatatOleh]);
    return row;
  });
}
const semuaHafalan = () => queryAll('SELECT * FROM "Hafalan" ORDER BY "createdAt" DESC');
async function hapusHafalan(id, actorId) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "Hafalan" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Data hafalan tidak ditemukan.");
    await query('DELETE FROM "Hafalan" WHERE "id" = $1', [id]);
    await recordAudit({ actorId, actorRole: "guru", action: "data.hafalan_deleted", targetType: "Hafalan", targetId: id });
    return row;
  });
}

async function catatUbudiyah({ santriId, jenis, materi, predikat, catatan, dicatatOleh }) {
  return withTransaction(async () => {
    await getSantriRow(santriId);
    if (!jenis || !predikat) throw new CashlessError(400, "Jenis dan predikat wajib diisi.");
    if (!PREDIKAT_LIST.includes(predikat)) throw new CashlessError(400, "Predikat tidak valid.");
    const row = { id: uid(), santriId, jenis, materi: materi || null, predikat, catatan: catatan || null, tanggalISO: todayISO(), dicatatOleh: dicatatOleh || null };
    await query('INSERT INTO "PenilaianUbudiyah" ("id", "santriId", "jenis", "materi", "predikat", "catatan", "tanggalISO", "dicatatOleh") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [row.id, row.santriId, row.jenis, row.materi, row.predikat, row.catatan, row.tanggalISO, row.dicatatOleh]);
    return row;
  });
}
const semuaUbudiyah = () => queryAll('SELECT * FROM "PenilaianUbudiyah" ORDER BY "createdAt" DESC');
async function hapusUbudiyah(id, actorId) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "PenilaianUbudiyah" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Data penilaian ubudiyah tidak ditemukan.");
    await query('DELETE FROM "PenilaianUbudiyah" WHERE "id" = $1', [id]);
    await recordAudit({ actorId, actorRole: "guru", action: "data.ubudiyah_deleted", targetType: "PenilaianUbudiyah", targetId: id });
    return row;
  });
}

module.exports = {
  PREDIKAT_LIST,
  catatNilai, semuaNilai, hapusNilai,
  catatPrestasi, semuaPrestasi, hapusPrestasi,
  catatHafalan, semuaHafalan, hapusHafalan,
  catatUbudiyah, semuaUbudiyah, hapusUbudiyah,
};