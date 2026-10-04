const express = require("express");
const { requireAuth, requireAdministrasi } = require("../auth");
const {
  buatTagihan, semuaTagihan, hapusTagihan, editTagihanNominal, catatPembayaran,
  catatCashflow, semuaCashflow, hapusCashflow,
  ajukanAnggaran, semuaPengajuan, hapusPengajuan, setujuiAnggaran, tolakAnggaran, realisasikanAnggaran,
} = require("../keuanganService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();
router.use(requireAuth, requireAdministrasi);

router.get("/tagihan", asyncHandler(async (req, res) => res.json(await semuaTagihan())));
router.post("/tagihan", asyncHandler(async (req, res) => {
  const { santriIds, jenis, jumlah, bulan } = req.body || {};
  res.status(201).json(await buatTagihan({ santriIds, jenis, jumlah, bulan, dicatatOleh: req.user.nama, aktorId: req.user.id }));
}));
router.put("/tagihan/:id", asyncHandler(async (req, res) => {
  const { jumlah, jumlahDibayar } = req.body || {};
  res.json(await editTagihanNominal({ id: req.params.id, jumlah, jumlahDibayar, aktorId: req.user.id }));
}));
router.delete("/tagihan/:id", asyncHandler(async (req, res) => res.json(await hapusTagihan(req.params.id, req.user.id))));
router.post("/tagihan/:id/bayar", asyncHandler(async (req, res) => {
  const { jumlahBayar } = req.body || {};
  res.status(201).json(await catatPembayaran({ tagihanId: req.params.id, jumlahBayar, dicatatOleh: req.user.nama, aktorId: req.user.id }));
}));

router.get("/cashflow", asyncHandler(async (req, res) => res.json(await semuaCashflow())));
router.post("/cashflow", asyncHandler(async (req, res) => {
  const { bulan, jenis, kategori, jumlah, keterangan } = req.body || {};
  res.status(201).json(await catatCashflow({ bulan, jenis, kategori, jumlah, keterangan, dicatatOleh: req.user.nama, aktorId: req.user.id }));
}));
router.delete("/cashflow/:id", asyncHandler(async (req, res) => res.json(await hapusCashflow(req.params.id, req.user.id))));

router.get("/anggaran", asyncHandler(async (req, res) => res.json(await semuaPengajuan())));
router.post("/anggaran", asyncHandler(async (req, res) => {
  const { namaKegiatan, unitPengaju, ketuaBagianNama, kategori, bulanRencana, catatan, rincian } = req.body || {};
  res.status(201).json(await ajukanAnggaran({ namaKegiatan, unitPengaju, ketuaBagianNama, kategori, bulanRencana, catatan, rincian, diajukanOleh: req.user.nama }));
}));
router.delete("/anggaran/:id", asyncHandler(async (req, res) => res.json(await hapusPengajuan(req.params.id, req.user.id))));
router.post("/anggaran/:id/setujui", asyncHandler(async (req, res) => {
  const { pimpinanId } = req.body || {};
  res.json(await setujuiAnggaran({ id: req.params.id, pimpinanId, disetujuiOleh: req.user.nama }));
}));
router.post("/anggaran/:id/tolak", asyncHandler(async (req, res) => res.json(await tolakAnggaran({ id: req.params.id, disetujuiOleh: req.user.nama }))));
router.post("/anggaran/:id/realisasi", asyncHandler(async (req, res) => {
  const { jumlahRealisasi } = req.body || {};
  res.status(201).json(await realisasikanAnggaran({ id: req.params.id, jumlahRealisasi, dicatatOleh: req.user.nama }));
}));

module.exports = router;