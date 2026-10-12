const express = require("express");
const { requireAuth, requirePengajaran, requireAnyStaff, recordSensitiveAudit } = require("../auth");
const { validateBody } = require("../validator");
const {
  semuaKelas, tambahKelas, ubahKelas, hapusKelas,
  catatNilai, ubahNilai, semuaNilai, hapusNilai,
  catatPrestasi, ubahPrestasi, semuaPrestasi, hapusPrestasi,
  simpanRaportAkademik, semuaRaportAkademik, hapusRaportAkademik, hitungRankingKelas,
} = require("../akademikService");
const {
  semuaMasterGuru, getMasterGuru, tambahMasterGuru, ubahMasterGuru, hapusMasterGuru,
  semuaMasterMapel, getMasterMapel, tambahMasterMapel, ubahMasterMapel, hapusMasterMapel,
  semuaPenugasanGuru, tambahPenugasanGuru, hapusPenugasanGuru,
  semuaJadwalPelajaran, tambahJadwalPelajaran, ubahJadwalPelajaran, hapusJadwalPelajaran,
} = require("../guruService");

const router = express.Router();
const asyncHandler = require("../asyncHandler");
router.use(requireAuth);

// ==================== MASTER KELAS / ROMBEL ====================
router.get("/kelas", requireAnyStaff, asyncHandler(async (req, res) => {
  res.json(await semuaKelas());
}));

router.post("/kelas", requirePengajaran, validateBody({
  nama: { required: true, type: "string", label: "nama" },
}), asyncHandler(async (req, res) => {
  const { nama, waliKelasId, tingkat } = req.body || {};
  const hasil = await tambahKelas({ nama, waliKelasId, tingkat });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.kelas_created",
    targetType: "MasterKelas", targetId: hasil.id, ip: req.ip, sesudah: { nama, waliKelasId, tingkat },
  });
  res.status(201).json(hasil);
}));

router.put("/kelas/:id", requirePengajaran, asyncHandler(async (req, res) => {
  const { nama, waliKelasId, tingkat } = req.body || {};
  const hasil = await ubahKelas(req.params.id, { nama, waliKelasId, tingkat });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.kelas_updated",
    targetType: "MasterKelas", targetId: req.params.id, ip: req.ip, sesudah: { nama, waliKelasId, tingkat },
  });
  res.json(hasil);
}));

router.put("/kelas/:id/wali", requirePengajaran, asyncHandler(async (req, res) => {
  const { waliKelasId } = req.body || {};
  const hasil = await ubahKelas(req.params.id, { waliKelasId });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.kelas_wali_assigned",
    targetType: "MasterKelas", targetId: req.params.id, ip: req.ip, sesudah: { waliKelasId },
  });
  res.json(hasil);
}));

router.delete("/kelas/:id", requirePengajaran, asyncHandler(async (req, res) => {
  const hasil = await hapusKelas(req.params.id);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.kelas_deleted",
    targetType: "MasterKelas", targetId: req.params.id, ip: req.ip,
  });
  res.json(hasil);
}));

// ==================== RIWAYAT AKADEMIK / NILAI ====================
router.get("/nilai", requireAnyStaff, asyncHandler(async (req, res) => {
  res.json(await semuaNilai(req.query));
}));

router.post("/nilai", requirePengajaran, validateBody({
  santriId: { required: true, type: "string", label: "santriId" },
  mapel: { required: true, type: "string", label: "mapel" },
}), asyncHandler(async (req, res) => {
  const { santriId, mapel, nilai, tahunAjaran, semester, jenisNilai } = req.body || {};
  const hasil = await catatNilai({
    santriId, mapel, nilai, tahunAjaran, semester, jenisNilai, dicatatOleh: req.user.nama,
  });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.nilai_recorded",
    targetType: "Santri", targetId: santriId, ip: req.ip, sesudah: { mapel, nilai, tahunAjaran, semester, jenisNilai },
  });
  res.status(201).json(hasil);
}));

router.put("/nilai/:id", requirePengajaran, asyncHandler(async (req, res) => {
  const { mapel, nilai, tahunAjaran, semester, jenisNilai } = req.body || {};
  const hasil = await ubahNilai(req.params.id, { mapel, nilai, tahunAjaran, semester, jenisNilai });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.nilai_updated",
    targetType: "Nilai", targetId: req.params.id, ip: req.ip, sesudah: { mapel, nilai, tahunAjaran, semester, jenisNilai },
  });
  res.json(hasil);
}));

