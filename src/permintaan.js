const express = require("express");
const { queryAll } = require("./db");
const { requireAuth, requireBMT, requireWali } = require("../auth");
const { ajukanPermintaan, prosesPermintaan, daftarPermintaan } = require("../cashlessService");
const asyncHandler = require("./asyncHandler");

const router = express.Router();

// BMT: lihat daftar permintaan (opsional filter ?status=Menunggu|Disetujui|Ditolak)
router.get("/", requireAuth, requireBMT, asyncHandler(async (req, res) => res.json(await daftarPermintaan(req.query.status))));

// Wali: lihat riwayat permintaan yang pernah diajukan sendiri (opsional filter ?santriId=)
router.get("/mine", requireAuth, requireWali, asyncHandler(async (req, res) => {
  const rows = req.query.santriId
    ? await queryAll('SELECT * FROM "PermintaanBMT" WHERE "waliId" = $1 AND "santriId" = $2 ORDER BY "createdAt" DESC', [req.user.id, req.query.santriId])
    : await queryAll('SELECT * FROM "PermintaanBMT" WHERE "waliId" = $1 ORDER BY "createdAt" DESC', [req.user.id]);
  res.json(rows);
}));

// Wali: ajukan permintaan untuk anaknya sendiri
router.post("/", requireAuth, requireWali, asyncHandler(async (req, res) => {
    const { santriId, jenis, nilaiDiminta, alasan, buktiTransfer } = req.body || {};
    const permintaan = await ajukanPermintaan({ santriId, waliId: req.user.id, jenis, nilaiDiminta, alasan, buktiTransfer });
    res.status(201).json(permintaan);
}));

// BMT: setujui/tolak permintaan
router.post("/:id/proses", requireAuth, requireBMT, asyncHandler(async (req, res) => {
    const { disetujui, catatan } = req.body || {};
    const hasil = await prosesPermintaan({ id: req.params.id, disetujui: !!disetujui, diprosesOleh: req.user.nama, catatan });
    res.json(hasil);
}));

module.exports = router;
