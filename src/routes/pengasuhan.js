const express = require("express");
const { requireAuth, requirePengasuhan } = require("../auth");
const {
  catatAbsensi, riwayatAbsensi, absensiPadaTanggal,
  ajukanPerizinan, prosesPerizinan, daftarPerizinan,
  catatPelanggaran, riwayatPelanggaran, semuaPelanggaran, hapusPelanggaran,
  profilPengasuhan,
} = require("../pengasuhanService");

const router = express.Router();
router.use(requireAuth, requirePengasuhan);

router.get("/santri/:id", (req, res, next) => {
  try { res.json(profilPengasuhan(req.params.id)); } catch (e) { next(e); }
});

// Absensi
router.post("/absensi", (req, res, next) => {
  try {
    const { santriId, tanggalISO, status, keterangan } = req.body || {};
    if (!santriId || !status) return res.status(400).json({ error: "santriId dan status wajib diisi." });
    res.status(201).json(catatAbsensi({ santriId, tanggalISO, status, keterangan, dicatatOleh: req.user.nama }));
  } catch (e) { next(e); }
});
// Snapshot absensi seluruh santri pada satu tanggal (default hari ini) — untuk UI ambil-absen harian.
router.get("/absensi", (req, res, next) => {
  try { res.json(absensiPadaTanggal(req.query.tanggalISO)); } catch (e) { next(e); }
});
router.get("/absensi/:santriId", (req, res, next) => {
  try { res.json(riwayatAbsensi(req.params.santriId)); } catch (e) { next(e); }
});

// Perizinan
router.post("/perizinan", (req, res, next) => {
  try {
    const { santriId, jenis, tanggalKeluar, tanggalKembali, alasan } = req.body || {};
    res.status(201).json(ajukanPerizinan({ santriId, jenis, tanggalKeluar, tanggalKembali, alasan, diajukanOleh: req.user.nama }));
  } catch (e) { next(e); }
});
router.get("/perizinan", (req, res, next) => {
  try { res.json(daftarPerizinan({ santriId: req.query.santriId, status: req.query.status })); } catch (e) { next(e); }
});
router.post("/perizinan/:id/proses", (req, res, next) => {
  try {
    const { status } = req.body || {};
    res.json(prosesPerizinan({ id: req.params.id, statusBaru: status, disetujuiOleh: req.user.nama }));
  } catch (e) { next(e); }
});

// Pelanggaran
router.post("/pelanggaran", (req, res, next) => {
  try {
    const { santriId, jenis, poin, tanggalISO, keterangan } = req.body || {};
    if (!santriId || !jenis) return res.status(400).json({ error: "santriId dan jenis pelanggaran wajib diisi." });
    res.status(201).json(catatPelanggaran({ santriId, jenis, poin, tanggalISO, keterangan, dicatatOleh: req.user.nama }));
  } catch (e) { next(e); }
});
router.get("/pelanggaran/:santriId", (req, res, next) => {
  try { res.json(riwayatPelanggaran(req.params.santriId)); } catch (e) { next(e); }
});
// Daftar semua pelanggaran lintas santri (untuk tampilan rekap satu departemen).
router.get("/pelanggaran", (req, res, next) => {
  try { res.json(semuaPelanggaran()); } catch (e) { next(e); }
});
router.delete("/pelanggaran/:id", (req, res, next) => {
  try { res.json(hapusPelanggaran(req.params.id)); } catch (e) { next(e); }
});

module.exports = router;
