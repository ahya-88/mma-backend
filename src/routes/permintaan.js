const express = require("express");
const { requireAuth, requireBMT, requireWali, isSuperAdmin } = require("../auth");
const {
  ajukanPermintaan, prosesPermintaan, daftarPermintaan, daftarPermintaanWali,
  ambilBuktiTransfer, getPengaturanTopUp, simpanPengaturanTopUp, daftarAudit, laporanTopUpHarian,
  CashlessError,
} = require("../cashlessService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();

function tanggalISOValid(tanggal) {
  if (typeof tanggal !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return false;
  const date = new Date(`${tanggal}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === tanggal;
}

function requireBMTorAdmin(req, res, next) {
  if (isSuperAdmin(req.user) || (req.user?.role === "guru" && req.user.departemen === "unitusaha" && req.user.unit === "BMT")) return next();
  res.status(403).json({ error: "Hanya staf BMT atau Admin yang berwenang mengakses endpoint ini." });
}

// BMT: lihat daftar permintaan (opsional filter ?status=Menunggu|Disetujui|Ditolak)
router.get("/", requireAuth, requireBMT, asyncHandler(async (req, res) => res.json(await daftarPermintaan(req.query.status))));

// Wali: lihat riwayat permintaan yang pernah diajukan sendiri (opsional filter ?santriId=)
router.get("/mine", requireAuth, requireWali, asyncHandler(async (req, res) => {
  res.json(await daftarPermintaanWali(req.user.id, req.query.santriId));
}));

// Wali: ajukan permintaan untuk anaknya sendiri
router.post("/", requireAuth, requireWali, asyncHandler(async (req, res) => {
  const { santriId, jenis, nilaiDiminta, alasan, buktiTransfer } = req.body || {};
  const permintaan = await ajukanPermintaan({ santriId, waliId: req.user.id, jenis, nilaiDiminta, alasan, buktiTransfer });
  res.status(201).json(permintaan);
}));

router.get("/:id/bukti", requireAuth, requireBMTorAdmin, asyncHandler(async (req, res) => {
  const bukti = await ambilBuktiTransfer(req.params.id);
  res.set("Content-Type", bukti.mime);
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Disposition", `inline; filename="bukti-transfer.${bukti.extension}"`);
  res.set("Cache-Control", "private, no-store");
  res.send(bukti.bytes);
}));

router.get("/pengaturan", requireAuth, requireBMTorAdmin, asyncHandler(async (req, res) => {
  res.json(await getPengaturanTopUp());
}));

router.put("/pengaturan", requireAuth, requireBMTorAdmin, asyncHandler(async (req, res) => {
  const role = req.user.departemen === "admin" ? "Admin" : "BMT";
  res.json(await simpanPengaturanTopUp(req.body || {}, { id: req.user.id, role }));
}));

router.get("/audit", requireAuth, requireBMTorAdmin, asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 50);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new CashlessError(400, "page harus minimal 1 dan limit harus antara 1 sampai 100.");
  }
  if ((req.query.dari !== undefined && !tanggalISOValid(req.query.dari))
    || (req.query.sampai !== undefined && !tanggalISOValid(req.query.sampai))) {
    throw new CashlessError(400, "Filter tanggal audit harus berformat YYYY-MM-DD.");
  }
  res.json(await daftarAudit({
    aksi: req.query.aksi, dari: req.query.dari, sampai: req.query.sampai, page, limit,
  }));
}));

router.get("/laporan/topup-harian", requireAuth, requireBMTorAdmin, asyncHandler(async (req, res) => {
  const tanggalISO = req.query.tanggalISO;
  if (!tanggalISOValid(tanggalISO)) {
    throw new CashlessError(400, "tanggalISO wajib berformat YYYY-MM-DD.");
  }
  res.json(await laporanTopUpHarian(tanggalISO));
}));

// BMT: setujui/tolak permintaan
router.post("/:id/proses", requireAuth, requireBMTorAdmin, asyncHandler(async (req, res) => {
  const { disetujui, catatan, nominalDisetujui, referensiMutasi } = req.body || {};
  const hasil = await prosesPermintaan({
    id: req.params.id, disetujui: !!disetujui, diprosesOleh: req.user.nama,
    diprosesOlehId: req.user.id, aktorRole: req.user.departemen === "admin" ? "Admin" : "BMT",
    catatan, nominalDisetujui, referensiMutasi,
  });
  res.json(hasil);
}));

module.exports = router;
