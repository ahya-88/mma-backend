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
const { requireAuth, requireBMT, requireUnitUsaha } = require("../auth");

const router = express.Router();
const EMB_DIM = 192;
const FACE_MODEL = db.FACE_MODEL;

const digest = (foto) => crypto.createHash("sha1").update(foto || "").digest("hex");

function parseEmbedding(value) {
  try {
    const embedding = typeof value === "string" ? JSON.parse(value) : value;
    if (Array.isArray(embedding) && embedding.length === EMB_DIM && embedding.every((x) => Number.isFinite(x))) return embedding;
  } catch (_) { /* embedding rusak tidak didistribusikan */ }
  return null;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function ringkasanSkor(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return {
    jumlah: sorted.length,
    min: sorted.length ? sorted[0] : null,
    p10: percentile(sorted, 0.1),
    median: percentile(sorted, 0.5),
    maks: sorted.length ? sorted[sorted.length - 1] : null,
  };
}

function fetchBelumEmbed(req, res) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 30);
  const after = typeof req.query.after === "string" ? req.query.after : "";
  const rows = db.prepare(`
    SELECT id, nama, foto FROM Santri
    WHERE foto IS NOT NULL AND foto != '' AND (faceEmbedding IS NULL OR faceEmbedding = '')
      AND id > ?
    ORDER BY id LIMIT ?`).all(after, limit);
  res.json(rows.map((row) => ({ id: row.id, nama: row.nama, foto: row.foto, fotoDigest: digest(row.foto) })));
}

// Rekap kesiapan data wajah — khusus BMT.
router.get("/status", requireAuth, requireBMT, (req, res) => {
  const totalSantri = db.prepare("SELECT COUNT(*) AS n FROM Santri").get().n;
  const adaFoto = db.prepare("SELECT COUNT(*) AS n FROM Santri WHERE foto IS NOT NULL AND foto != ''").get().n;
  const adaTemplate = db.prepare("SELECT COUNT(DISTINCT santriId) AS n FROM FaceTemplate WHERE modelVersion = ?").get(FACE_MODEL).n;
  const jumlahTemplateKamera = db.prepare("SELECT COUNT(*) AS n FROM FaceTemplate WHERE modelVersion = ? AND sumber = 'kamera'").get(FACE_MODEL).n;
  const fotoGagal = db.prepare(`
    SELECT s.id, s.nis, s.nama, s.kelas FROM Santri s
    WHERE s.foto IS NOT NULL AND s.foto != ''
      AND NOT EXISTS (
        SELECT 1 FROM FaceTemplate f
        WHERE f.santriId = s.id AND f.sumber = 'foto' AND f.modelVersion = ?
      )
    ORDER BY s.nama
  `).all(FACE_MODEL);
  res.json({ totalSantri, adaFoto, adaTemplate, tanpaFoto: totalSantri - adaFoto, fotoGagal, jumlahTemplateKamera });
});

// Kedua nama dipertahankan untuk kompatibilitas APK lama.
router.get("/belum-embed", requireAuth, requireUnitUsaha, fetchBelumEmbed);
router.get("/foto-belum-embed", requireAuth, requireUnitUsaha, fetchBelumEmbed);

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
  const serialized = JSON.stringify(unit);
  db.transaction(() => {
    db.prepare("UPDATE Santri SET faceEmbedding = ?, updatedAt = datetime('now') WHERE id = ?").run(serialized, req.params.id);
    db.prepare("DELETE FROM FaceTemplate WHERE santriId = ? AND sumber = 'foto'").run(req.params.id);
    db.prepare(`
      INSERT INTO FaceTemplate (santriId, embedding, sumber, modelVersion, dibuatOleh, dibuatPada)
      VALUES (?, ?, 'foto', ?, ?, datetime('now'))
    `).run(req.params.id, serialized, FACE_MODEL, req.user.id);
  })();
  res.json({ ok: true });
});

