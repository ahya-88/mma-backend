const express = require("express");
const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("../db");
const { requireAuth, isSuperAdmin } = require("../auth");
const { CashlessError, FACE_MODEL, getSantriRow } = require("../cashlessService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();
const uid = () => crypto.randomUUID();

// GET /api/wajah/templates/:santriId
router.get("/templates/:santriId", requireAuth, asyncHandler(async (req, res) => {
  const rows = await queryAll('SELECT "id", "santriId", "sumber", "modelVersion", "dibuatOleh", "dibuatPada" FROM "FaceTemplate" WHERE "santriId" = $1 ORDER BY "dibuatPada" DESC', [req.params.santriId]);
  res.json(rows);
}));

// POST /api/wajah/template
router.post("/template", requireAuth, asyncHandler(async (req, res) => {
  const { santriId, embedding, sumber } = req.body || {};
  if (!santriId || !embedding) {
    throw new CashlessError(400, "santriId dan embedding wajah wajib diisi.");
  }

  const santri = await getSantriRow(santriId);
  const id = uid();
  const tISO = new Date().toISOString();
  const src = ["foto", "kamera"].includes(sumber) ? sumber : "kamera";

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO "FaceTemplate" ("santriId", "embedding", "sumber", "modelVersion", "dibuatOleh", "dibuatPada")
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [santriId, JSON.stringify(embedding), src, FACE_MODEL, req.user.nama, tISO],
    );

    await client.query(
      `UPDATE "Santri" SET "faceEmbedding" = $1 WHERE "id" = $2`,
      [JSON.stringify(embedding), santriId],
    );
  });

  res.status(201).json({ id, santriId, sumber: src, modelVersion: FACE_MODEL, dibuatPada: tISO });
}));

// DELETE /api/wajah/template/:id
router.delete("/template/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const row = await queryOne('SELECT * FROM "FaceTemplate" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Template wajah tidak ditemukan.");

  await query('DELETE FROM "FaceTemplate" WHERE "id" = $1', [id]);
  res.json({ id, deleted: true });
}));

// POST /api/wajah/verifikasi
router.post("/verifikasi", requireAuth, asyncHandler(async (req, res) => {
  const { santriId } = req.body || {};
  if (!santriId) throw new CashlessError(400, "santriId wajib diisi.");

  const santri = await getSantriRow(santriId);
  const template = await queryOne('SELECT * FROM "FaceTemplate" WHERE "santriId" = $1 AND "modelVersion" = $2 LIMIT 1', [santriId, FACE_MODEL]);

  res.json({
    santriId,
    nama: santri.nama,
    terverifikasi: !!template,
    punyaTemplate: !!template,
    modelVersion: FACE_MODEL,
  });
}));

// POST /api/wajah/log
router.post("/log", requireAuth, asyncHandler(async (req, res) => {
  const { terbaikId, skorTerbaik, skorKedua, dikonfirmasiId, metode, ms, jumlahFrame } = req.body || {};
  const tISO = new Date().toISOString();

  await query(
    `INSERT INTO "LogWajah" ("waktu", "petugasId", "unit", "terbaikId", "skorTerbaik", "skorKedua", "dikonfirmasiId", "metode", "ms", "jumlahFrame")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [tISO, req.user.id, req.user.unit || null, terbaikId || null, skorTerbaik || null, skorKedua || null, dikonfirmasiId || null, metode || "kamera", ms || 0, jumlahFrame || 1],
  );

  res.status(201).json({ ok: true });
}));

module.exports = router;
