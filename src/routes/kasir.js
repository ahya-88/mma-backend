const express = require("express");
const { queryAll } = require("../db");
const { requireAuth, requireUnitUsaha } = require("../auth");
const { toPublicSantri } = require("../cashlessService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();

// GET /api/kasir/snapshot - Snapshot data santri & produk untuk offline cache aplikasi kasir
router.get("/snapshot", requireAuth, requireUnitUsaha, asyncHandler(async (req, res) => {
  const unit = req.user?.unit || "Kantin";

  // Ambil data santri aktif
  const santriRows = await queryAll(
    `SELECT "id", "nama", "kelas", "nis", "nisn", "saldo", "limitJajanHarian", "durasiBlokirHari",
            "blokirAktif", "blokirSejakISO", "blokirSampaiISO", "blokirAlasan",
            "kartuTerbit", "pinHash", "faceEmbedding"
     FROM "Santri"
     ORDER BY "nama" ASC`
  );

  const santriList = await Promise.all(santriRows.map((s) => toPublicSantri(s, false)));

  // Ambil katalog produk aktif unit kasir
  const produkRows = await queryAll(
    `SELECT "id", "nama", "harga", "kategori", "barcode", "stok", "unit"
     FROM "ProdukUnitUsaha"
     WHERE "unit" = $1 AND "aktif" = 1
     ORDER BY "nama" ASC`,
    [unit]
  );

  const produkList = produkRows.map((p) => ({
    id: p.id,
    nama: p.nama,
    harga: Number(p.harga),
    kategori: p.kategori || "",
    barcode: p.barcode || "",
    stok: Number(p.stok || 0),
    unit: p.unit,
  }));

  res.json({
    santri: santriList,
    produk: produkList,
    waktu: new Date().toISOString(),
  });
}));

module.exports = router;
