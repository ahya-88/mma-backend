const express = require("express");
const { requireAuth, requireAdmin } = require("../auth");
const admin = require("../adminService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();

router.get("/guru", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.json(await admin.semuaGuru())));
router.post("/guru", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.status(201).json(await admin.buatGuru(req.body || {}))));
router.put("/guru/:id", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.json(await admin.editGuru({ id: req.params.id, ...(req.body || {}) }))));
router.put("/guru/:id/password", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.json(await admin.editPasswordGuru({ id: req.params.id, password: (req.body || {}).password }))));
router.delete("/guru/:id", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.json(await admin.hapusGuru({ id: req.params.id, actingUserId: req.user.id }))));

router.get("/unit-usaha", requireAuth, asyncHandler(async (req, res) => res.json(await admin.semuaUnitUsaha())));
router.post("/unit-usaha", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.status(201).json(await admin.tambahUnitUsaha((req.body || {}).nama))));
router.delete("/unit-usaha/:id", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.json(await admin.hapusUnitUsaha(req.params.id))));

router.get("/tahun-ajaran", requireAuth, asyncHandler(async (req, res) => res.json(await admin.semuaTahunAjaran())));
router.post("/tahun-ajaran", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.status(201).json(await admin.tambahTahunAjaran((req.body || {}).tahunMulai))));
router.post("/tahun-ajaran/:id/aktifkan", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.json(await admin.aktifkanTahunAjaran(req.params.id))));
router.delete("/tahun-ajaran/:id", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.json(await admin.hapusTahunAjaran(req.params.id))));

router.get("/tampilan", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.json(await admin.ambilTampilan())));
router.put("/tampilan", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.json(await admin.simpanTampilan(req.body || {}))));
router.get("/ringkasan", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.json(await admin.ringkasanSuperadmin())));
router.get("/wali", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.json(await admin.daftarWali())));
router.get("/kartu", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.set("Cache-Control", "no-store").json(await admin.daftarKartuSuperadmin())));
router.get("/permintaan", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.json(await admin.daftarPermintaanSuperadmin())));
router.get("/akses", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.json({
  id: req.user.id, nama: req.user.nama, departemen: req.user.departemen,
})));
router.put("/produk/:id/status", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  res.json(await admin.ubahStatusProduk({ id: req.params.id, aktif: (req.body || {}).aktif }));
}));
router.get("/audit", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 50);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ error: "page harus minimal 1 dan limit harus antara 1 sampai 100." });
  }
  res.json(await admin.daftarAuditSuperadmin({ page, limit }));
}));

module.exports = router;