router.delete("/nilai/:id", requirePengajaran, asyncHandler(async (req, res) => {
  const hasil = await hapusNilai(req.params.id);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.nilai_deleted",
    targetType: "Nilai", targetId: req.params.id, ip: req.ip,
  });
  res.json(hasil);
}));

// ==================== PRESTASI SANTRI ====================
router.get("/prestasi", requireAnyStaff, asyncHandler(async (req, res) => {
  res.json(await semuaPrestasi());
}));

router.post("/prestasi", requirePengajaran, validateBody({
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

router.put("/prestasi/:id", requirePengajaran, asyncHandler(async (req, res) => {
  const { judul, tingkat } = req.body || {};
  const hasil = await ubahPrestasi(req.params.id, { judul, tingkat });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.prestasi_updated",
    targetType: "Prestasi", targetId: req.params.id, ip: req.ip, sesudah: { judul, tingkat },
  });
  res.json(hasil);
}));

router.delete("/prestasi/:id", requirePengajaran, asyncHandler(async (req, res) => {
  const hasil = await hapusPrestasi(req.params.id);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.prestasi_deleted",
    targetType: "Prestasi", targetId: req.params.id, ip: req.ip,
  });
  res.json(hasil);
}));

// ==================== RAPOR AKADEMIK ====================
router.get("/raport", requireAnyStaff, asyncHandler(async (req, res) => {
  const hasil = await semuaRaportAkademik(req.query);
  res.json(hasil);
}));

router.post("/raport", requirePengajaran, validateBody({
  santriId: { required: true, type: "string", label: "santriId" },
  tahunAjaran: { required: true, type: "string", label: "tahunAjaran" },
  semester: { required: true, type: "string", label: "semester" },
}), asyncHandler(async (req, res) => {
  const hasil = await simpanRaportAkademik({
    ...req.body,
    dibuatOleh: req.user.nama,
  });
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.raport_saved",
    targetType: "Santri", targetId: req.body.santriId, ip: req.ip, sesudah: { tahunAjaran: req.body.tahunAjaran, semester: req.body.semester },
  });
  res.status(201).json(hasil);
}));

router.post("/raport/hitung-ranking", requirePengajaran, validateBody({
  kelas: { required: true, type: "string", label: "kelas" },
}), asyncHandler(async (req, res) => {
  const { kelas, tahunAjaran, semester } = req.body || {};
  const hasil = await hitungRankingKelas({ kelas, tahunAjaran, semester });
  res.json(hasil);
}));

router.delete("/raport/:id", requirePengajaran, asyncHandler(async (req, res) => {
  const hasil = await hapusRaportAkademik(req.params.id);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.raport_deleted",
    targetType: "RaportAkademik", targetId: req.params.id, ip: req.ip,
  });
  res.json(hasil);
}));

// ==================== MASTER GURU PENDIDIK (NON-STAF) ====================
router.get("/guru-pendidik", requireAnyStaff, asyncHandler(async (req, res) => {
  res.json(await semuaMasterGuru(req.query));
}));

router.get("/guru-pendidik/:id", requireAnyStaff, asyncHandler(async (req, res) => {
  res.json(await getMasterGuru(req.params.id));
}));

router.post("/guru-pendidik", requirePengajaran, validateBody({
  nama: { required: true, type: "string", label: "nama" },
}), asyncHandler(async (req, res) => {
  const hasil = await tambahMasterGuru(req.body);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.guru_pendidik_created",
    targetType: "MasterGuru", targetId: hasil.id, ip: req.ip, sesudah: { nama: hasil.nama, nip: hasil.nip },
  });
  res.status(201).json(hasil);
}));

router.put("/guru-pendidik/:id", requirePengajaran, asyncHandler(async (req, res) => {
  const hasil = await ubahMasterGuru(req.params.id, req.body);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.guru_pendidik_updated",
    targetType: "MasterGuru", targetId: req.params.id, ip: req.ip, sesudah: { nama: hasil.nama, nip: hasil.nip },
  });
  res.json(hasil);
}));

router.delete("/guru-pendidik/:id", requirePengajaran, asyncHandler(async (req, res) => {
  const hasil = await hapusMasterGuru(req.params.id);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.guru_pendidik_deleted",
    targetType: "MasterGuru", targetId: req.params.id, ip: req.ip,
  });
  res.json(hasil);
}));

