const express = require("express");
const { requireAuth, requirePengasuhan, recordSensitiveAudit } = require("../auth");
const { validateBody } = require("../validator");
const {
  catatAbsensi, riwayatAbsensi, absensiPadaTanggal,
  ajukanPerizinan, prosesPerizinan, daftarPerizinan,
  catatPelanggaran, riwayatPelanggaran, semuaPelanggaran, hapusPelanggaran,
  profilPengasuhan,
} = require("../pengasuhanService");

const router = express.Router();
const asyncHandler = require("../asyncHandler");
router.use(requireAuth, requirePengasuhan);

router.get("/santri/:id", asyncHandler(async (req, res) => res.json(await profilPengasuhan(req.params.id))));

// Absensi
router.post("/absensi", validateBody({
  santriId: { required: true, type: "string", label: "santriId" },
  status: { required: true, type: "string", label: "status" },
}), asyncHandler(async (req, res) => {
  const { santriId, tanggalISO, status, keterangan } = req.body || {};
  const hasil = await catatAbsensi({ santriId, tanggalISO, status, keterangan, dicatatOleh: req.user.nama });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengasuhan.absensi_recorded",
    targetType: "Santri", targetId: santriId, ip: req.ip, sesudah: { tanggalISO, status, keterangan },
  });
  res.status(201).json(hasil);
}));

router.get("/absensi", asyncHandler(async (req, res) => res.json(await absensiPadaTanggal(req.query.tanggalISO))));
router.get("/absensi/:santriId", asyncHandler(async (req, res) => res.json(await riwayatAbsensi(req.params.santriId))));

// Perizinan
router.post("/perizinan", validateBody({
  santriId: { required: true, type: "string", label: "santriId" },
  jenis: { required: true, type: "string", label: "jenis" },
  alasan: { required: true, type: "string", label: "alasan" },
}), asyncHandler(async (req, res) => {
  const { santriId, jenis, tanggalKeluar, tanggalKembali, alasan } = req.body || {};
  const hasil = await ajukanPerizinan({ santriId, jenis, tanggalKeluar, tanggalKembali, alasan, diajukanOleh: req.user.nama });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengasuhan.perizinan_submitted",
    targetType: "Santri", targetId: santriId, ip: req.ip, sesudah: { jenis, tanggalKeluar, tanggalKembali, alasan },
  });
  res.status(201).json(hasil);
}));

router.get("/perizinan", asyncHandler(async (req, res) => res.json(await daftarPerizinan({ santriId: req.query.santriId, status: req.query.status }))));
router.post("/perizinan/:id/proses", validateBody({
  status: { required: true, type: "string", label: "status" },
}), asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  const hasil = await prosesPerizinan({ id: req.params.id, statusBaru: status, disetujuiOleh: req.user.nama });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengasuhan.perizinan_processed",
    targetType: "Perizinan", targetId: req.params.id, ip: req.ip, sesudah: { status },
  });
  res.json(hasil);
}));

// Pelanggaran
router.post("/pelanggaran", validateBody({
  santriId: { required: true, type: "string", label: "santriId" },
  jenis: { required: true, type: "string", label: "jenis" },
}), asyncHandler(async (req, res) => {
  const { santriId, jenis, poin, tanggalISO, keterangan } = req.body || {};
  const hasil = await catatPelanggaran({ santriId, jenis, poin, tanggalISO, keterangan, dicatatOleh: req.user.nama });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengasuhan.pelanggaran_recorded",
    targetType: "Santri", targetId: santriId, ip: req.ip, sesudah: { jenis, poin, keterangan },
  });
  res.status(201).json(hasil);
}));

router.get("/pelanggaran/:santriId", asyncHandler(async (req, res) => res.json(await riwayatPelanggaran(req.params.santriId))));
router.get("/pelanggaran", asyncHandler(async (req, res) => res.json(await semuaPelanggaran())));
router.delete("/pelanggaran/:id", asyncHandler(async (req, res) => {
  const hasil = await hapusPelanggaran(req.params.id, req.user.id);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengasuhan.pelanggaran_deleted",
    targetType: "Pelanggaran", targetId: req.params.id, ip: req.ip,
  });
  res.json(hasil);
}));

module.exports = router;
