const express = require("express");
const { ambilTampilan } = require("../adminService");

const router = express.Router();

// Tampilan aplikasi (logo, nama, warna, font) — dibutuhkan layar Login sebelum ada sesi sama
// sekali, jadi sengaja tanpa requireAuth. Isinya tidak sensitif (sama seperti kop/branding yang
// memang ditampilkan ke publik di layar login).
router.get("/tampilan", (req, res, next) => {
  try { res.json(ambilTampilan()); } catch (e) { next(e); }
});

module.exports = router;
