const express = require("express");
const { requireAuth, requireLPTQ, recordSensitiveAudit } = require("../auth");
const { validateBody } = require("../validator");
const { catatHafalan, semuaHafalan, hapusHafalan, catatUbudiyah, semuaUbudiyah, hapusUbudiyah } = require("../akademikService");

const router = express.Router();
const asyncHandler = require("../asyncHandler");
router.use(requireAuth, requireLPTQ);

router.get("/hafalan", asyncHandler(async (req, res) => res.json(await semuaHafalan())));
router.post("/hafalan", validateBody({
  santriId: { required: true, type: "string", label: "santriId" },
}), asyncHandler(async (req, res) => {
  const { santriId, juz } = req.body || {};
  const hasil = await catatHafalan({ santriId, juz, dicatatOleh: req.user.nama });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "lptq.hafalan_recorded",
    targetType: "Santri", targetId: santriId, ip: req.ip, sesudah: { juz },
  });
  res.status(201).json(hasil);
}));
router.delete("/hafalan/:id", asyncHandler(async (req, res) => {
  const hasil = await hapusHafalan(req.params.id, req.user.id);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "lptq.hafalan_deleted",
    targetType: "Hafalan", targetId: req.params.id, ip: req.ip,
  });
  res.json(hasil);
}));

router.get("/ubudiyah", asyncHandler(async (req, res) => res.json(await semuaUbudiyah())));
router.post("/ubudiyah", validateBody({
  santriId: { required: true, type: "string", label: "santriId" },
}), asyncHandler(async (req, res) => {
  const { santriId, jenis, materi, predikat, catatan } = req.body || {};
  const hasil = await catatUbudiyah({ santriId, jenis, materi, predikat, catatan, dicatatOleh: req.user.nama });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "lptq.ubudiyah_recorded",
    targetType: "Santri", targetId: santriId, ip: req.ip, sesudah: { jenis, materi, predikat },
  });
  res.status(201).json(hasil);
}));
router.delete("/ubudiyah/:id", asyncHandler(async (req, res) => {
  const hasil = await hapusUbudiyah(req.params.id, req.user.id);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "lptq.ubudiyah_deleted",
    targetType: "Ubudiyah", targetId: req.params.id, ip: req.ip,
  });
  res.json(hasil);
}));

module.exports = router;
