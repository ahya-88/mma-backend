const express = require("express");
const db = require("../db");
const { requireAuth, requireBMT, requireWali } = require("../auth");
const { ajukanPermintaan, prosesPermintaan, daftarPermintaan } = require("../cashlessService");

const router = express.Router();

// BMT: lihat daftar permintaan (opsional filter ?status=Menunggu|Disetujui|Ditolak)
router.get("/", requireAuth, requireBMT, (req, res) => {
  res.json(daftarPermintaan(req.query.status));
});

// Wali: lihat riwayat permintaan yang pernah diajukan sendiri (opsional filter ?santriId=)
router.get("/mine", requireAuth, requireWali, (req, res) => {
  const rows = req.query.santriId
    ? db.prepare("SELECT * FROM PermintaanBMT WHERE waliId = ? AND santriId = ? ORDER BY createdAt DESC").all(req.user.id, req.query.santriId)
    : db.prepare("SELECT * FROM PermintaanBMT WHERE waliId = ? ORDER BY createdAt DESC").all(req.user.id);
  res.json(rows);
});

// Wali: ajukan permintaan untuk anaknya sendiri
router.post("/", requireAuth, requireWali, (req, res, next) => {
  try {
    const { santriId, jenis, nilaiDiminta, alasan, buktiTransfer } = req.body || {};
    const permintaan = ajukanPermintaan({ santriId, waliId: req.user.id, jenis, nilaiDiminta, alasan, buktiTransfer });
    res.status(201).json(permintaan);
  } catch (e) { next(e); }
});

// BMT: setujui/tolak permintaan
router.post("/:id/proses", requireAuth, requireBMT, (req, res, next) => {
  try {
    const { disetujui, catatan } = req.body || {};
    const hasil = prosesPermintaan({ id: req.params.id, disetujui: !!disetujui, diprosesOleh: req.user.nama, catatan });
    res.json(hasil);
  } catch (e) { next(e); }
});

module.exports = router;
