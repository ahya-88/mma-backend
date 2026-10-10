const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("./db");
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
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT ("santriId", "tanggalISO")
     DO UPDATE SET "status" = EXCLUDED."status", "keterangan" = EXCLUDED."keterangan", "dicatatOleh" = EXCLUDED."dicatatOleh"`,
    [id, santriId, tISO, status, keterangan || null, dicatatOleh || null],
  );
  return queryOne('SELECT * FROM "Absensi" WHERE "santriId" = $1 AND "tanggalISO" = $2', [santriId, tISO]);
}

async function catatAbsensiMassal({ santriIds, tanggalISO, status, keterangan, dicatatOleh }) {
  if (!Array.isArray(santriIds) || !santriIds.length) {
    throw new CashlessError(400, "santriIds harus berupa array yang tidak kosong.");
  }
  if (!status) throw new CashlessError(400, "status absensi wajib diisi.");
  const tISO = tanggalISO || todayISO();
  const results = [];
  for (const santriId of santriIds) {
    const res = await catatAbsensi({ santriId, tanggalISO: tISO, status, keterangan, dicatatOleh });
    results.push(res);
  }
  return { sukses: true, total: results.length, count: results.length, tanggalISO: tISO, status };
}

async function absensiPadaTanggal(tanggalISO, { kelas, asrama } = {}) {
  const tISO = tanggalISO || todayISO();
  const conditions = ['a."tanggalISO" = $1'];
  const params = [tISO];
  if (kelas && kelas !== "Semua") {
    params.push(kelas);
    conditions.push(`s."kelas" = $${params.length}`);
  }
  if (asrama && asrama !== "Semua") {
    params.push(asrama);
    conditions.push(`s."asrama" = $${params.length}`);
  }
  return queryAll(`
    SELECT a.*, s."nama" AS "namaSantri", s."kelas", s."asrama"
    FROM "Absensi" a
    LEFT JOIN "Santri" s ON a."santriId" = s."id"
    WHERE ${conditions.join(" AND ")}
    ORDER BY s."nama"
  `, params);
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
    SELECT p.*, s."nama" AS "namaSantri", s."kelas", s."asrama", s."nis"
    FROM "Perizinan" p
    LEFT JOIN "Santri" s ON p."santriId" = s."id"
    ${where}
    ORDER BY p."createdAt" DESC
  `, params);
}

const STATUS_PERIZINAN_VALID = ["Disetujui", "Ditolak", "Kembali", "Terlambat"];

async function prosesPerizinan({ id, statusBaru, disetujuiOleh, catatanKembali, tanggalKembaliAktual }) {
  if (!STATUS_PERIZINAN_VALID.includes(statusBaru)) {
    throw new CashlessError(400, `Status baru harus salah satu dari: ${STATUS_PERIZINAN_VALID.join(", ")}.`);
  }
  return withTransaction(async (client) => {
    const row = await client.query('SELECT * FROM "Perizinan" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row.rowCount) throw new CashlessError(404, "Data perizinan tidak ditemukan.");
    const existing = row.rows[0];

    if (statusBaru === "Disetujui" || statusBaru === "Ditolak") {
      if (existing.status !== "Menunggu") throw new CashlessError(400, `Perizinan ini sudah diproses (status: ${existing.status}).`);
      await client.query(
        'UPDATE "Perizinan" SET "status" = $1, "disetujuiOleh" = $2, "tanggalProses" = $3 WHERE "id" = $4',
        [statusBaru, disetujuiOleh || null, todayISO(), id],
      );
    } else if (statusBaru === "Kembali" || statusBaru === "Terlambat") {
      if (existing.status !== "Disetujui") {
        throw new CashlessError(400, "Hanya perizinan dengan status 'Disetujui' yang bisa ditandai kembali.");
      }
      const tKembali = tanggalKembaliAktual || todayISO();
      await client.query(
        `UPDATE "Perizinan" SET "status" = $1, "tanggalKembaliAktual" = $2, "catatanKembali" = $3, "penerimaKembali" = $4 WHERE "id" = $5`,
        [statusBaru, tKembali, catatanKembali || null, disetujuiOleh || null, id],
      );
    }

    const updated = await client.query('SELECT * FROM "Perizinan" WHERE "id" = $1', [id]);
    return updated.rows[0];
  });
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

// ==================== PENILAIAN KEGIATAN ====================
async function catatPenilaianKegiatan({ santriId, kegiatan, skor, tanggal, catatan, dicatatOleh }) {
  if (!santriId || !kegiatan) throw new CashlessError(400, "santriId dan kegiatan wajib diisi.");
  const id = uid();
  const tISO = tanggal || todayISO();
  const skorJson = JSON.stringify(skor || {});

  await query(`
    INSERT INTO "PenilaianKegiatan" ("id", "santriId", "kegiatan", "skor", "tanggal", "catatan", "dicatatOleh")
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [id, santriId, kegiatan.trim(), skorJson, tISO, catatan || null, dicatatOleh || null]);

  return queryOne('SELECT * FROM "PenilaianKegiatan" WHERE "id" = $1', [id]);
}

async function semuaPenilaianKegiatan({ santriId, kegiatan } = {}) {
  const conditions = [];
  const params = [];
  if (santriId) {
    params.push(santriId);
    conditions.push(`pk."santriId" = $${params.length}`);
  }
  if (kegiatan) {
    params.push(kegiatan);
    conditions.push(`pk."kegiatan" = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return queryAll(`
    SELECT pk.*, s."nama" AS "namaSantri", s."kelas"
    FROM "PenilaianKegiatan" pk
    LEFT JOIN "Santri" s ON pk."santriId" = s."id"
    ${where}
    ORDER BY pk."createdAt" DESC
  `, params);
}

async function hapusPenilaianKegiatan(id) {
  const row = await queryOne('SELECT * FROM "PenilaianKegiatan" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Data penilaian kegiatan tidak ditemukan.");
  await query('DELETE FROM "PenilaianKegiatan" WHERE "id" = $1', [id]);
  return { id, deleted: true };
}

// ==================== RAPORT MENTAL ====================
async function simpanRaportMental({
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
    INSERT INTO "RaportMental" (
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

  return queryOne('SELECT * FROM "RaportMental" WHERE "santriId" = $1 AND "tahunAjaran" = $2 AND "semester" = $3', [santriId, tahunAjaran, semester]);
}

async function semuaRaportMental({ santriId, tahunAjaran, semester, status } = {}) {
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
    FROM "RaportMental" r
    LEFT JOIN "Santri" s ON r."santriId" = s."id"
    ${where}
    ORDER BY r."createdAt" DESC
  `, params);
}

async function hapusRaportMental(id) {
  const row = await queryOne('SELECT * FROM "RaportMental" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Data raport mental tidak ditemukan.");
  await query('DELETE FROM "RaportMental" WHERE "id" = $1', [id]);
  return { id, deleted: true };
}

module.exports = {
  profilPengasuhan,
  catatAbsensi, catatAbsensiMassal, absensiPadaTanggal, riwayatAbsensi,
  ajukanPerizinan, daftarPerizinan, prosesPerizinan,
  catatPelanggaran, semuaPelanggaran, riwayatPelanggaran, hapusPelanggaran,
  catatPenilaianKegiatan, semuaPenilaianKegiatan, hapusPenilaianKegiatan,
  simpanRaportMental, semuaRaportMental, hapusRaportMental,
};


