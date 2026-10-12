const crypto = require("crypto");
const { query, queryOne, queryAll } = require("./db");
const { CashlessError } = require("./cashlessService");

const uid = () => crypto.randomUUID();
const todayISO = () => new Date().toISOString().slice(0, 10);

// ==================== MASTER KELAS (PENGAJARAN) ====================
async function semuaKelas() {
  return queryAll(`
    SELECT k.*, COALESCE(mg."nama", g."nama") AS "namaWaliKelas",
      (SELECT COUNT(*)::int FROM "Santri" s WHERE s."kelas" = k."nama" AND s."is_deleted" = FALSE) AS "jumlahSantri"
    FROM "MasterKelas" k
    LEFT JOIN "MasterGuru" mg ON k."waliKelasId" = mg."id"
    LEFT JOIN "Guru" g ON k."waliKelasId" = g."id"
    ORDER BY k."nama" ASC
  `);
}

async function tambahKelas({ nama, waliKelasId, tingkat }) {
  if (!nama || !nama.trim()) throw new CashlessError(400, "Nama kelas wajib diisi.");
  const trimmedNama = nama.trim();
  const existing = await queryOne('SELECT * FROM "MasterKelas" WHERE "nama" = $1', [trimmedNama]);
  if (existing) throw new CashlessError(400, `Kelas "${trimmedNama}" sudah ada.`);
  const id = uid();
  await query(
    `INSERT INTO "MasterKelas" ("id", "nama", "waliKelasId", "tingkat") VALUES ($1, $2, $3, $4)`,
    [id, trimmedNama, waliKelasId || null, tingkat || null],
  );
  return queryOne('SELECT * FROM "MasterKelas" WHERE "id" = $1', [id]);
}

async function ubahKelas(id, { nama, waliKelasId, tingkat }) {
  const existing = await queryOne('SELECT * FROM "MasterKelas" WHERE "id" = $1 OR "nama" = $1', [id]);
  if (!existing) throw new CashlessError(404, "Kelas tidak ditemukan.");
  const realId = existing.id;
  const newNama = nama !== undefined && nama.trim() ? nama.trim() : existing.nama;
  const newWali = waliKelasId !== undefined ? (waliKelasId || null) : existing.waliKelasId;
  const newTingkat = tingkat !== undefined ? (tingkat || null) : existing.tingkat;

  if (newNama !== existing.nama) {
    const duplicate = await queryOne('SELECT * FROM "MasterKelas" WHERE "nama" = $1 AND "id" != $2', [newNama, realId]);
    if (duplicate) throw new CashlessError(400, `Kelas dengan nama "${newNama}" sudah ada.`);
  }

  await query(
    `UPDATE "MasterKelas" SET "nama" = $1, "waliKelasId" = $2, "tingkat" = $3 WHERE "id" = $4`,
    [newNama, newWali, newTingkat, realId],
  );

  if (newNama !== existing.nama) {
    await query('UPDATE "Santri" SET "kelas" = $1 WHERE "kelas" = $2', [newNama, existing.nama]);
  }

  return queryOne('SELECT * FROM "MasterKelas" WHERE "id" = $1', [realId]);
}

async function hapusKelas(id) {
  const existing = await queryOne('SELECT * FROM "MasterKelas" WHERE "id" = $1 OR "nama" = $1', [id]);
  if (!existing) throw new CashlessError(404, "Kelas tidak ditemukan.");
  await query('DELETE FROM "MasterKelas" WHERE "id" = $1', [existing.id]);
  return { id: existing.id, deleted: true, nama: existing.nama };
}

// ==================== MASTER HALAQOH (LPTQ) ====================
async function semuaHalaqoh() {
  return queryAll(`
    SELECT h.*, g."nama" AS "namaPembimbing",
      (SELECT COUNT(*)::int FROM "Santri" s WHERE s."halaqoh" = h."nama" AND s."is_deleted" = FALSE) AS "jumlahSantri"
    FROM "MasterHalaqoh" h
    LEFT JOIN "Guru" g ON h."pembimbingId" = g."id"
    ORDER BY h."nama" ASC
  `);
}

