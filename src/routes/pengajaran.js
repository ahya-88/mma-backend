const express = require("express");
const { requireAuth, requirePengajaran, recordSensitiveAudit } = require("../auth");
const { validateBody } = require("../validator");
const { catatNilai, semuaNilai, hapusNilai, catatPrestasi, semuaPrestasi, hapusPrestasi } = require("../akademikService");

const router = express.Router();
const asyncHandler = require("../asyncHandler");
router.use(requireAuth, requirePengajaran);

router.get("/nilai", asyncHandler(async (req, res) => res.json(await semuaNilai())));
router.post("/nilai", validateBody({
  santriId: { required: true, type: "string", label: "santriId" },
  mapel: { required: true, type: "string", label: "mapel" },
}), asyncHandler(async (req, res) => {
  const { santriId, mapel, nilai } = req.body || {};
  const hasil = await catatNilai({ santriId, mapel, nilai, dicatatOleh: req.user.nama });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.nilai_recorded",
    targetType: "Santri", targetId: santriId, ip: req.ip, sesudah: { mapel, nilai },
  });
  res.status(201).json(hasil);
}));
router.delete("/nilai/:id", asyncHandler(async (req, res) => {
  const hasil = await hapusNilai(req.params.id, req.user.id);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.nilai_deleted",
    targetType: "Nilai", targetId: req.params.id, ip: req.ip,
  });
  res.json(hasil);
}));

router.get("/prestasi", asyncHandler(async (req, res) => res.json(await semuaPrestasi())));
router.post("/prestasi", validateBody({
  santriId: { required: true, type: "string", label: "santriId" },
  judul: { required: true, type: "string", label: "judul" },
}), asyncHandler(async (req, res) => {
  const { santriId, judul, tingkat } = req.body || {};
  const hasil = await catatPrestasi({ santriId, judul, tingkat, dicatatOleh: req.user.nama });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.prestasi_recorded",
    targetType: "Santri", targetId: santriId, ip: req.ip, sesudah: { judul, tingkat },
  });
  res.status(201).json(hasil);
}));
router.delete("/prestasi/:id", asyncHandler(async (req, res) => {
  const hasil = await hapusPrestasi(req.params.id, req.user.id);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.prestasi_deleted",
    targetType: "Prestasi", targetId: req.params.id, ip: req.ip,
  });
  res.json(hasil);
}));

module.exports = router;
