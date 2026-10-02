const express = require("express");
const { requireAuth, requireUnitUsaha } = require("../auth");
const { catatTransaksi } = require("../cashlessService");

const router = express.Router();

router.post("/", requireAuth, requireUnitUsaha, (req, res, next) => {
  try {
    const { santriId, jenis: jenisInput, kategori: kategoriInput, subKategori, jumlah, keterangan, bulan, pin, metode } = req.body || {};
    if (!santriId || !jumlah) return res.status(400).json({ error: "santriId dan jumlah wajib diisi." });
    const jenis = jenisInput || "Tarik Tunai";
    const kategori = kategoriInput || (jenis === "Tarik Tunai" ? "Jajan Harian" : undefined);
    // Petugas hanya boleh mencatat transaksi untuk unitnya sendiri.
    const unit = req.user.unit;
    const hasil = catatTransaksi({
      santriId, unit, jenis, kategori, subKategori, jumlah, keterangan, bulan,
      pin, validasiPin: jenis === "Tarik Tunai", petugasId: req.user.id,
      metode: ["qr", "wajah", "manual"].includes(metode) ? metode : null,
    });
    res.status(201).json(hasil);
  } catch (e) { next(e); }
});

module.exports = router;