async function tambahHalaqoh({ nama, pembimbingId }) {
  if (!nama || !nama.trim()) throw new CashlessError(400, "Nama halaqoh wajib diisi.");
  const trimmedNama = nama.trim();
  const existing = await queryOne('SELECT * FROM "MasterHalaqoh" WHERE "nama" = $1', [trimmedNama]);
  if (existing) throw new CashlessError(400, `Halaqoh "${trimmedNama}" sudah ada.`);
  const id = uid();
  await query(
    `INSERT INTO "MasterHalaqoh" ("id", "nama", "pembimbingId") VALUES ($1, $2, $3)`,
    [id, trimmedNama, pembimbingId || null],
  );
  return queryOne('SELECT * FROM "MasterHalaqoh" WHERE "id" = $1', [id]);
}

async function ubahHalaqoh(id, { nama, pembimbingId }) {
  const existing = await queryOne('SELECT * FROM "MasterHalaqoh" WHERE "id" = $1 OR "nama" = $1', [id]);
  if (!existing) throw new CashlessError(404, "Halaqoh tidak ditemukan.");
  const realId = existing.id;
  const newNama = nama !== undefined && nama.trim() ? nama.trim() : existing.nama;
  const newPembimbing = pembimbingId !== undefined ? (pembimbingId || null) : existing.pembimbingId;

  if (newNama !== existing.nama) {
    const duplicate = await queryOne('SELECT * FROM "MasterHalaqoh" WHERE "nama" = $1 AND "id" != $2', [newNama, realId]);
    if (duplicate) throw new CashlessError(400, `Halaqoh dengan nama "${newNama}" sudah ada.`);
  }

  await query(
    `UPDATE "MasterHalaqoh" SET "nama" = $1, "pembimbingId" = $2 WHERE "id" = $3`,
    [newNama, newPembimbing, realId],
  );

  if (newNama !== existing.nama) {
    await query('UPDATE "Santri" SET "halaqoh" = $1 WHERE "halaqoh" = $2', [newNama, existing.nama]);
  }

  return queryOne('SELECT * FROM "MasterHalaqoh" WHERE "id" = $1', [realId]);
}

async function hapusHalaqoh(id) {
  const existing = await queryOne('SELECT * FROM "MasterHalaqoh" WHERE "id" = $1 OR "nama" = $1', [id]);
  if (!existing) throw new CashlessError(404, "Halaqoh tidak ditemukan.");
  await query('DELETE FROM "MasterHalaqoh" WHERE "id" = $1', [existing.id]);
  return { id: existing.id, deleted: true, nama: existing.nama };
}

// ==================== MASTER MATERI UBUDIYAH & DOA (LPTQ) ====================
async function semuaMateriUbudiyah(jenis) {
  const params = [];
  const where = jenis ? 'WHERE "jenis" = $1' : '';
  if (jenis) params.push(jenis);
  return queryAll(`SELECT * FROM "MasterMateriUbudiyah" ${where} ORDER BY "createdAt" ASC`, params);
}

async function tambahMateriUbudiyah({ jenis, nama }) {
  if (!jenis || !nama || !nama.trim()) throw new CashlessError(400, "Jenis dan nama materi wajib diisi.");
  const id = uid();
  await query(
    `INSERT INTO "MasterMateriUbudiyah" ("id", "jenis", "nama") VALUES ($1, $2, $3)
     ON CONFLICT ("jenis", "nama") DO NOTHING`,
    [id, jenis, nama.trim()],
  );
  return queryOne('SELECT * FROM "MasterMateriUbudiyah" WHERE "jenis" = $1 AND "nama" = $2', [jenis, nama.trim()]);
}

async function hapusMateriUbudiyah(id, jenis) {
  let existing;
  if (jenis) {
    existing = await queryOne('SELECT * FROM "MasterMateriUbudiyah" WHERE ("id" = $1 OR "nama" = $1) AND "jenis" = $2', [id, jenis]);
  } else {
    existing = await queryOne('SELECT * FROM "MasterMateriUbudiyah" WHERE "id" = $1 OR "nama" = $1', [id]);
  }
  if (!existing) throw new CashlessError(404, "Materi tidak ditemukan.");
  await query('DELETE FROM "MasterMateriUbudiyah" WHERE "id" = $1', [existing.id]);
  return { id: existing.id, deleted: true };
}