// Field embedding lama tetap berisi template foto terbaru; templates berisi semua sumber.
router.get("/embeddings", requireAuth, requireUnitUsaha, (req, res) => {
  const meta = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM Santri WHERE faceEmbedding IS NOT NULL AND faceEmbedding != '') AS total,
      (SELECT MAX(updatedAt) FROM Santri WHERE faceEmbedding IS NOT NULL AND faceEmbedding != '') AS lastUpdate,
      COUNT(*) AS templateCount, MAX(dibuatPada) AS templateLastUpdate, MAX(id) AS templateLastId
    FROM FaceTemplate WHERE modelVersion = ?
  `).get(FACE_MODEL);
  const etag = `W/"emb-${meta.total || 0}-${meta.lastUpdate || 0}-${meta.templateCount || 0}-${meta.templateLastUpdate || 0}-${meta.templateLastId || 0}"`;
  if (req.headers["if-none-match"] === etag) return res.status(304).end();
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "no-cache, must-revalidate");

  const templateRows = db.prepare(`
    SELECT santriId, embedding, sumber, modelVersion FROM FaceTemplate
    WHERE modelVersion = ? ORDER BY dibuatPada DESC, id DESC
  `).all(FACE_MODEL);
  const templatesBySantri = new Map();
  for (const template of templateRows) {
    const embedding = parseEmbedding(template.embedding);
    if (!embedding) continue;
    if (!templatesBySantri.has(template.santriId)) templatesBySantri.set(template.santriId, []);
    templatesBySantri.get(template.santriId).push({ embedding, sumber: template.sumber, modelVersion: template.modelVersion });
  }

  const rows = db.prepare("SELECT id, nama, nis, nisn, kelas FROM Santri ORDER BY nama").all();
  const out = [];
  for (const row of rows) {
    const templates = templatesBySantri.get(row.id) || [];
    if (!templates.length) continue;
    const foto = templates.find((template) => template.sumber === "foto");
    out.push({
      id: row.id,
      nama: row.nama,
      nis: row.nis || "",
      nisn: row.nisn || "",
      kelas: row.kelas || "",
      embedding: foto?.embedding ?? null,
      templates,
    });
  }
  res.json(out);
});

router.post("/:santriId/template", requireAuth, requireBMT, (req, res) => {
  const { embedding, sumber } = req.body || {};
  if (sumber !== "kamera") return res.status(400).json({ error: "sumber template harus 'kamera'." });
  if (!Array.isArray(embedding) || embedding.length !== EMB_DIM || !embedding.every((value) => typeof value === "number" && Number.isFinite(value))) {
    return res.status(400).json({ error: `embedding harus array ${EMB_DIM} angka berhingga.` });
  }
  const norm = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));
  if (norm < 0.95 || norm > 1.05) return res.status(400).json({ error: "norma embedding harus berada antara 0,95 dan 1,05." });
  if (!db.prepare("SELECT 1 FROM Santri WHERE id = ?").get(req.params.santriId)) {
    return res.status(404).json({ error: "Santri tidak ditemukan." });
  }

  const serialized = JSON.stringify(embedding);
  const result = db.transaction(() => {
    const count = db.prepare("SELECT COUNT(*) AS n FROM FaceTemplate WHERE santriId = ? AND sumber = 'kamera'");
    const oldest = db.prepare(`
      SELECT id FROM FaceTemplate WHERE santriId = ? AND sumber = 'kamera'
      ORDER BY dibuatPada ASC, id ASC LIMIT 1
    `);
    while (count.get(req.params.santriId).n >= 5) {
      const row = oldest.get(req.params.santriId);
      if (!row) break;
      db.prepare("DELETE FROM FaceTemplate WHERE id = ?").run(row.id);
    }
    return db.prepare(`
      INSERT INTO FaceTemplate (santriId, embedding, sumber, modelVersion, dibuatOleh, dibuatPada)
      VALUES (?, ?, 'kamera', ?, ?, datetime('now'))
    `).run(req.params.santriId, serialized, FACE_MODEL, req.user.id);
  })();
  res.status(201).json({ ok: true, id: Number(result.lastInsertRowid) });
});

router.delete("/:santriId/template", requireAuth, requireBMT, (req, res) => {
  if (req.query.sumber !== "kamera") return res.status(400).json({ error: "sumber yang dapat dihapus hanya 'kamera'." });
  const result = db.prepare("DELETE FROM FaceTemplate WHERE santriId = ? AND sumber = 'kamera'").run(req.params.santriId);
  res.json({ ok: true, dihapus: result.changes });
});

router.post("/log", requireAuth, requireUnitUsaha, (req, res) => {
  const body = req.body || {};
  const validasiId = (value) => value === null || (typeof value === "string" && value.length > 0 && value.length <= 128);
  const validasiSkor = (value) => value === null || (typeof value === "number" && Number.isFinite(value) && value >= -1 && value <= 1);
  const { terbaikId, skorTerbaik, skorKedua, dikonfirmasiId, metode, ms, jumlahFrame } = body;
  if (!validasiId(terbaikId) || !validasiId(dikonfirmasiId)) {
    return res.status(400).json({ error: "terbaikId dan dikonfirmasiId harus teks atau null." });
  }
  if (!validasiSkor(skorTerbaik) || !validasiSkor(skorKedua)) {
    return res.status(400).json({ error: "skorTerbaik dan skorKedua harus angka antara -1 dan 1 atau null." });
  }
  if (skorTerbaik !== null && skorKedua !== null && skorKedua > skorTerbaik) {
    return res.status(400).json({ error: "skorKedua tidak boleh lebih besar dari skorTerbaik." });
  }
  if (typeof metode !== "string" || !metode.trim() || metode.length > 50) {
    return res.status(400).json({ error: "metode wajib berupa teks maksimal 50 karakter." });
  }
  if (!Number.isSafeInteger(ms) || ms < 0 || ms > 600000) {
    return res.status(400).json({ error: "ms harus bilangan bulat antara 0 dan 600000." });
  }
  if (!Number.isSafeInteger(jumlahFrame) || jumlahFrame < 0 || jumlahFrame > 1000) {
    return res.status(400).json({ error: "jumlahFrame harus bilangan bulat antara 0 dan 1000." });
  }

  const result = db.prepare(`
    INSERT INTO LogWajah (waktu, petugasId, unit, terbaikId, skorTerbaik, skorKedua, dikonfirmasiId, metode, ms, jumlahFrame)
    VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, req.user.unit || null, terbaikId, skorTerbaik, skorKedua, dikonfirmasiId, metode.trim(), ms, jumlahFrame);
  res.status(201).json({ ok: true, id: Number(result.lastInsertRowid) });
});

