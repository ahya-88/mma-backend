const express = require("express");
const { requireAuth, requireAdministrasi } = require("../auth");
const {
  buatTagihan, semuaTagihan, hapusTagihan, editTagihanNominal, catatPembayaran,
  catatCashflow, semuaCashflow, hapusCashflow,
  ajukanAnggaran, semuaPengajuan, hapusPengajuan, setujuiAnggaran, tolakAnggaran, realisasikanAnggaran,
} = require("../keuanganService");

const router = express.Router();
router.use(requireAuth, requireAdministrasi);

// Tagihan
router.get("/tagihan", (req, res, next) => { try { res.json(semuaTagihan()); } catch (e) { next(e); } });
router.post("/tagihan", (req, res, next) => {
  try {
    const { santriIds, jenis, jumlah, bulan } = req.body || {};
    res.status(201).json(buatTagihan({ santriIds, jenis, jumlah, bulan, dicatatOleh: req.user.nama }));
  } catch (e) { next(e); }
});
router.put("/tagihan/:id", (req, res, next) => {
  try {
    const { jumlah, jumlahDibayar } = req.body || {};
    res.json(editTagihanNominal({ id: req.params.id, jumlah, jumlahDibayar }));
  } catch (e) { next(e); }
});
router.delete("/tagihan/:id", (req, res, next) => { try { res.json(hapusTagihan(req.params.id)); } catch (e) { next(e); } });
router.post("/tagihan/:id/bayar", (req, res, next) => {
  try {
    const { jumlahBayar } = req.body || {};
    res.status(201).json(catatPembayaran({ tagihanId: req.params.id, jumlahBayar, dicatatOleh: req.user.nama }));
  } catch (e) { next(e); }
});

// Cashflow (juga dipakai untuk mencatat Infaq — kategori "Infaq/Donasi")
router.get("/cashflow", (req, res, next) => { try { res.json(semuaCashflow()); } catch (e) { next(e); } });
router.post("/cashflow", (req, res, next) => {
  try {
    const { bulan, jenis, kategori, jumlah, keterangan } = req.body || {};
    res.status(201).json(catatCashflow({ bulan, jenis, kategori, jumlah, keterangan, dicatatOleh: req.user.nama }));
  } catch (e) { next(e); }
});
router.delete("/cashflow/:id", (req, res, next) => { try { res.json(hapusCashflow(req.params.id)); } catch (e) { next(e); } });

// Pengajuan Anggaran
router.get("/anggaran", (req, res, next) => { try { res.json(semuaPengajuan()); } catch (e) { next(e); } });
router.post("/anggaran", (req, res, next) => {
  try {
    const { namaKegiatan, unitPengaju, ketuaBagianNama, kategori, bulanRencana, catatan, rincian } = req.body || {};
    res.status(201).json(ajukanAnggaran({ namaKegiatan, unitPengaju, ketuaBagianNama, kategori, bulanRencana, catatan, rincian, diajukanOleh: req.user.nama }));
  } catch (e) { next(e); }
});
router.delete("/anggaran/:id", (req, res, next) => { try { res.json(hapusPengajuan(req.params.id)); } catch (e) { next(e); } });
router.post("/anggaran/:id/setujui", (req, res, next) => {
  try {
    const { pimpinanId } = req.body || {};
    res.json(setujuiAnggaran({ id: req.params.id, pimpinanId, disetujuiOleh: req.user.nama }));
  } catch (e) { next(e); }
});
router.post("/anggaran/:id/tolak", (req, res, next) => {
  try { res.json(tolakAnggaran({ id: req.params.id, disetujuiOleh: req.user.nama })); } catch (e) { next(e); }
});
router.post("/anggaran/:id/realisasi", (req, res, next) => {
  try {
    const { jumlahRealisasi } = req.body || {};
    res.status(201).json(realisasikanAnggaran({ id: req.params.id, jumlahRealisasi, dicatatOleh: req.user.nama }));
  } catch (e) { next(e); }
});

module.exports = router;