// ==================== HAFALAN TAHFIDZ (LPTQ) ====================
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
    ORDER BY h."tanggalISO" DESC, h."createdAt" DESC
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
      nilaiTajwid !== undefined && nilaiTajwid !== null && nilaiTajwid !== "" ? Number(nilaiTajwid) : null,
      nilaiFashahah !== undefined && nilaiFashahah !== null && nilaiFashahah !== "" ? Number(nilaiFashahah) : null,
      tISO, dicatatOleh || null,
    ],
  );
  return queryOne('SELECT * FROM "Hafalan" WHERE "id" = $1', [id]);
}

async function ubahHafalan(id, { juz, surah, ayat, predikat, nilaiTajwid, nilaiFashahah }) {
  const existing = await queryOne('SELECT * FROM "Hafalan" WHERE "id" = $1', [id]);
  if (!existing) throw new CashlessError(404, "Data hafalan tidak ditemukan.");
  const newJuz = juz !== undefined ? String(juz) : existing.juz;
  const newSurah = surah !== undefined ? surah : existing.surah;
  const newAyat = ayat !== undefined ? ayat : existing.ayat;
  const newPredikat = predikat !== undefined ? predikat : existing.predikat;
  const newTajwid = nilaiTajwid !== undefined ? (nilaiTajwid ? Number(nilaiTajwid) : null) : existing.nilaiTajwid;
  const newFashahah = nilaiFashahah !== undefined ? (nilaiFashahah ? Number(nilaiFashahah) : null) : existing.nilaiFashahah;

  await query(
    `UPDATE "Hafalan"
     SET "juz" = $1, "surah" = $2, "ayat" = $3, "predikat" = $4, "nilaiTajwid" = $5, "nilaiFashahah" = $6
     WHERE "id" = $7`,
    [newJuz, newSurah, newAyat, newPredikat, newTajwid, newFashahah, id],
  );
  return queryOne('SELECT * FROM "Hafalan" WHERE "id" = $1', [id]);
}

