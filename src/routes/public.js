const express = require("express");
const { ambilTampilan } = require("../adminService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();

// Tampilan aplikasi (logo, nama, warna, font) — dibutuhkan layar Login sebelum ada sesi sama
// sekali, jadi sengaja tanpa requireAuth. Isinya tidak sensitif (sama seperti kop/branding yang
// memang ditampilkan ke publik di layar login).
router.get("/tampilan", asyncHandler(async (req, res) => res.json(await ambilTampilan())));

module.exports = router;
