const express = require("express");
const { requireAuth, requireLPTQ } = require("../auth");
const { catatHafalan, semuaHafalan, hapusHafalan, catatUbudiyah, semuaUbudiyah, hapusUbudiyah } = require("../akademikService");

const router = express.Router();
router.use(requireAuth, requireLPTQ);

router.get("/hafalan", (req, res, next) => { try { res.json(semuaHafalan()); } catch (e) { next(e); } });
router.post("/hafalan", (req, res, next) => {
  try {
    const { santriId, juz } = req.body || {};
    if (!santriId) return res.status(400).json({ error: "santriId wajib diisi." });
    res.status(201).json(catatHafalan({ santriId, juz, dicatatOleh: req.user.nama }));
  } catch (e) { next(e); }
});
router.delete("/hafalan/:id", (req, res, next) => { try { res.json(hapusHafalan(req.params.id)); } catch (e) { next(e); } });

router.get("/ubudiyah", (req, res, next) => { try { res.json(semuaUbudiyah()); } catch (e) { next(e); } });
router.post("/ubudiyah", (req, res, next) => {
  try {
    const { santriId, jenis, materi, predikat, catatan } = req.body || {};
    if (!santriId) return res.status(400).json({ error: "santriId wajib diisi." });
    res.status(201).json(catatUbudiyah({ santriId, jenis, materi, predikat, catatan, dicatatOleh: req.user.nama }));
  } catch (e) { next(e); }
});
router.delete("/ubudiyah/:id", (req, res, next) => { try { res.json(hapusUbudiyah(req.params.id)); } catch (e) { next(e); } });

module.exports = router;
