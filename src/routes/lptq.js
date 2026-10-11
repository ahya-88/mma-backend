const express = require("express");
const { requireAuth, requireLPTQ, requireAnyStaff, recordSensitiveAudit } = require("../auth");
const { validateBody } = require("../validator");
const {
  semuaHalaqoh, tambahHalaqoh, ubahHalaqoh, hapusHalaqoh,
  semuaMateriUbudiyah, tambahMateriUbudiyah, hapusMateriUbudiyah,
  catatHafalan, ubahHafalan, semuaHafalan, hapusHafalan,
  catatUbudiyah, ubahUbudiyah, semuaUbudiyah, hapusUbudiyah,
  simpanRaportTahfidz, semuaRaportTahfidz, hapusRaportTahfidz,
} = require("../akademikService");

const router = express.Router();
const asyncHandler = require("../asyncHandler");
router.use(requireAuth);

// ==================== MASTER HALAQOH ====================
router.get("/halaqoh", requireAnyStaff, asyncHandler(async (req, res) => {
  res.json(await semuaHalaqoh());
}));

router.post("/halaqoh", requireLPTQ, validateBody({
  nama: { required: true, type: "string", label: "nama" },
}), asyncHandler(async (req, res) => {
  const { nama, pembimbingId } = req.body || {};
  const hasil = await tambahHalaqoh({ nama, pembimbingId });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "lptq.halaqoh_created",
    targetType: "MasterHalaqoh", targetId: hasil.id, ip: req.ip, sesudah: { nama, pembimbingId },
  });
  res.status(201).json(hasil);
}));

router.put("/halaqoh/:id", requireLPTQ, asyncHandler(async (req, res) => {
  const { nama, pembimbingId } = req.body || {};
  const hasil = await ubahHalaqoh(req.params.id, { nama, pembimbingId });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "lptq.halaqoh_updated",
    targetType: "MasterHalaqoh", targetId: req.params.id, ip: req.ip, sesudah: { nama, pembimbingId },
  });
  res.json(hasil);
}));

router.put("/halaqoh/:id/pembimbing", requireLPTQ, asyncHandler(async (req, res) => {
  const { pembimbingId } = req.body || {};
  const hasil = await ubahHalaqoh(req.params.id, { pembimbingId });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "lptq.halaqoh_pembimbing_assigned",
    targetType: "MasterHalaqoh", targetId: req.params.id, ip: req.ip, sesudah: { pembimbingId },
  });
  res.json(hasil);
}));

router.delete("/halaqoh/:id", requireLPTQ, asyncHandler(async (req, res) => {
  const hasil = await hapusHalaqoh(req.params.id);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "lptq.halaqoh_deleted",
    targetType: "MasterHalaqoh", targetId: req.params.id, ip: req.ip,
  });
  res.json(hasil);
}));

// ==================== MASTER MATERI UBUDIYAH & DOA ====================
router.get("/materi-ubudiyah", requireAnyStaff, asyncHandler(async (req, res) => {
  res.json(await semuaMateriUbudiyah(req.query.jenis));
}));

router.post("/materi-ubudiyah", requireLPTQ, validateBody({
  jenis: { required: true, type: "string", label: "jenis" },
  nama: { required: true, type: "string", label: "nama" },
}), asyncHandler(async (req, res) => {
  const { jenis, nama } = req.body || {};
  const hasil = await tambahMateriUbudiyah({ jenis, nama });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "lptq.materi_ubudiyah_created",
    targetType: "MasterMateriUbudiyah", targetId: hasil?.id, ip: req.ip, sesudah: { jenis, nama },
  });
  res.status(201).json(hasil);
}));

router.delete("/materi-ubudiyah/:id", requireLPTQ, asyncHandler(async (req, res) => {
  const hasil = await hapusMateriUbudiyah(req.params.id, req.query.jenis);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "lptq.materi_ubudiyah_deleted",
    targetType: "MasterMateriUbudiyah", targetId: req.params.id, ip: req.ip,
  });
  res.json(hasil);
}));

// ==================== HAFALAN TAHFIDZ & MENGAJI ====================
router.get("/hafalan", requireAnyStaff, asyncHandler(async (req, res) => {
  res.json(await semuaHafalan(req.query.santriId));
}));

router.post("/hafalan", requireLPTQ, validateBody({
  santriId: { required: true, type: "string", label: "santriId" },
}), asyncHandler(async (req, res) => {
  const { santriId, juz, surah, ayat, predikat, nilaiTajwid, nilaiFashahah } = req.body || {};
  const hasil = await catatHafalan({
    santriId, juz, surah, ayat, predikat, nilaiTajwid, nilaiFashahah, dicatatOleh: req.user.nama,
  });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "lptq.hafalan_recorded",
    targetType: "Santri", targetId: santriId, ip: req.ip, sesudah: { juz, surah, ayat, predikat, nilaiTajwid, nilaiFashahah },
  });
  res.status(201).json(hasil);
}));

router.put("/hafalan/:id", requireLPTQ, asyncHandler(async (req, res) => {
  const { juz, surah, ayat, predikat, nilaiTajwid, nilaiFashahah } = req.body || {};
  const hasil = await ubahHafalan(req.params.id, { juz, surah, ayat, predikat, nilaiTajwid, nilaiFashahah });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "lptq.hafalan_updated",
    targetType: "Hafalan", targetId: req.params.id, ip: req.ip, sesudah: { juz, surah, ayat, predikat, nilaiTajwid, nilaiFashahah },
  });
  res.json(hasil);
}));

router.delete("/hafalan/:id", requireLPTQ, asyncHandler(async (req, res) => {
  const hasil = await hapusHafalan(req.params.id, req.user.id);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "lptq.hafalan_deleted",
    targetType: "Hafalan", targetId: req.params.id, ip: req.ip,
  });
  res.json(hasil);
}));

// ==================== EVALUASI UBUDIYAH & DOA ====================
router.get("/ubudiyah", requireAnyStaff, asyncHandler(async (req, res) => {
  res.json(await semuaUbudiyah());
}));

router.post("/ubudiyah", requireLPTQ, validateBody({
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

router.put("/ubudiyah/:id", requireLPTQ, asyncHandler(async (req, res) => {
  const { jenis, materi, predikat, catatan } = req.body || {};
  const hasil = await ubahUbudiyah(req.params.id, { jenis, materi, predikat, catatan });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "lptq.ubudiyah_updated",
    targetType: "PenilaianUbudiyah", targetId: req.params.id, ip: req.ip, sesudah: { jenis, materi, predikat },
  });
  res.json(hasil);
}));

router.delete("/ubudiyah/:id", requireLPTQ, asyncHandler(async (req, res) => {
  const hasil = await hapusUbudiyah(req.params.id, req.user.id);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "lptq.ubudiyah_deleted",
    targetType: "Ubudiyah", targetId: req.params.id, ip: req.ip,
  });
  res.json(hasil);
}));

// ==================== RAPOR TAHFIDZ ====================
router.get("/raport", requireAnyStaff, asyncHandler(async (req, res) => {
  res.json(await semuaRaportTahfidz(req.query));
}));

router.post("/raport", requireLPTQ, validateBody({
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

router.delete("/raport/:id", requireLPTQ, asyncHandler(async (req, res) => {
  const hasil = await hapusRaportTahfidz(req.params.id);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "lptq.raport_deleted",
    targetType: "RaportTahfidz", targetId: req.params.id, ip: req.ip,
  });
  res.json(hasil);
}));

module.exports = router;
