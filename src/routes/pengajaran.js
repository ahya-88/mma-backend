const express = require("express");
const { requireAuth, requirePengajaran } = require("../auth");
const { catatNilai, semuaNilai, hapusNilai, catatPrestasi, semuaPrestasi, hapusPrestasi } = require("../akademikService");

const router = express.Router();
router.use(requireAuth, requirePengajaran);

router.get("/nilai", (req, res, next) => { try { res.json(semuaNilai()); } catch (e) { next(e); } });
router.post("/nilai", (req, res, next) => {
  try {
    const { santriId, mapel, nilai } = req.body || {};
    if (!santriId) return res.status(400).json({ error: "santriId wajib diisi." });
    res.status(201).json(catatNilai({ santriId, mapel, nilai, dicatatOleh: req.user.nama }));
  } catch (e) { next(e); }
});
router.delete("/nilai/:id", (req, res, next) => { try { res.json(hapusNilai(req.params.id)); } catch (e) { next(e); } });

router.get("/prestasi", (req, res, next) => { try { res.json(semuaPrestasi()); } catch (e) { next(e); } });
router.post("/prestasi", (req, res, next) => {
  try {
    const { santriId, judul, tingkat } = req.body || {};
    if (!santriId) return res.status(400).json({ error: "santriId wajib diisi." });
    res.status(201).json(catatPrestasi({ santriId, judul, tingkat, dicatatOleh: req.user.nama }));
  } catch (e) { next(e); }
});
router.delete("/prestasi/:id", (req, res, next) => { try { res.json(hapusPrestasi(req.params.id)); } catch (e) { next(e); } });

module.exports = router;
