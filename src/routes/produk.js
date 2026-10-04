const express = require("express");
const { requireAuth, requireUnitUsaha, requireAdmin, requireDashboardAdmin } = require("../auth");
const produk = require("../produkService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();

// Staf unit usaha hanya boleh mengelola katalog unitnya sendiri; body.unit tidak dipakai untuk
// menentukan target (selalu dipaksa dari token) supaya tidak bisa mengedit unit lain.
function assertUnitSendiri(req, res, next) {
  if (req.user.unit) return next();
  res.status(403).json({ error: "Akun ini tidak terikat ke satu bagian Unit Usaha." });
}

// ---- Admin: lihat seluruh katalog lintas unit ----
router.get("/", requireAuth, requireDashboardAdmin, asyncHandler(async (req, res) => res.json(await produk.semuaProdukSemuaUnit())));

// ---- Katalog unit sendiri (staf unit usaha) ----
router.get("/saya", requireAuth, requireUnitUsaha, assertUnitSendiri, asyncHandler(async (req, res) => res.json(await produk.semuaProdukUnit(req.user.unit))));

router.post("/", requireAuth, requireUnitUsaha, assertUnitSendiri, asyncHandler(async (req, res) => {
    const { nama, harga, kategori, barcode } = req.body || {};
    res.status(201).json(await produk.tambahProduk({ unit: req.user.unit, nama, harga, kategori, barcode }));
}));

router.put("/:id", requireAuth, requireUnitUsaha, assertUnitSendiri, asyncHandler(async (req, res) => {
    const { nama, harga, kategori, barcode, aktif } = req.body || {};
    res.json(await produk.editProduk({ id: req.params.id, unit: req.user.unit, nama, harga, kategori, barcode, aktif }));
}));

router.delete("/:id", requireAuth, requireUnitUsaha, assertUnitSendiri, asyncHandler(async (req, res) => res.json(await produk.hapusProduk(req.params.id, req.user.id))));

// ---- Lookup oleh scanner fisik di layar kasir (mode keyboard wedge) ----
// GET, bukan cuma dibaca dari /saya, karena kasir mem-fetch tepat 1 kode setelah scan+Enter,
// tanpa perlu menarik ulang seluruh katalog unit.
router.get("/saya/barcode/:kode", requireAuth, requireUnitUsaha, assertUnitSendiri, asyncHandler(async (req, res) => res.json(await produk.cariByBarcode(req.user.unit, req.params.kode))));

module.exports = router;