router.get("/log/ringkasan", requireAuth, requireBMT, (req, res) => {
  const logs = db.prepare("SELECT terbaikId, skorTerbaik, dikonfirmasiId FROM LogWajah").all();
  const terkonfirmasi = logs.filter((row) => row.dikonfirmasiId !== null);
  const benar = terkonfirmasi.filter((row) => row.terbaikId === row.dikonfirmasiId);
  const salah = terkonfirmasi.filter((row) => row.terbaikId !== row.dikonfirmasiId);
  const skorBenar = ringkasanSkor(benar.map((row) => row.skorTerbaik));
  const skorSalah = ringkasanSkor(salah.map((row) => row.skorTerbaik));

  let saranAmbang = null;
  let alasanSaranAmbang = "data belum cukup";
  if (logs.length >= 30 && salah.length >= 5) {
    const salahBerskor = salah.map((row) => row.skorTerbaik).filter(Number.isFinite).sort((a, b) => a - b);
    const benarBerskor = benar.map((row) => row.skorTerbaik).filter(Number.isFinite);
    if (salahBerskor.length && benarBerskor.length) {
      const p99Salah = percentile(salahBerskor, 0.99);
      const diAtasP99 = benarBerskor.filter((score) => score > p99Salah);
      if (diAtasP99.length) {
        saranAmbang = Math.min(...diAtasP99);
        alasanSaranAmbang = null;
      } else alasanSaranAmbang = "tidak ada skor benar di atas p99 skor salah";
    } else alasanSaranAmbang = "data skor belum cukup";
  }

  res.json({
    jumlahLog: logs.length,
    akurasiTop1: terkonfirmasi.length ? benar.length / terkonfirmasi.length : null,
    skorBenar,
    skorSalah,
    saranAmbang,
    alasanSaranAmbang,
  });
});

module.exports = router;
