const express = require("express");
const { requireAuth, requireBMT, requireAdminUnitUsaha, requireUnitUsaha, isSuperAdmin } = require("../auth");
const { catatTransaksi, auditSaldo, sinkronisasiOfflineKasir, laporanOfflineKasir, koreksiSaldo } = require("../cashlessService");
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

router.get("/offline-report", requireAuth, asyncHandler(async (req, res) => {
  const isAdmin = isSuperAdmin(req.user);
  const isBMT = req.user?.role === "guru" && req.user.departemen === "unitusaha" && req.user.unit === "BMT";
  const isKeuangan = req.user?.role === "guru" && req.user.departemen === "administrasi";
  if (!isAdmin && !isBMT && !isKeuangan) return res.status(403).json({ error: "Hanya akun Superadmin, BMT, atau Keuangan yang berwenang mengakses laporan offline." });
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 50);
  const statusSync = req.query.statusSync;
  res.json(await laporanOfflineKasir({ page, limit, statusSync }));
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
  const { santriId, jenis: jenisInput, kategori: kategoriInput, subKategori, jumlah, keterangan, bulan, pin, metode } = req.body || {};
  const idempotencyKey = req.headers["idempotency-key"] || req.headers["x-idempotency-key"] || req.body?.idempotencyKey;
  if (!santriId || !jumlah) return res.status(400).json({ error: "santriId dan jumlah wajib diisi." });
  const jenis = jenisInput || "Tarik Tunai";
  const kategori = kategoriInput || (jenis === "Tarik Tunai" ? "Jajan Harian" : undefined);
  const unit = req.body?.unit || req.user.unit || "BMT";
  const hasil = await catatTransaksi({
    santriId, unit, jenis, kategori, subKategori, jumlah, keterangan, bulan, idempotencyKey,
    pin, validasiPin: jenis === "Tarik Tunai", petugasId: req.user.id,
    metode: ["qr", "wajah", "manual"].includes(metode) ? metode : null,
  });
  if (hasil.idempotentReplay) res.setHeader("X-Idempotent-Replay", "true");
  res.status(hasil.idempotentReplay ? 200 : 201).json(hasil);
}));

router.post("/koreksi", requireAuth, asyncHandler(async (req, res) => {
  const isAdmin = isSuperAdmin(req.user);
  const isBMT = req.user?.role === "guru" && req.user.departemen === "unitusaha" && req.user.unit === "BMT";
  const isKeuangan = req.user?.role === "guru" && req.user.departemen === "administrasi";
  if (!isAdmin && !isBMT && !isKeuangan) {
    return res.status(403).json({ error: "Akses ditolak. Hanya BMT/Keuangan/Superadmin yang dapat melakukan koreksi." });
  }
  const { santriId, jumlah, alasan } = req.body || {};
  const idempotencyKey = req.headers["idempotency-key"] || req.headers["x-idempotency-key"] || req.body?.idempotencyKey;
  const hasil = await koreksiSaldo({
    santriId, jumlah, alasan, dikoreksiOleh: req.user.nama || req.user.id, idempotencyKey,
  });
  if (hasil.idempotentReplay) res.setHeader("X-Idempotent-Replay", "true");
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
