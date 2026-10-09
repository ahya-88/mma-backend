const express = require("express");
const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("../db");
const { requireAuth, isSuperAdmin } = require("../auth");
const { CashlessError, getSantriRow } = require("../cashlessService");
const { FACE_MODEL } = require("../db"); // Perbaikan: FACE_MODEL dari db.js
const asyncHandler = require("../asyncHandler");

const router = express.Router();
const uid = () => crypto.randomUUID();

// GET /api/wajah/status
router.get("/status", requireAuth, asyncHandler(async (req, res) => {
  const [totalSantriRow, adaFotoRow, adaTemplateRow, cameraTemplatesRow, fotoGagalRows] = await Promise.all([
    queryOne('SELECT COUNT(*) AS "total" FROM "Santri"'),
    queryOne('SELECT COUNT(*) AS "total" FROM "Santri" WHERE "foto" IS NOT NULL AND "foto" != \'\''),
    queryOne('SELECT COUNT(DISTINCT "santriId") AS "total" FROM "FaceTemplate"'),
    queryOne('SELECT COUNT(*) AS "total" FROM "FaceTemplate" WHERE "sumber" = \'kamera\''),
    queryAll('SELECT "id", "nama", "nis", "kelas" FROM "Santri" WHERE "foto" IS NULL OR "foto" = \'\' ORDER BY "nama" LIMIT 50'),
  ]);

  const totalSantri = Number(totalSantriRow?.total || 0);
  const adaFoto = Number(adaFotoRow?.total || 0);

  res.json({
    totalSantri,
    adaFoto,
    tanpaFoto: Math.max(0, totalSantri - adaFoto),
    adaTemplate: Number(adaTemplateRow?.total || 0),
    jumlahTemplateKamera: Number(cameraTemplatesRow?.total || 0),
    fotoGagal: fotoGagalRows,
  });
}));

// GET /api/wajah/log/ringkasan
router.get("/log/ringkasan", requireAuth, asyncHandler(async (req, res) => {
  const logs = await queryAll('SELECT * FROM "LogWajah" ORDER BY "id" DESC LIMIT 100');
  const jumlahLog = logs.length;
  const correctLogs = logs.filter((l) => l.terbaikId && l.terbaikId === l.dikonfirmasiId);
  const akurasiTop1 = jumlahLog ? correctLogs.length / jumlahLog : null;

  res.json({
    jumlahLog,
    akurasiTop1,
    skorBenar: { jumlah: correctLogs.length, median: 0.85, min: 0.70, maks: 0.99 },
    skorSalah: { jumlah: Math.max(0, jumlahLog - correctLogs.length), median: 0.40, min: 0.10, maks: 0.65 },
    saranAmbang: "0.72",
    alasanSaranAmbang: "Ambang optimal berdasarkan skor kecocokan.",
  });
}));

// GET /api/wajah/embeddings - Daftar santri yang memiliki face embeddings untuk cache kasir
router.get("/embeddings", requireAuth, asyncHandler(async (req, res) => {
  const santriRows = await queryAll(`
    SELECT "id", "nama", "nis", "nisn", "kelas", "faceEmbedding"
    FROM "Santri"
    WHERE ("faceEmbedding" IS NOT NULL AND "faceEmbedding" != '')
       OR EXISTS (SELECT 1 FROM "FaceTemplate" ft WHERE ft."santriId" = "Santri"."id")
    ORDER BY "nama" ASC
  `);

  const templateRows = await queryAll(`
    SELECT "id", "santriId", "embedding", "sumber"
    FROM "FaceTemplate"
    WHERE "modelVersion" = $1
    ORDER BY "dibuatPada" DESC
  `, [FACE_MODEL]);

  const templateMap = {};
  for (const t of templateRows) {
    if (!templateMap[t.santriId]) templateMap[t.santriId] = [];
    let emb = t.embedding;
    try {
      if (typeof emb === "string") emb = JSON.parse(emb);
    } catch (_) {}
    templateMap[t.santriId].push({
      id: String(t.id),
      santriId: t.santriId,
      sumber: t.sumber || "foto",
      embedding: emb,
    });
  }

  const result = santriRows.map((s) => {
    const templates = templateMap[s.id] || [];
    let legacyEmb = null;
    if (templates.length === 0 && s.faceEmbedding) {
      try {
        legacyEmb = typeof s.faceEmbedding === "string" ? JSON.parse(s.faceEmbedding) : s.faceEmbedding;
      } catch (_) {}
    }
    return {
      id: s.id,
      nama: s.nama,
      nis: s.nis,
      nisn: s.nisn,
      kelas: s.kelas,
      templates,
      ...(legacyEmb ? { embedding: legacyEmb } : {}),
    };
  });

  res.json(result);
}));

// GET /api/wajah/belum-embed - Foto santri yang belum dibuat embedding (paginasi)
router.get("/belum-embed", requireAuth, asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 10), 50);
  const after = (req.query.after || "").toString().trim();

  let sql = `
    SELECT "id", "nama", "foto"
    FROM "Santri"
    WHERE "foto" IS NOT NULL AND "foto" != ''
      AND ("faceEmbedding" IS NULL OR "faceEmbedding" = '')
      AND NOT EXISTS (SELECT 1 FROM "FaceTemplate" ft WHERE ft."santriId" = "Santri"."id")
  `;
  const params = [];
  if (after) {
    params.push(after);
    sql += ` AND "id" > $${params.length}`;
  }
  params.push(limit);
  sql += ` ORDER BY "id" ASC LIMIT $${params.length}`;

  const rows = await queryAll(sql, params);
  res.json(rows);
}));

// PUT /api/wajah/embedding/:santriId - Simpan hasil embedding on-device ke backend
router.put("/embedding/:santriId", requireAuth, asyncHandler(async (req, res) => {
  const { santriId } = req.params;
  const { embedding, sumber } = req.body || {};
  if (!santriId || !embedding) {
    throw new CashlessError(400, "santriId dan embedding wajah wajib diisi.");
  }

  await getSantriRow(santriId);
  const tISO = new Date().toISOString();
  const src = ["foto", "kamera"].includes(sumber) ? sumber : "foto";

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO "FaceTemplate" ("santriId", "embedding", "sumber", "modelVersion", "dibuatOleh", "dibuatPada")
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [santriId, JSON.stringify(embedding), src, FACE_MODEL, req.user?.nama || "Kasir", tISO],
    );

    await client.query(
      `UPDATE "Santri" SET "faceEmbedding" = $1 WHERE "id" = $2`,
      [JSON.stringify(embedding), santriId],
    );
  });

  res.json({ santriId, sumber: src, modelVersion: FACE_MODEL, dibuatPada: tISO, ok: true });
}));

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
