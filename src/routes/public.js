const express = require("express");
const { ambilTampilan } = require("../adminService");
const { buatTemplateImporCSV } = require("../imporService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();

router.get("/tampilan", asyncHandler(async (req, res) => {
  res.json(await ambilTampilan());
}));

router.get("/template-impor", (req, res) => {
  const csvTemplate = buatTemplateImporCSV();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="Template_Impor_Santri_MMA.csv"');
  res.send(csvTemplate);
});

router.get("/status", (req, res) => {
  res.json({ status: "online", system: "MMA Cashless Backend", time: new Date().toISOString() });
});

module.exports = router;
