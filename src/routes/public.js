const express = require("express");
const { ambilTampilan } = require("../adminService");
const { buatTemplateImporCSV } = require("../imporService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();

// Tampilan aplikasi (logo, nama, warna, font) — dibutuhkan layar Login sebelum ada sesi sama
// sekali, jadi sengaja tanpa requireAuth. Isinya tidak sensitif (sama seperti kop/branding yang
// memang ditampilkan ke publik di layar login).
router.get("/tampilan", asyncHandler(async (req, res) => res.json(await ambilTampilan())));

// Template berkas impor Excel/CSV untuk diunduh oleh Sekretariat / Operator
router.get("/template-impor", asyncHandler(async (req, res) => {
  const csvContent = buatTemplateImporCSV();
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", 'attachment; filename="Template_Impor_Santri_MMA.csv"');
  res.send(csvContent);
}));

module.exports = router;