async function hapusHafalan(id) {
  const row = await queryOne('SELECT * FROM "Hafalan" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Data hafalan tidak ditemukan.");
  await query('DELETE FROM "Hafalan" WHERE "id" = $1', [id]);
  return { id, deleted: true };
}

// ==================== PENILAIAN UBUDIYAH (LPTQ) ====================
async function semuaUbudiyah() {
  return queryAll(`
    SELECT u.*, s."nama" AS "namaSantri", s."kelas"
    FROM "PenilaianUbudiyah" u
    LEFT JOIN "Santri" s ON u."santriId" = s."id"
    ORDER BY u."tanggalISO" DESC, u."createdAt" DESC
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

async function ubahUbudiyah(id, { jenis, materi, predikat, catatan }) {
  const existing = await queryOne('SELECT * FROM "PenilaianUbudiyah" WHERE "id" = $1', [id]);
  if (!existing) throw new CashlessError(404, "Data ubudiyah tidak ditemukan.");
  const newJenis = jenis !== undefined ? jenis : existing.jenis;
  const newMateri = materi !== undefined ? materi : existing.materi;
  const newPredikat = predikat !== undefined ? predikat : existing.predikat;
  const newCatatan = catatan !== undefined ? catatan : existing.catatan;

  await query(
    `UPDATE "PenilaianUbudiyah"
     SET "jenis" = $1, "materi" = $2, "predikat" = $3, "catatan" = $4
     WHERE "id" = $5`,
    [newJenis, newMateri, newPredikat, newCatatan, id],
  );
  return queryOne('SELECT * FROM "PenilaianUbudiyah" WHERE "id" = $1', [id]);
}

async function hapusUbudiyah(id) {
  const row = await queryOne('SELECT * FROM "PenilaianUbudiyah" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Data ubudiyah tidak ditemukan.");
  await query('DELETE FROM "PenilaianUbudiyah" WHERE "id" = $1', [id]);
  return { id, deleted: true };
}

// ==================== NILAI AKADEMIK (PENGAJARAN) ====================
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
    ORDER BY n."tanggalISO" DESC, n."createdAt" DESC
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

async function ubahNilai(id, { mapel, nilai, tahunAjaran, semester, jenisNilai }) {
  const existing = await queryOne('SELECT * FROM "Nilai" WHERE "id" = $1', [id]);
  if (!existing) throw new CashlessError(404, "Data nilai tidak ditemukan.");
  const newMapel = mapel !== undefined ? mapel.trim() : existing.mapel;
  let newNilai = existing.nilai;
  if (nilai !== undefined && nilai !== null && nilai !== "") {
    newNilai = Number(nilai);
    if (Number.isNaN(newNilai) || newNilai < 0 || newNilai > 100) {
      throw new CashlessError(400, "Nilai harus berupa angka antara 0 sampai 100.");
    }
  }
  const newTA = tahunAjaran !== undefined ? tahunAjaran : existing.tahunAjaran;
  const newSem = semester !== undefined ? semester : existing.semester;
  const newJenis = jenisNilai !== undefined ? jenisNilai : existing.jenisNilai;

  await query(
    `UPDATE "Nilai"
     SET "mapel" = $1, "nilai" = $2, "tahunAjaran" = $3, "semester" = $4, "jenisNilai" = $5
     WHERE "id" = $6`,
    [newMapel, newNilai, newTA, newSem, newJenis, id],
  );
  return queryOne('SELECT * FROM "Nilai" WHERE "id" = $1', [id]);
}

async function hapusNilai(id) {
  const row = await queryOne('SELECT * FROM "Nilai" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Data nilai tidak ditemukan.");
  await query('DELETE FROM "Nilai" WHERE "id" = $1', [id]);
  return { id, deleted: true };
}

// ==================== PRESTASI (PENGAJARAN) ====================
async function semuaPrestasi() {
  return queryAll(`
    SELECT p.*, s."nama" AS "namaSantri", s."kelas"
    FROM "Prestasi" p
    LEFT JOIN "Santri" s ON p."santriId" = s."id"
    ORDER BY p."tanggalISO" DESC, p."createdAt" DESC
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

async function ubahPrestasi(id, { judul, tingkat }) {
  const existing = await queryOne('SELECT * FROM "Prestasi" WHERE "id" = $1', [id]);
  if (!existing) throw new CashlessError(404, "Data prestasi tidak ditemukan.");
  const newJudul = judul !== undefined ? judul.trim() : existing.judul;
  const newTingkat = tingkat !== undefined ? tingkat : existing.tingkat;
  await query(
    `UPDATE "Prestasi" SET "judul" = $1, "tingkat" = $2 WHERE "id" = $3`,
    [newJudul, newTingkat, id],
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

  let parsedTotal = totalSantri ? Number(totalSantri) : null;
  let parsedRank = peringkat ? String(peringkat).trim() : null;
  if (!parsedTotal && parsedRank && parsedRank.includes("dari")) {
    const parts = parsedRank.split("dari").map((s) => s.trim());
    if (parts.length === 2 && !isNaN(Number(parts[1]))) {
      parsedTotal = Number(parts[1]);
    }
  }

  await query(`
    INSERT INTO "RaportAkademik" (
      "id", "santriId", "tahunAjaran", "semester", "peringkat", "totalSantri", "rataRata",
      "catatan", "ringkasanRows", "status", "namaPembina", "tanggalCetak",
      "pimpinanId", "pimpinanNama", "pimpinanJabatan", "dibuatOleh", "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    ON CONFLICT ("santriId", "tahunAjaran", "semester")
    DO UPDATE SET
      "peringkat" = EXCLUDED."peringkat",
      "totalSantri" = COALESCE(EXCLUDED."totalSantri", "RaportAkademik"."totalSantri"),
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
    parsedRank, parsedTotal,
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
  semuaKelas, tambahKelas, ubahKelas, hapusKelas,
  semuaHalaqoh, tambahHalaqoh, ubahHalaqoh, hapusHalaqoh,
  semuaMateriUbudiyah, tambahMateriUbudiyah, hapusMateriUbudiyah,
  semuaHafalan, catatHafalan, ubahHafalan, hapusHafalan,
  semuaUbudiyah, catatUbudiyah, ubahUbudiyah, hapusUbudiyah,
  semuaNilai, catatNilai, ubahNilai, hapusNilai, nilaiPerSantri,
  semuaPrestasi, catatPrestasi, ubahPrestasi, hapusPrestasi,
  simpanRaportAkademik, semuaRaportAkademik, hapusRaportAkademik, hitungRankingKelas,
  simpanRaportTahfidz, semuaRaportTahfidz, hapusRaportTahfidz,
};
