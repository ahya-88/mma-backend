const express = require("express");
const { requireAuth, requireUnitUsaha } = require("../auth");
const { catatTransaksi } = require("../cashlessService");

const router = express.Router();

router.post("/", requireAuth, requireUnitUsaha, (req, res, next) => {
  try {
    const { santriId, jenis, kategori, subKategori, jumlah, keterangan, bulan } = req.body || {};
    if (!santriId || !jenis || !jumlah) return res.status(400).json({ error: "santriId, jenis, dan jumlah wajib diisi." });
    // Petugas hanya boleh mencatat transaksi untuk unitnya sendiri.
    const unit = req.user.unit;
    const hasil = catatTransaksi({ santriId, unit, jenis, kategori, subKategori, jumlah, keterangan, bulan });
    res.status(201).json(hasil);
  } catch (e) { next(e); }
});

module.exports = router;
