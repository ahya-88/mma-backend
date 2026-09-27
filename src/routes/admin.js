const express = require("express");
const { requireAuth, requireAdmin } = require("../auth");
const admin = require("../adminService");

const router = express.Router();

// ---- Akun Guru/Staf — hanya Admin ----
router.get("/guru", requireAuth, requireAdmin, (req, res) => res.json(admin.semuaGuru()));
router.post("/guru", requireAuth, requireAdmin, (req, res, next) => {
  try { res.status(201).json(admin.buatGuru(req.body || {})); } catch (e) { next(e); }
});
router.put("/guru/:id", requireAuth, requireAdmin, (req, res, next) => {
  try { res.json(admin.editGuru({ id: req.params.id, ...(req.body || {}) })); } catch (e) { next(e); }
});
router.put("/guru/:id/password", requireAuth, requireAdmin, (req, res, next) => {
  try { res.json(admin.editPasswordGuru({ id: req.params.id, password: (req.body || {}).password })); } catch (e) { next(e); }
});
router.delete("/guru/:id", requireAuth, requireAdmin, (req, res, next) => {
  try { res.json(admin.hapusGuru({ id: req.params.id, actingUserId: req.user.id })); } catch (e) { next(e); }
});

// ---- Unit Usaha — dibaca oleh siapa pun yang sudah login (dipakai lintas modul: form akun staf,
// pilihan unit di Unit Usaha, dst.); diubah hanya oleh Admin.
router.get("/unit-usaha", requireAuth, (req, res) => res.json(admin.semuaUnitUsaha()));
router.post("/unit-usaha", requireAuth, requireAdmin, (req, res, next) => {
  try { res.status(201).json(admin.tambahUnitUsaha((req.body || {}).nama)); } catch (e) { next(e); }
});
router.delete("/unit-usaha/:id", requireAuth, requireAdmin, (req, res, next) => {
  try { res.json(admin.hapusUnitUsaha(req.params.id)); } catch (e) { next(e); }
});

// ---- Tahun Ajaran — dibaca oleh siapa pun yang sudah login (guru maupun wali, dipakai luas untuk
// pengelompokan rapor/tagihan per tahun ajaran); diubah hanya oleh Admin.
router.get("/tahun-ajaran", requireAuth, (req, res) => res.json(admin.semuaTahunAjaran()));
router.post("/tahun-ajaran", requireAuth, requireAdmin, (req, res, next) => {
  try { res.status(201).json(admin.tambahTahunAjaran((req.body || {}).tahunMulai)); } catch (e) { next(e); }
});
router.post("/tahun-ajaran/:id/aktifkan", requireAuth, requireAdmin, (req, res, next) => {
  try { res.json(admin.aktifkanTahunAjaran(req.params.id)); } catch (e) { next(e); }
});
router.delete("/tahun-ajaran/:id", requireAuth, requireAdmin, (req, res, next) => {
  try { res.json(admin.hapusTahunAjaran(req.params.id)); } catch (e) { next(e); }
});

// ---- Tampilan Aplikasi — pembacaan publik (dipakai layar login sebelum ada sesi) ada di
// routes/public.js; di sini hanya untuk mengambil ulang di panel Admin sendiri, dan menyimpan.
router.get("/tampilan", requireAuth, requireAdmin, (req, res) => res.json(admin.ambilTampilan()));
router.put("/tampilan", requireAuth, requireAdmin, (req, res, next) => {
  try { res.json(admin.simpanTampilan(req.body || {})); } catch (e) { next(e); }
});

module.exports = router;
