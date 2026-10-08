const express = require("express");
const { ambilTampilan } = require("../adminService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();

router.get("/tampilan", asyncHandler(async (req, res) => {
  res.json(await ambilTampilan());
}));

router.get("/template-impor", (req, res) => {
  const csvTemplate = `nama,nis,nisn,kelas,jenisKelamin,namaWali,hpWali,tempatLahir,tanggalLahir
Ahmad Fauzi,1001,00812345,7A,L,Budi Santoso,08123456789,Jakarta,2010-05-15
Siti Aminah,1002,00812346,7A,P,Rudi Hermawan,08123456780,Bandung,2010-08-20
`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="Template_Impor_Santri_MMA.csv"');
  res.send(csvTemplate);
});

router.get("/status", (req, res) => {
  res.json({ status: "online", system: "MMA Cashless Backend", time: new Date().toISOString() });
});

module.exports = router;
