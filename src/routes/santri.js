const express = require("express");
const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("../db");
const { requireAuth, isSuperAdmin } = require("../auth");
const { CashlessError, getSantriRow, toPublicSantri, SANTRI_BIODATA_FIELDS } = require("../cashlessService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();

function isAuthorizedSantriManager(req) {
  if (isSuperAdmin(req.user)) return true;
  if (req.user?.role === "guru") {
    const dep = req.user.departemen;
    return ["sekretariat", "administrasi", "pengasuhan", "pengajaran", "lptq", "unitusaha"].includes(dep);
  }
  return false;
}

// GET /api/santri - List santri dengan relasi data Wali
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const page = req.query.page ? Number(req.query.page) : null;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const q = (req.query.q || "").trim().toLowerCase();
  const kelas = (req.query.kelas || "").trim();

  const whereConditions = [];
  const params = [];

  if (kelas && kelas !== "Semua") {
    params.push(kelas);
    whereConditions.push(`s."kelas" = $${params.length}`);
  }

  if (q) {
    params.push(`%${q}%`);
    whereConditions.push(`(LOWER(s."nama") LIKE $${params.length} OR LOWER(COALESCE(s."nis", '')) LIKE $${params.length} OR LOWER(COALESCE(s."nisn", '')) LIKE $${params.length} OR LOWER(COALESCE(w."nama", '')) LIKE $${params.length})`);
  }

  const whereSql = whereConditions.length ? `WHERE ${whereConditions.join(" AND ")}` : "";

  const sqlSelect = `
    SELECT s.*, w."nama" AS "namaWali", w."hp" AS "hpWali"
    FROM "Santri" s
    LEFT JOIN "Wali" w ON s."waliId" = w."id"
    ${whereSql}
    ORDER BY s."nama"
  `;

  if (page || limit) {
    const p = Math.max(1, page || 1);
    const l = Math.min(100, Math.max(1, limit || 20));
    const offset = (p - 1) * l;

    const countSql = `
      SELECT COUNT(*) AS "total"
      FROM "Santri" s
      LEFT JOIN "Wali" w ON s."waliId" = w."id"
      ${whereSql}
    `;

    const [rows, countRes] = await Promise.all([
      queryAll(`${sqlSelect} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, l, offset]),
      queryOne(countSql, params),
    ]);

    const total = Number(countRes?.total || 0);
    const items = await Promise.all(rows.map(async (row) => {
      const pub = await toPublicSantri(row);
      return { ...pub, namaWali: row.namaWali || "", hpWali: row.hpWali || "" };
    }));

    return res.json({ items, total, page: p, limit: l, totalPages: Math.ceil(total / l) });
  }

  const rows = await queryAll(sqlSelect, params);
  const items = await Promise.all(rows.map(async (row) => {
    const pub = await toPublicSantri(row);
    return { ...pub, namaWali: row.namaWali || "", hpWali: row.hpWali || "" };
  }));

  res.json(items);
}));

// GET /api/santri/me-anak - Santri milik wali yang sedang login
router.get("/me-anak", requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role !== "wali") {
    return res.status(403).json({ error: "Hanya akun wali yang dapat mengakses daftar anak." });
  }
  const rows = await queryAll('SELECT * FROM "Santri" WHERE "waliId" = $1 ORDER BY "nama"', [req.user.id]);
  const items = await Promise.all(rows.map((row) => toPublicSantri(row)));
  res.json(items);
}));

// GET /api/santri/:id - Detail santri
router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const row = await queryOne(`
    SELECT s.*, w."nama" AS "namaWali", w."hp" AS "hpWali"
    FROM "Santri" s
    LEFT JOIN "Wali" w ON s."waliId" = w."id"
    WHERE s."id" = $1
  `, [req.params.id]);

  if (!row) throw new CashlessError(404, "Santri tidak ditemukan.");

  if (req.user.role === "wali" && row.waliId !== req.user.id) {
    return res.status(403).json({ error: "Akses ditolak. Anda hanya berwenang mengakses data anak sendiri." });
  }

  const pub = await toPublicSantri(row);
  res.json({ ...pub, namaWali: row.namaWali || "", hpWali: row.hpWali || "" });
}));

// GET /api/santri/:id/rapor-ringkas
router.get("/:id/rapor-ringkas", requireAuth, asyncHandler(async (req, res) => {
  const santriId = req.params.id;
  const santri = await getSantriRow(santriId);

  if (req.user.role === "wali" && santri.waliId !== req.user.id) {
    return res.status(403).json({ error: "Akses ditolak." });
  }

  const [hafalan, ubudiyah, nilai, prestasi, pelanggaran] = await Promise.all([
    queryAll('SELECT * FROM "Hafalan" WHERE "santriId" = $1 ORDER BY "tanggalISO" DESC LIMIT 10', [santriId]),
    queryAll('SELECT * FROM "PenilaianUbudiyah" WHERE "santriId" = $1 ORDER BY "tanggalISO" DESC LIMIT 10', [santriId]),
    queryAll('SELECT * FROM "Nilai" WHERE "santriId" = $1 ORDER BY "tanggalISO" DESC LIMIT 10', [santriId]),
    queryAll('SELECT * FROM "Prestasi" WHERE "santriId" = $1 ORDER BY "tanggalISO" DESC LIMIT 10', [santriId]),
    queryAll('SELECT * FROM "Pelanggaran" WHERE "santriId" = $1 ORDER BY "tanggalISO" DESC LIMIT 10', [santriId]),
  ]);

  res.json({
    santri: await toPublicSantri(santri),
    hafalan,
    ubudiyah,
    nilai,
    prestasi,
    pelanggaran,
  });
}));

// POST /api/santri - Tambah santri baru
router.post("/", requireAuth, asyncHandler(async (req, res) => {
  if (!isAuthorizedSantriManager(req)) {
    return res.status(403).json({ error: "Hanya Sekretariat atau Superadmin yang dapat menambah santri." });
  }

  const { nama, kelas, nis, nisn, waliId, limitJajanHarian } = req.body || {};
  if (!nama || typeof nama !== "string" || !nama.trim()) {
    throw new CashlessError(400, "Nama santri wajib diisi.");
  }

  const id = crypto.randomUUID();
  const limitVal = limitJajanHarian ? Number(limitJajanHarian) : null;

  await withTransaction(async (client) => {
    if (nis && nis.trim()) {
      const adaNis = await client.query('SELECT "id" FROM "Santri" WHERE "nis" = $1', [nis.trim()]);
      if (adaNis.rowCount) throw new CashlessError(400, "NIS sudah digunakan oleh santri lain.");
    }

    await client.query(
      `INSERT INTO "Santri" ("id", "nama", "kelas", "nis", "nisn", "waliId", "limitJajanHarian", "saldo")
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0)`,
      [id, nama.trim(), kelas ? kelas.trim() : null, nis ? nis.trim() : null, nisn ? nisn.trim() : null, waliId || null, limitVal],
    );
  });

  const newSantri = await getSantriRow(id);
  res.status(201).json(await toPublicSantri(newSantri));
}));

// PUT /api/santri/:id - Update santri
router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  if (!isAuthorizedSantriManager(req)) {
    return res.status(403).json({ error: "Hanya Sekretariat atau Superadmin yang dapat mengedit santri." });
  }

  const santriId = req.params.id;
  const body = req.body || {};

  await withTransaction(async (client) => {
    const existing = await client.query('SELECT * FROM "Santri" WHERE "id" = $1 FOR UPDATE', [santriId]);
    if (!existing.rowCount) throw new CashlessError(404, "Santri tidak ditemukan.");

    const row = existing.rows[0];
    const namaFinal = body.nama !== undefined ? String(body.nama).trim() : row.nama;
    const kelasFinal = body.kelas !== undefined ? String(body.kelas).trim() : row.kelas;
    const nisFinal = body.nis !== undefined ? (body.nis ? String(body.nis).trim() : null) : row.nis;
    const nisnFinal = body.nisn !== undefined ? (body.nisn ? String(body.nisn).trim() : null) : row.nisn;
    const waliIdFinal = body.waliId !== undefined ? (body.waliId || null) : row.waliId;
    const limitFinal = body.limitJajanHarian !== undefined ? (body.limitJajanHarian ? Number(body.limitJajanHarian) : null) : row.limitJajanHarian;

    if (nisFinal && nisFinal !== row.nis) {
      const adaNis = await client.query('SELECT "id" FROM "Santri" WHERE "nis" = $1 AND "id" <> $2', [nisFinal, santriId]);
      if (adaNis.rowCount) throw new CashlessError(400, "NIS sudah digunakan oleh santri lain.");
    }

    const updates = [
      '"nama" = $1', '"kelas" = $2', '"nis" = $3', '"nisn" = $4', '"waliId" = $5', '"limitJajanHarian" = $6',
    ];
    const params = [namaFinal, kelasFinal, nisFinal, nisnFinal, waliIdFinal, limitFinal];

    for (const field of SANTRI_BIODATA_FIELDS) {
      if (body[field] !== undefined) {
        params.push(body[field]);
        updates.push(`"${field}" = $${params.length}`);
      }
    }

    params.push(santriId);
    await client.query(`UPDATE "Santri" SET ${updates.join(", ")} WHERE "id" = $${params.length}`, params);
  });

  const updated = await getSantriRow(santriId);
  res.json(await toPublicSantri(updated));
}));

// DELETE /api/santri/:id
router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  if (!isSuperAdmin(req.user) && req.user?.departemen !== "sekretariat") {
    return res.status(403).json({ error: "Hanya Superadmin atau Sekretariat yang dapat menghapus data santri." });
  }

  const santriId = req.params.id;
  await withTransaction(async (client) => {
    const existing = await client.query('SELECT * FROM "Santri" WHERE "id" = $1 FOR UPDATE', [santriId]);
    if (!existing.rowCount) throw new CashlessError(404, "Santri tidak ditemukan.");

    await client.query('DELETE FROM "QueueOfflineKasir" WHERE "santriId" = $1', [santriId]);
    await client.query('DELETE FROM "LogPin" WHERE "santriId" = $1', [santriId]);
    await client.query('DELETE FROM "FaceTemplate" WHERE "santriId" = $1', [santriId]);
    await client.query('DELETE FROM "PenilaianUbudiyah" WHERE "santriId" = $1', [santriId]);
    await client.query('DELETE FROM "Hafalan" WHERE "santriId" = $1', [santriId]);
    await client.query('DELETE FROM "Prestasi" WHERE "santriId" = $1', [santriId]);
    await client.query('DELETE FROM "Nilai" WHERE "santriId" = $1', [santriId]);
    await client.query('DELETE FROM "Pelanggaran" WHERE "santriId" = $1', [santriId]);
    await client.query('DELETE FROM "Perizinan" WHERE "santriId" = $1', [santriId]);
    await client.query('DELETE FROM "Absensi" WHERE "santriId" = $1', [santriId]);
    await client.query('DELETE FROM "Tagihan" WHERE "santriId" = $1', [santriId]);
    await client.query('DELETE FROM "PermintaanBMT" WHERE "santriId" = $1', [santriId]);
    await client.query('DELETE FROM "TransaksiCashless" WHERE "santriId" = $1', [santriId]);
    await client.query('DELETE FROM "Ledger" WHERE "santriId" = $1', [santriId]);
    await client.query('DELETE FROM "Santri" WHERE "id" = $1', [santriId]);
  });

  res.json({ id: santriId, deleted: true });
}));

module.exports = router;
