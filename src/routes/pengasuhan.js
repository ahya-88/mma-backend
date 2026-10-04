const express = require("express");
const { requireAuth, requirePengasuhan } = require("../auth");
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
router.post("/absensi", asyncHandler(async (req, res) => {
  const { santriId, tanggalISO, status, keterangan } = req.body || {};
  if (!santriId || !status) return res.status(400).json({ error: "santriId dan status wajib diisi." });
  res.status(201).json(await catatAbsensi({ santriId, tanggalISO, status, keterangan, dicatatOleh: req.user.nama }));
}));
// Snapshot absensi seluruh santri pada satu tanggal (default hari ini) — untuk UI ambil-absen harian.
router.get("/absensi", asyncHandler(async (req, res) => res.json(await absensiPadaTanggal(req.query.tanggalISO))));
router.get("/absensi/:santriId", asyncHandler(async (req, res) => res.json(await riwayatAbsensi(req.params.santriId))));

// Perizinan
router.post("/perizinan", asyncHandler(async (req, res) => {
  const { santriId, jenis, tanggalKeluar, tanggalKembali, alasan } = req.body || {};
  res.status(201).json(await ajukanPerizinan({ santriId, jenis, tanggalKeluar, tanggalKembali, alasan, diajukanOleh: req.user.nama }));
}));
router.get("/perizinan", asyncHandler(async (req, res) => res.json(await daftarPerizinan({ santriId: req.query.santriId, status: req.query.status }))));
router.post("/perizinan/:id/proses", asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  res.json(await prosesPerizinan({ id: req.params.id, statusBaru: status, disetujuiOleh: req.user.nama }));
}));

// Pelanggaran
router.post("/pelanggaran", asyncHandler(async (req, res) => {
  const { santriId, jenis, poin, tanggalISO, keterangan } = req.body || {};
  if (!santriId || !jenis) return res.status(400).json({ error: "santriId dan jenis pelanggaran wajib diisi." });
  res.status(201).json(await catatPelanggaran({ santriId, jenis, poin, tanggalISO, keterangan, dicatatOleh: req.user.nama }));
}));
router.get("/pelanggaran/:santriId", asyncHandler(async (req, res) => res.json(await riwayatPelanggaran(req.params.santriId))));
// Daftar semua pelanggaran lintas santri (untuk tampilan rekap satu departemen).
router.get("/pelanggaran", asyncHandler(async (req, res) => res.json(await semuaPelanggaran())));
router.delete("/pelanggaran/:id", asyncHandler(async (req, res) => res.json(await hapusPelanggaran(req.params.id, req.user.id))));

module.exports = router;
