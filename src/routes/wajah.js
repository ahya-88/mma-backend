/**
 * routes/wajah.js — v3: penyimpanan & distribusi embedding wajah.
 *
 * Server TIDAK memproses gambar. Embedding (192 float, hasil MobileFaceNet) dihitung
 * di aplikasi kasir (on-device) lalu disimpan di kolom Santri.faceEmbedding.
 *
 * Alur:
 *  1. Foto diunggah via pesantren-app (kolom `foto`). Bila foto berubah, /santri/upsert
 *     mengosongkan faceEmbedding santri itu.
 *  2. Kasir: GET /belum-embed  -> foto yang belum punya embedding (per batch)
 *            hitung embedding   -> PUT /embedding/:id
 *  3. Kasir: GET /embeddings    -> semua embedding (ringan) untuk dicocokkan offline.
 */
const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { requireAuth, requireUnitUsaha } = require("../auth");

const router = express.Router();
const EMB_DIM = 192;

const digest = (foto) => crypto.createHash("sha1").update(foto || "").digest("hex");

// Status sinkronisasi: berapa santri sudah punya foto / embedding.
router.get("/status", requireAuth, requireUnitUsaha, (req, res) => {
  const r = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN foto IS NOT NULL AND foto != '' THEN 1 ELSE 0 END) AS berfoto,
           SUM(CASE WHEN faceEmbedding IS NOT NULL AND faceEmbedding != '' THEN 1 ELSE 0 END) AS terindeks
    FROM Santri`).get();
  res.json({ total: r.total || 0, berfoto: r.berfoto || 0, terindeks: r.terindeks || 0 });
});

// Foto yang belum punya embedding. Dibatasi per batch agar payload tidak membengkak.
router.get("/belum-embed", requireAuth, requireUnitUsaha, (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 30);
  // Kursor `after` (id terakhir yang sudah diproses) supaya foto yang gagal diproses
  // (mis. wajah tak terdeteksi) tidak muncul lagi dan membuat sinkronisasi berputar terus.
  const after = typeof req.query.after === "string" ? req.query.after : "";
  const rows = db.prepare(`
    SELECT id, nama, foto FROM Santri
    WHERE foto IS NOT NULL AND foto != '' AND (faceEmbedding IS NULL OR faceEmbedding = '')
      AND id > ?
    ORDER BY id LIMIT ?`).all(after, limit);
  res.json(rows.map((r) => ({ id: r.id, nama: r.nama, foto: r.foto, fotoDigest: digest(r.foto) })));
});

// Simpan embedding hasil hitungan kasir. fotoDigest memastikan embedding tidak dipasang
// ke foto yang sudah diganti di tengah jalan.
router.put("/embedding/:id", requireAuth, requireUnitUsaha, (req, res) => {
  const { embedding, fotoDigest } = req.body || {};
  if (!Array.isArray(embedding) || embedding.length !== EMB_DIM || !embedding.every((x) => Number.isFinite(x))) {
    return res.status(400).json({ error: `embedding harus array ${EMB_DIM} angka.` });
  }
  const row = db.prepare("SELECT foto FROM Santri WHERE id = ?").get(req.params.id);
  if (!row || !row.foto) return res.status(404).json({ error: "Santri tidak ditemukan atau belum punya foto." });
  if (fotoDigest && fotoDigest !== digest(row.foto)) {
    return res.status(409).json({ error: "Foto santri berubah saat diproses. Sinkronkan ulang." });
  }
  // Normalisasi L2 di server sebagai pengaman, supaya dot product = cosine similarity.
  const norm = Math.sqrt(embedding.reduce((s, x) => s + x * x, 0));
  if (norm < 1e-6) return res.status(400).json({ error: "embedding tidak valid (norma nol)." });
  const unit = embedding.map((x) => Math.round((x / norm) * 1e6) / 1e6);
  db.prepare("UPDATE Santri SET faceEmbedding = ?, updatedAt = datetime('now') WHERE id = ?").run(JSON.stringify(unit), req.params.id);
  res.json({ ok: true });
});

// Semua embedding untuk cache lokal kasir (~2 KB per santri).
router.get("/embeddings", requireAuth, requireUnitUsaha, (req, res) => {
  const meta = db.prepare(`
    SELECT COUNT(*) AS total, MAX(updatedAt) AS lastUpdate
    FROM Santri WHERE faceEmbedding IS NOT NULL AND faceEmbedding != ''`).get();

  const etag = `W/"emb-${meta.total || 0}-${meta.lastUpdate || 0}"`;

  if (req.headers["if-none-match"] === etag) {
    return res.status(304).end();
  }

  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "no-cache, must-revalidate");

  const rows = db.prepare(`
    SELECT id, nama, nis, nisn, kelas, faceEmbedding FROM Santri
    WHERE faceEmbedding IS NOT NULL AND faceEmbedding != '' ORDER BY nama`).all();
  const out = [];
  for (const r of rows) {
    try {
      const emb = JSON.parse(r.faceEmbedding);
      if (Array.isArray(emb) && emb.length === EMB_DIM) {
        out.push({ id: r.id, nama: r.nama, nis: r.nis || "", nisn: r.nisn || "", kelas: r.kelas || "", embedding: emb });
      }
    } catch (_) { /* lewati baris rusak */ }
  }
  res.json(out);
});

module.exports = router;
