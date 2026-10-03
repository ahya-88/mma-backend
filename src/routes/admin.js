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

module.exports = router;