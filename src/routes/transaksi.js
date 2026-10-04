const express = require("express");
const { requireAuth, requireBMT, requireAdminUnitUsaha, requireUnitUsaha, isSuperAdmin } = require("../auth");
const { catatTransaksi, auditSaldo, sinkronisasiOfflineKasir } = require("../cashlessService");
const { catatTransaksiUnitUsaha, semuaTransaksiUnitUsaha, hapusTransaksiUnitUsaha, laporanCashflowUnitUsaha } = require("../keuanganService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();

router.get("/audit-saldo", requireAuth, asyncHandler(async (req, res) => {
  const isAdmin = isSuperAdmin(req.user);
  const isBMT = req.user?.role === "guru" && req.user.departemen === "unitusaha" && req.user.unit === "BMT";
  const isKeuangan = req.user?.role === "guru" && req.user.departemen === "administrasi";
  if (!isAdmin && !isBMT && !isKeuangan) return res.status(403).json({ error: "Hanya akun Superadmin, BMT, atau Keuangan yang berwenang mengakses audit saldo." });
  res.json(await auditSaldo());
}));

// ---- Endpoint Transaksi Unit Usaha (Pengaturan & Cashflow Admin Unit Usaha: Keuangan, BMT, Superadmin) ----
router.get("/unit-usaha", requireAuth, asyncHandler(async (req, res) => {
  const isAdmin = isSuperAdmin(req.user);
  const isBMT = req.user?.role === "guru" && req.user.departemen === "unitusaha" && req.user.unit === "BMT";
  const isKeuangan = req.user?.role === "guru" && req.user.departemen === "administrasi";
  const isAdminUnit = isAdmin || isBMT || isKeuangan;
  const selectedUnit = isAdminUnit ? req.query.unit : (req.user?.unit || req.query.unit);
  res.json(await semuaTransaksiUnitUsaha({ unit: selectedUnit }));
}));

router.get("/unit-usaha/laporan", requireAuth, asyncHandler(async (req, res) => {
  const isAdmin = isSuperAdmin(req.user);
  const isBMT = req.user?.role === "guru" && req.user.departemen === "unitusaha" && req.user.unit === "BMT";
  const isKeuangan = req.user?.role === "guru" && req.user.departemen === "administrasi";
  const isAdminUnit = isAdmin || isBMT || isKeuangan;
  const selectedUnit = isAdminUnit ? req.query.unit : (req.user?.unit || req.query.unit);
  res.json(await laporanCashflowUnitUsaha({ unit: selectedUnit }));
}));

router.post("/unit-usaha", requireAuth, requireAdminUnitUsaha, asyncHandler(async (req, res) => {
  const { jenis, unitAsal, unitTujuan, jumlah, keterangan } = req.body || {};
  res.status(201).json(await catatTransaksiUnitUsaha({
    jenis, unitAsal, unitTujuan, jumlah, keterangan,
    dicatatOleh: req.user.nama, aktorId: req.user.id,
  }));
}));

router.delete("/unit-usaha/:id", requireAuth, requireAdminUnitUsaha, asyncHandler(async (req, res) => {
  res.json(await hapusTransaksiUnitUsaha(req.params.id, req.user.id));
}));

// ---- Endpoint Transaksi Cashless Santri ----
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
