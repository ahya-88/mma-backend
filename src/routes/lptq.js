const express = require("express");
const { requireAuth, requireLPTQ, recordSensitiveAudit } = require("../auth");
const { validateBody } = require("../validator");
const {
  catatHafalan, semuaHafalan, hapusHafalan,
  catatUbudiyah, semuaUbudiyah, hapusUbudiyah,
  simpanRaportTahfidz, semuaRaportTahfidz, hapusRaportTahfidz,
} = require("../akademikService");

const router = express.Router();
const asyncHandler = require("../asyncHandler");
router.use(requireAuth, requireLPTQ);

router.get("/hafalan", asyncHandler(async (req, res) => res.json(await semuaHafalan(req.query.santriId))));
router.post("/hafalan", validateBody({
  santriId: { required: true, type: "string", label: "santriId" },
}), asyncHandler(async (req, res) => {
  const { santriId, juz, surah, ayat, predikat, nilaiTajwid, nilaiFashahah } = req.body || {};
  const hasil = await catatHafalan({
    santriId, juz, surah, ayat, predikat, nilaiTajwid, nilaiFashahah, dicatatOleh: req.user.nama,
  });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "lptq.hafalan_recorded",
    targetType: "Santri", targetId: santriId, ip: req.ip, sesudah: { juz, surah, ayat, predikat },
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

// Rapor Tahfidz
router.get("/raport", asyncHandler(async (req, res) => {
  res.json(await semuaRaportTahfidz(req.query));
}));
router.post("/raport", validateBody({
  santriId: { required: true, type: "string", label: "santriId" },
  tahunAjaran: { required: true, type: "string", label: "tahunAjaran" },
  semester: { required: true, type: "string", label: "semester" },
}), asyncHandler(async (req, res) => {
  const hasil = await simpanRaportTahfidz({
    ...req.body,
    dibuatOleh: req.user.nama,
  });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "lptq.raport_saved",
    targetType: "Santri", targetId: req.body.santriId, ip: req.ip, sesudah: { tahunAjaran: req.body.tahunAjaran, semester: req.body.semester },
  });
  res.status(201).json(hasil);
}));
router.delete("/raport/:id", asyncHandler(async (req, res) => {
  const hasil = await hapusRaportTahfidz(req.params.id);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "lptq.raport_deleted",
    targetType: "RaportTahfidz", targetId: req.params.id, ip: req.ip,
  });
  res.json(hasil);
}));

module.exports = router;

