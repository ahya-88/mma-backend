const express = require("express");
const { requireAuth, requireLPTQ } = require("../auth");
const { catatHafalan, semuaHafalan, hapusHafalan, catatUbudiyah, semuaUbudiyah, hapusUbudiyah } = require("../akademikService");

const router = express.Router();
const asyncHandler = require("../asyncHandler");
router.use(requireAuth, requireLPTQ);

router.get("/hafalan", asyncHandler(async (req, res) => res.json(await semuaHafalan())));
router.post("/hafalan", asyncHandler(async (req, res) => {
    const { santriId, juz } = req.body || {};
    if (!santriId) return res.status(400).json({ error: "santriId wajib diisi." });
    res.status(201).json(await catatHafalan({ santriId, juz, dicatatOleh: req.user.nama }));
}));
router.delete("/hafalan/:id", asyncHandler(async (req, res) => res.json(await hapusHafalan(req.params.id, req.user.id))));

router.get("/ubudiyah", asyncHandler(async (req, res) => res.json(await semuaUbudiyah())));
router.post("/ubudiyah", asyncHandler(async (req, res) => {
    const { santriId, jenis, materi, predikat, catatan } = req.body || {};
    if (!santriId) return res.status(400).json({ error: "santriId wajib diisi." });
    res.status(201).json(await catatUbudiyah({ santriId, jenis, materi, predikat, catatan, dicatatOleh: req.user.nama }));
}));
router.delete("/ubudiyah/:id", asyncHandler(async (req, res) => res.json(await hapusUbudiyah(req.params.id, req.user.id))));

module.exports = router;