// ==================== MASTER MATA PELAJARAN (MAPEL) ====================
router.get("/mapel", requireAnyStaff, asyncHandler(async (req, res) => {
  res.json(await semuaMasterMapel(req.query));
}));

router.get("/mapel/:id", requireAnyStaff, asyncHandler(async (req, res) => {
  res.json(await getMasterMapel(req.params.id));
}));

router.post("/mapel", requirePengajaran, validateBody({
  kodeMapel: { required: true, type: "string", label: "kodeMapel" },
  nama: { required: true, type: "string", label: "nama" },
}), asyncHandler(async (req, res) => {
  const hasil = await tambahMasterMapel(req.body);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.mapel_created",
    targetType: "MasterMapel", targetId: hasil.id, ip: req.ip, sesudah: { kodeMapel: hasil.kodeMapel, nama: hasil.nama },
  });
  res.status(201).json(hasil);
}));

router.put("/mapel/:id", requirePengajaran, asyncHandler(async (req, res) => {
  const hasil = await ubahMasterMapel(req.params.id, req.body);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.mapel_updated",
    targetType: "MasterMapel", targetId: req.params.id, ip: req.ip, sesudah: { kodeMapel: hasil.kodeMapel, nama: hasil.nama },
  });
  res.json(hasil);
}));

router.delete("/mapel/:id", requirePengajaran, asyncHandler(async (req, res) => {
  const hasil = await hapusMasterMapel(req.params.id);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.mapel_deleted",
    targetType: "MasterMapel", targetId: req.params.id, ip: req.ip,
  });
  res.json(hasil);
}));

// ==================== PENUGASAN GURU MAPEL ====================
router.get("/penugasan", requireAnyStaff, asyncHandler(async (req, res) => {
  res.json(await semuaPenugasanGuru(req.query));
}));

router.post("/penugasan", requirePengajaran, validateBody({
  guruId: { required: true, type: "string", label: "guruId" },
  mapelId: { required: true, type: "string", label: "mapelId" },
  kelas: { required: true, type: "string", label: "kelas" },
  tahunAjaran: { required: true, type: "string", label: "tahunAjaran" },
}), asyncHandler(async (req, res) => {
  const hasil = await tambahPenugasanGuru(req.body);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.penugasan_guru_created",
    targetType: "GuruMapel", targetId: hasil.id, ip: req.ip, sesudah: req.body,
  });
  res.status(201).json(hasil);
}));

router.delete("/penugasan/:id", requirePengajaran, asyncHandler(async (req, res) => {
  const hasil = await hapusPenugasanGuru(req.params.id);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.penugasan_guru_deleted",
    targetType: "GuruMapel", targetId: req.params.id, ip: req.ip,
  });
  res.json(hasil);
}));

// ==================== JADWAL PELAJARAN (KBM HARIAN) ====================
router.get("/jadwal", requireAnyStaff, asyncHandler(async (req, res) => {
  res.json(await semuaJadwalPelajaran(req.query));
}));

router.post("/jadwal", requirePengajaran, validateBody({
  penugasanId: { required: true, type: "string", label: "penugasanId" },
  hari: { required: true, type: "string", label: "hari" },
  jamMulai: { required: true, type: "string", label: "jamMulai" },
  jamSelesai: { required: true, type: "string", label: "jamSelesai" },
}), asyncHandler(async (req, res) => {
  const hasil = await tambahJadwalPelajaran(req.body);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.jadwal_created",
    targetType: "JadwalPelajaran", targetId: hasil.id, ip: req.ip, sesudah: req.body,
  });
  res.status(201).json(hasil);
}));

router.put("/jadwal/:id", requirePengajaran, asyncHandler(async (req, res) => {
  const hasil = await ubahJadwalPelajaran(req.params.id, req.body);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.jadwal_updated",
    targetType: "JadwalPelajaran", targetId: req.params.id, ip: req.ip, sesudah: req.body,
  });
  res.json(hasil);
}));

router.delete("/jadwal/:id", requirePengajaran, asyncHandler(async (req, res) => {
  const hasil = await hapusJadwalPelajaran(req.params.id);
  await recordSensitiveAudit({
    actorId: req.user.id, actorRole: req.user.role, action: "pengajaran.jadwal_deleted",
    targetType: "JadwalPelajaran", targetId: req.params.id, ip: req.ip,
  });
  res.json(hasil);
}));

module.exports = router;
