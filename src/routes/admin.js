const express = require("express");
const { requireAuth, requireAdmin, requirePasswordResetAuthority, requireDashboardAdmin, requireSekretariat, jenisAkunEfektif } = require("../auth");
const admin = require("../adminService");
const impor = require("../imporService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();

router.get("/guru", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.json(await admin.semuaGuru())));
router.post("/guru", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.status(201).json(await admin.buatGuru({
  ...(req.body || {}), actingUserId: req.user.id,
}))));
router.put("/guru/:id", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id && req.body?.jenisAkun && req.body.jenisAkun !== "superadmin") {
    return res.status(400).json({ error: "Tidak dapat menurunkan jenis akun Superadmin yang sedang digunakan." });
  }
  res.json(await admin.editGuru({ id: req.params.id, ...(req.body || {}), actingUserId: req.user.id }));
}));
router.put("/guru/:id/password", requireAuth, requirePasswordResetAuthority, asyncHandler(async (req, res) => res.json(await admin.editPasswordGuru({
  id: req.params.id, password: (req.body || {}).password, actingUserId: req.user.id,
}))));
router.put("/wali/:id/password", requireAuth, requirePasswordResetAuthority, asyncHandler(async (req, res) => res.json(await admin.editPasswordWali({
  id: req.params.id, password: (req.body || {}).password, actingUserId: req.user.id,
}))));
router.delete("/guru/:id", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.json(await admin.hapusGuru({ id: req.params.id, actingUserId: req.user.id }))));

router.get("/unit-usaha", requireAuth, asyncHandler(async (req, res) => res.json(await admin.semuaUnitUsaha())));
router.post("/unit-usaha", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.status(201).json(await admin.tambahUnitUsaha((req.body || {}).nama))));
router.delete("/unit-usaha/:id", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.json(await admin.hapusUnitUsaha(req.params.id, req.user.id))));

router.get("/tahun-ajaran", requireAuth, asyncHandler(async (req, res) => res.json(await admin.semuaTahunAjaran())));
router.post("/tahun-ajaran", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.status(201).json(await admin.tambahTahunAjaran((req.body || {}).tahunMulai))));
router.post("/tahun-ajaran/:id/aktifkan", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.json(await admin.aktifkanTahunAjaran(req.params.id))));
router.delete("/tahun-ajaran/:id", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.json(await admin.hapusTahunAjaran(req.params.id, req.user.id))));

router.get("/tampilan", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.json(await admin.ambilTampilan())));
router.put("/tampilan", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.json(await admin.simpanTampilan(req.body || {}))));
router.get("/ringkasan", requireAuth, requireDashboardAdmin, asyncHandler(async (req, res) => res.json(await admin.ringkasanSuperadmin())));
router.get("/wali", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.json(await admin.daftarWali())));
router.get("/kartu", requireAuth, requireAdmin, asyncHandler(async (req, res) => res.set("Cache-Control", "no-store").json(await admin.daftarKartuSuperadmin())));
router.get("/permintaan", requireAuth, requireDashboardAdmin, asyncHandler(async (req, res) => res.json(await admin.daftarPermintaanSuperadmin())));
router.get("/akses", requireAuth, requireDashboardAdmin, asyncHandler(async (req, res) => res.json({
  id: req.user.id, nama: req.user.nama, departemen: req.user.departemen,
  jenisAkun: jenisAkunEfektif(req.user),
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

// ---- FASE 2: Endpoint Impor Bertahap, Provisioning Akun, & Kelengkapan Data ----
router.get("/impor/template", requireAuth, requireSekretariat, asyncHandler(async (req, res) => {
  const csvContent = impor.buatTemplateImporCSV();
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", 'attachment; filename="Template_Impor_Santri_MMA.csv"');
  res.send(csvContent);
}));

router.post("/impor/dry-run", requireAuth, requireSekretariat, asyncHandler(async (req, res) => {
  const rows = req.body?.rows || [];
  res.json(await impor.prosesDryRunImpor(rows));
}));

router.post("/impor/eksekusi", requireAuth, requireSekretariat, asyncHandler(async (req, res) => {
  const { namaBatch, rows } = req.body || {};
  res.status(201).json(await impor.eksekusiImporBatch({
    namaBatch, rows: rows || [], aktorId: req.user.id, aktorNama: req.user.nama,
  }));
}));

router.post("/impor/rollback/:batchId", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  res.json(await impor.rollbackBatchImpor(req.params.batchId, req.user.id));
}));

router.post("/wali/provision-batch", requireAuth, requireSekretariat, asyncHandler(async (req, res) => {
  const { santriIds, batchId } = req.body || {};
  res.json(await impor.provisionAkunWali({ santriIds, batchId, aktorId: req.user.id }));
}));

router.post("/wali/tautkan-anak", requireAuth, requireSekretariat, asyncHandler(async (req, res) => {
  const { santriId, waliId } = req.body || {};
  res.json(await impor.tautkanAnakKeWali({ santriId, waliId, aktorId: req.user.id }));
}));

router.post("/impor/rekonsiliasi", requireAuth, requireSekretariat, asyncHandler(async (req, res) => {
  const { batchId, tipe, items, totalKasTarget } = req.body || {};
  res.json(await impor.rekonsiliasiSaldoDanTagihan({
    batchId, tipe, items, totalKasTarget, aktorId: req.user.id, dicatatOleh: req.user.nama,
  }));
}));

router.get("/kelengkapan-data", requireAuth, requireSekretariat, asyncHandler(async (req, res) => {
  res.json(await impor.kelengkapanDataSekretariat());
}));

router.post("/bersihkan-demo", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { konfirmasi } = req.body || {};
  res.json(await impor.bersihkanDataDemo({ konfirmasi: !!konfirmasi, aktorId: req.user.id }));
}));

module.exports = router;
