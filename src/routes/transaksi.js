const express = require("express");
const { requireAuth, requireUnitUsaha, isSuperAdmin } = require("../auth");
const { catatTransaksi, auditSaldo, sinkronisasiOfflineKasir } = require("../cashlessService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();

router.get("/audit-saldo", requireAuth, asyncHandler(async (req, res) => {
  const isAdmin = isSuperAdmin(req.user);
  const isBMT = req.user?.role === "guru" && req.user.departemen === "unitusaha" && req.user.unit === "BMT";
  if (!isAdmin && !isBMT) return res.status(403).json({ error: "Hanya akun Superadmin atau staf BMT yang berwenang mengakses audit saldo." });
  res.json(await auditSaldo());
}));

router.post("/", requireAuth, requireUnitUsaha, asyncHandler(async (req, res) => {
  const { santriId, jenis: jenisInput, kategori: kategoriInput, subKategori, jumlah, keterangan, bulan, pin, metode, idempotencyKey } = req.body || {};
  if (!santriId || !jumlah) return res.status(400).json({ error: "santriId dan jumlah wajib diisi." });
  const jenis = jenisInput || "Tarik Tunai";
  const kategori = kategoriInput || (jenis === "Tarik Tunai" ? "Jajan Harian" : undefined);
  const unit = req.user.unit;
  const hasil = await catatTransaksi({
    santriId, unit, jenis, kategori, subKategori, jumlah, keterangan, bulan, idempotencyKey,
    pin, validasiPin: jenis === "Tarik Tunai", petugasId: req.user.id,
    metode: ["qr", "wajah", "manual"].includes(metode) ? metode : null,
  });
  res.status(hasil.idempotentReplay ? 200 : 201).json(hasil);
}));

router.post("/sync-offline", requireAuth, requireUnitUsaha, asyncHandler(async (req, res) => {
  const items = req.body?.items || [];
  const hasil = await sinkronisasiOfflineKasir({
    items, kasirId: req.user.id, unit: req.user.unit,
  });
  res.json(hasil);
}));

module.exports = router;
