const crypto = require("crypto");
const { query, queryOne, queryAll } = require("./db");
const { CashlessError } = require("./cashlessService");

const uid = () => crypto.randomUUID();
const todayISO = () => new Date().toISOString().slice(0, 10);

// Hafalan (LPTQ)
async function semuaHafalan(santriId) {
  const params = [];
  let where = "";
  if (santriId) {
    params.push(santriId);
    where = 'WHERE h."santriId" = $1';
  }
  return queryAll(`
    SELECT h.*, s."nama" AS "namaSantri", s."kelas"
    FROM "Hafalan" h
    LEFT JOIN "Santri" s ON h."santriId" = s."id"
    ${where}
    ORDER BY h."createdAt" DESC
  `, params);
}

async function catatHafalan({ santriId, juz, surah, ayat, predikat, nilaiTajwid, nilaiFashahah, dicatatOleh }) {
  if (!santriId || (!juz && !surah)) throw new CashlessError(400, "santriId dan juz atau surah wajib diisi.");
  const id = uid();
  const tISO = todayISO();
  const juzVal = juz ? String(juz) : (surah ? `Surah ${surah}` : "Juz -");
  await query(
    `INSERT INTO "Hafalan" (
      "id", "santriId", "juz", "surah", "ayat", "predikat", "nilaiTajwid", "nilaiFashahah", "tanggalISO", "dicatatOleh"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id, santriId, juzVal, surah || null, ayat || null, predikat || null,
      nilaiTajwid ? Number(nilaiTajwid) : null, nilaiFashahah ? Number(nilaiFashahah) : null,
      tISO, dicatatOleh || null,
    ],
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
async function semuaNilai({ santriId, tahunAjaran, semester, mapel } = {}) {
  const conditions = [];
  const params = [];
  if (santriId) {
    params.push(santriId);
    conditions.push(`n."santriId" = $${params.length}`);
  }
  if (tahunAjaran) {
    params.push(tahunAjaran);
    conditions.push(`n."tahunAjaran" = $${params.length}`);
  }
  if (semester) {
    params.push(semester);
    conditions.push(`n."semester" = $${params.length}`);
  }
  if (mapel) {
    params.push(mapel);
    conditions.push(`n."mapel" = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return queryAll(`
    SELECT n.*, s."nama" AS "namaSantri", s."kelas"
    FROM "Nilai" n
    LEFT JOIN "Santri" s ON n."santriId" = s."id"
    ${where}
    ORDER BY n."createdAt" DESC
  `, params);
}

async function catatNilai({ santriId, mapel, nilai, tahunAjaran, semester, jenisNilai, dicatatOleh }) {
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
    `INSERT INTO "Nilai" ("id", "santriId", "mapel", "nilai", "tahunAjaran", "semester", "jenisNilai", "tanggalISO", "dicatatOleh")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, santriId, mapel.trim(), numNilai, tahunAjaran || null, semester || null, jenisNilai || null, tISO, dicatatOleh || null],
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

async function nilaiPerSantri(santriId) {
  return queryAll('SELECT * FROM "Nilai" WHERE "santriId" = $1 ORDER BY "createdAt" DESC', [santriId]);
}

// ==================== RAPORT AKADEMIK ====================
async function simpanRaportAkademik({
  id, santriId, tahunAjaran, semester, peringkat, totalSantri, rataRata, catatan,
  ringkasanRows, status, namaPembina, tanggalCetak, pimpinanId, pimpinanNama, pimpinanJabatan, dibuatOleh,
}) {
  if (!santriId || !tahunAjaran || !semester) {
    throw new CashlessError(400, "santriId, tahunAjaran, dan semester wajib diisi.");
  }
  const raportId = id || uid();
  const stat = status || "PUBLISHED";
  const rowsJson = JSON.stringify(ringkasanRows || []);
  const now = new Date().toISOString();

  await query(`
    INSERT INTO "RaportAkademik" (
      "id", "santriId", "tahunAjaran", "semester", "peringkat", "totalSantri", "rataRata",
      "catatan", "ringkasanRows", "status", "namaPembina", "tanggalCetak",
      "pimpinanId", "pimpinanNama", "pimpinanJabatan", "dibuatOleh", "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    ON CONFLICT ("santriId", "tahunAjaran", "semester")
    DO UPDATE SET
      "peringkat" = EXCLUDED."peringkat",
      "totalSantri" = EXCLUDED."totalSantri",
      "rataRata" = EXCLUDED."rataRata",
      "catatan" = EXCLUDED."catatan",
      "ringkasanRows" = EXCLUDED."ringkasanRows",
      "status" = EXCLUDED."status",
      "namaPembina" = EXCLUDED."namaPembina",
      "tanggalCetak" = EXCLUDED."tanggalCetak",
      "pimpinanId" = EXCLUDED."pimpinanId",
      "pimpinanNama" = EXCLUDED."pimpinanNama",
      "pimpinanJabatan" = EXCLUDED."pimpinanJabatan",
      "updatedAt" = EXCLUDED."updatedAt"
  `, [
    raportId, santriId, String(tahunAjaran).trim(), String(semester).trim(),
    peringkat ? String(peringkat).trim() : null,
    totalSantri ? Number(totalSantri) : null,
    rataRata ? Number(rataRata) : null,
    catatan || null, rowsJson, stat,
    namaPembina || null, tanggalCetak || null,
    pimpinanId || null, pimpinanNama || null, pimpinanJabatan || null,
    dibuatOleh || null, now,
  ]);

  return queryOne('SELECT * FROM "RaportAkademik" WHERE "santriId" = $1 AND "tahunAjaran" = $2 AND "semester" = $3', [santriId, tahunAjaran, semester]);
}

async function semuaRaportAkademik({ santriId, tahunAjaran, semester, status } = {}) {
  const conditions = [];
  const params = [];
  if (santriId) {
    params.push(santriId);
    conditions.push(`r."santriId" = $${params.length}`);
  }
  if (tahunAjaran) {
    params.push(tahunAjaran);
    conditions.push(`r."tahunAjaran" = $${params.length}`);
  }
  if (semester) {
    params.push(semester);
    conditions.push(`r."semester" = $${params.length}`);
  }
  if (status && status !== "Semua") {
    params.push(status);
    conditions.push(`r."status" = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return queryAll(`
    SELECT r.*, s."nama" AS "namaSantri", s."kelas", s."nis", s."nisn"
    FROM "RaportAkademik" r
    LEFT JOIN "Santri" s ON r."santriId" = s."id"
    ${where}
    ORDER BY r."createdAt" DESC
  `, params);
}

async function hapusRaportAkademik(id) {
  const row = await queryOne('SELECT * FROM "RaportAkademik" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Data raport akademik tidak ditemukan.");
  await query('DELETE FROM "RaportAkademik" WHERE "id" = $1', [id]);
  return { id, deleted: true };
}

async function hitungRankingKelas({ kelas, tahunAjaran, semester }) {
  if (!kelas) throw new CashlessError(400, "Kelas wajib diisi.");
  const santriList = await queryAll('SELECT "id", "nama", "kelas" FROM "Santri" WHERE "kelas" = $1 AND "is_deleted" = FALSE', [kelas]);
  if (!santriList.length) return [];

  const params = [kelas];
  let periodeFilter = "";
  if (tahunAjaran) {
    params.push(tahunAjaran);
    periodeFilter += ` AND (n."tahunAjaran" = $${params.length} OR n."tahunAjaran" IS NULL)`;
  }
  if (semester) {
    params.push(semester);
    periodeFilter += ` AND (n."semester" = $${params.length} OR n."semester" IS NULL)`;
  }

  const nilaiRows = await queryAll(`
    SELECT n."santriId", n."mapel", n."nilai"
    FROM "Nilai" n
    JOIN "Santri" s ON n."santriId" = s."id"
    WHERE s."kelas" = $1 AND s."is_deleted" = FALSE ${periodeFilter}
  `, params);

  const nilaiMap = {};
  nilaiRows.forEach((r) => {
    if (!nilaiMap[r.santriId]) nilaiMap[r.santriId] = [];
    nilaiMap[r.santriId].push(Number(r.nilai));
  });

  const rankingList = santriList.map((s) => {
    const scores = nilaiMap[s.id] || [];
    const rataRata = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0;
    return {
      santriId: s.id,
      nama: s.nama,
      kelas: s.kelas,
      jumlahMapel: scores.length,
      rataRata,
    };
  });

  rankingList.sort((a, b) => b.rataRata - a.rataRata);
  const total = rankingList.length;
  return rankingList.map((item, index) => ({
    ...item,
    peringkat: index + 1,
    totalSantri: total,
  }));
}

// ==================== RAPORT TAHFIDZ ====================
async function simpanRaportTahfidz({
  id, santriId, tahunAjaran, semester, catatan, ringkasanRows, status,
  namaPembina, tanggalCetak, pimpinanId, pimpinanNama, pimpinanJabatan, dibuatOleh,
}) {
  if (!santriId || !tahunAjaran || !semester) {
    throw new CashlessError(400, "santriId, tahunAjaran, dan semester wajib diisi.");
  }
  const raportId = id || uid();
  const stat = status || "PUBLISHED";
  const rowsJson = JSON.stringify(ringkasanRows || []);
  const now = new Date().toISOString();

  await query(`
    INSERT INTO "RaportTahfidz" (
      "id", "santriId", "tahunAjaran", "semester", "catatan", "ringkasanRows", "status",
      "namaPembina", "tanggalCetak", "pimpinanId", "pimpinanNama", "pimpinanJabatan", "dibuatOleh", "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT ("santriId", "tahunAjaran", "semester")
    DO UPDATE SET
      "catatan" = EXCLUDED."catatan",
      "ringkasanRows" = EXCLUDED."ringkasanRows",
      "status" = EXCLUDED."status",
      "namaPembina" = EXCLUDED."namaPembina",
      "tanggalCetak" = EXCLUDED."tanggalCetak",
      "pimpinanId" = EXCLUDED."pimpinanId",
      "pimpinanNama" = EXCLUDED."pimpinanNama",
      "pimpinanJabatan" = EXCLUDED."pimpinanJabatan",
      "updatedAt" = EXCLUDED."updatedAt"
  `, [
    raportId, santriId, String(tahunAjaran).trim(), String(semester).trim(),
    catatan || null, rowsJson, stat,
    namaPembina || null, tanggalCetak || null,
    pimpinanId || null, pimpinanNama || null, pimpinanJabatan || null,
    dibuatOleh || null, now,
  ]);

  return queryOne('SELECT * FROM "RaportTahfidz" WHERE "santriId" = $1 AND "tahunAjaran" = $2 AND "semester" = $3', [santriId, tahunAjaran, semester]);
}

async function semuaRaportTahfidz({ santriId, tahunAjaran, semester, status } = {}) {
  const conditions = [];
  const params = [];
  if (santriId) {
    params.push(santriId);
    conditions.push(`r."santriId" = $${params.length}`);
  }
  if (tahunAjaran) {
    params.push(tahunAjaran);
    conditions.push(`r."tahunAjaran" = $${params.length}`);
  }
  if (semester) {
    params.push(semester);
    conditions.push(`r."semester" = $${params.length}`);
  }
  if (status && status !== "Semua") {
    params.push(status);
    conditions.push(`r."status" = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return queryAll(`
    SELECT r.*, s."nama" AS "namaSantri", s."kelas", s."nis", s."nisn"
    FROM "RaportTahfidz" r
    LEFT JOIN "Santri" s ON r."santriId" = s."id"
    ${where}
    ORDER BY r."createdAt" DESC
  `, params);
}

async function hapusRaportTahfidz(id) {
  const row = await queryOne('SELECT * FROM "RaportTahfidz" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Data raport tahfidz tidak ditemukan.");
  await query('DELETE FROM "RaportTahfidz" WHERE "id" = $1', [id]);
  return { id, deleted: true };
}

module.exports = {
  semuaHafalan, catatHafalan, hapusHafalan,
  semuaUbudiyah, catatUbudiyah, hapusUbudiyah,
  semuaNilai, catatNilai, hapusNilai, nilaiPerSantri,
  semuaPrestasi, catatPrestasi, hapusPrestasi,
  simpanRaportAkademik, semuaRaportAkademik, hapusRaportAkademik, hitungRankingKelas,
  simpanRaportTahfidz, semuaRaportTahfidz, hapusRaportTahfidz,
};

