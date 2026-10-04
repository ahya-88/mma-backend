const express = require("express");
const { requireAuth, requirePengajaran } = require("../auth");
const { catatNilai, semuaNilai, hapusNilai, catatPrestasi, semuaPrestasi, hapusPrestasi } = require("../akademikService");

const router = express.Router();
const asyncHandler = require("../asyncHandler");
router.use(requireAuth, requirePengajaran);

router.get("/nilai", asyncHandler(async (req, res) => res.json(await semuaNilai())));
router.post("/nilai", asyncHandler(async (req, res) => {
    const { santriId, mapel, nilai } = req.body || {};
    if (!santriId) return res.status(400).json({ error: "santriId wajib diisi." });
    res.status(201).json(await catatNilai({ santriId, mapel, nilai, dicatatOleh: req.user.nama }));
}));
router.delete("/nilai/:id", asyncHandler(async (req, res) => res.json(await hapusNilai(req.params.id, req.user.id))));

router.get("/prestasi", asyncHandler(async (req, res) => res.json(await semuaPrestasi())));
router.post("/prestasi", asyncHandler(async (req, res) => {
    const { santriId, judul, tingkat } = req.body || {};
    if (!santriId) return res.status(400).json({ error: "santriId wajib diisi." });
    res.status(201).json(await catatPrestasi({ santriId, judul, tingkat, dicatatOleh: req.user.nama }));
}));
router.delete("/prestasi/:id", asyncHandler(async (req, res) => res.json(await hapusPrestasi(req.params.id, req.user.id))));

module.exports = router;
