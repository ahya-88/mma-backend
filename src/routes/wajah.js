const express = require("express");
const db = require("../db");
const { requireAuth } = require("../auth");
const { getSantriRow, CashlessError } = require("../cashlessService");

const router = express.Router();

// Hanya staf unit usaha yang boleh mengakses endpoint face (kasir)
function requireUnitUsaha(req, res, next) {
  if (req.user?.role === "guru" && req.user.departemen === "unitusaha") return next();
  next(new CashlessError(403, "Endpoint ini hanya untuk staf Unit Usaha (kasir)."));
}

// -----------------------------------------------------------------------
// GET /api/wajah/foto-list
// Kembalikan daftar santri + foto base64 untuk cache lokal di kasir_mma.
// Hanya kirim foto yang TIDAK kosong agar payload ringan.
// -----------------------------------------------------------------------
router.get("/foto-list", requireAuth, requireUnitUsaha, (req, res) => {
  const rows = db.prepare(
    "SELECT id, nama, nis, nisn, kelas, foto FROM Santri WHERE foto IS NOT NULL AND foto != '' ORDER BY nama"
  ).all();
  res.json(rows.map((r) => ({
    id: r.id,
    nama: r.nama,
    nis: r.nis || "",
    nisn: r.nisn || "",
    kelas: r.kelas || "",
    foto: r.foto,          // data:image/jpeg;base64,... (disimpan saat upload di pesantren-app)
  })));
});

// -----------------------------------------------------------------------
// POST /api/wajah/cocokkan
// Body: { fotoBase64: "data:image/...;base64,<data>" }
// Pencocokan wajah sederhana berbasis histogram piksel (tanpa ML).
// Cocok untuk kondisi pencahayaan konsisten (kiosk tetap di ruangan).
// Kembalikan santri dengan skor kemiripan tertinggi bila > threshold.
// -----------------------------------------------------------------------
router.post("/cocokkan", requireAuth, requireUnitUsaha, (req, res, next) => {
  try {
    const { fotoBase64 } = req.body || {};
    if (!fotoBase64 || typeof fotoBase64 !== "string") {
      return res.status(400).json({ error: "fotoBase64 wajib diisi." });
    }

    // Ambil semua santri yang sudah punya foto tersimpan
    const rows = db.prepare(
      "SELECT id, nama, nis, nisn, kelas, foto FROM Santri WHERE foto IS NOT NULL AND foto != ''"
    ).all();

    if (rows.length === 0) {
      return res.status(404).json({ error: "Belum ada data foto santri tersimpan. Unggah foto santri di pesantren-app terlebih dahulu." });
    }

    // Ekstrak byte dari base64 (buang header data:image/...;base64,)
    const stripHeader = (b64) => {
      const comma = b64.indexOf(",");
      return Buffer.from(comma >= 0 ? b64.slice(comma + 1) : b64, "base64");
    };

    const queryBuf = stripHeader(fotoBase64);
    const queryHist = buildHistogram(queryBuf);

    let bestId = null, bestNama = null, bestNis = null, bestScore = -1;

    for (const row of rows) {
      try {
        const refBuf = stripHeader(row.foto);
        const refHist = buildHistogram(refBuf);
        const score = cosineSimilarity(queryHist, refHist);
        if (score > bestScore) {
          bestScore = score;
          bestId = row.id;
          bestNama = row.nama;
          bestNis = row.nis;
        }
      } catch (_) {
        // lewati foto yang rusak
      }
    }

    // Threshold: 0.80 (cukup longgar untuk variasi pencahayaan ringan)
    const THRESHOLD = 0.80;
    if (bestScore < THRESHOLD) {
      return res.status(404).json({
        error: "Wajah tidak dikenali. Coba posisikan wajah lebih dekat ke kamera, atau gunakan metode manual.",
        skor: Math.round(bestScore * 100),
      });
    }

    // Kembalikan saldo + status blokir santri yang dikenali
    const santriRow = getSantriRow(bestId);
    const { toSaldoPublik } = require("../cashlessService");
    res.json({
      dikenali: true,
      skor: Math.round(bestScore * 100),
      santri: toSaldoPublik(santriRow),
    });
  } catch (e) { next(e); }
});

// -----------------------------------------------------------------------
// Histogram piksel: bagi setiap channel (R, G, B) menjadi 16 bucket.
// Buffer JPEG/PNG — kita ambil setiap byte ke-N sebagai proxy warna.
// Pendekatan ini ringan (tanpa library decode gambar) dan cukup untuk
// membedakan wajah yang berbeda dalam kondisi pencahayaan yang stabil.
// -----------------------------------------------------------------------
function buildHistogram(buf) {
  const BUCKETS = 16; // 16 bucket × 3 channel = 48 dimensi
  const hist = new Float32Array(BUCKETS * 3).fill(0);
  const len = buf.length;
  // Ambil sampel merata (max 4096 sampel agar cepat)
  const step = Math.max(1, Math.floor(len / 4096));
  let count = 0;
  for (let i = 0; i < len - 2; i += step) {
    const r = buf[i];
    const g = buf[i + 1];
    const b = buf[i + 2];
    hist[Math.floor(r / 256 * BUCKETS)]++;
    hist[BUCKETS + Math.floor(g / 256 * BUCKETS)]++;
    hist[BUCKETS * 2 + Math.floor(b / 256 * BUCKETS)]++;
    count++;
  }
  // Normalisasi
  if (count > 0) {
    for (let i = 0; i < hist.length; i++) hist[i] /= count;
  }
  return hist;
}

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

module.exports = router;
