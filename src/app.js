require("dotenv").config({ quiet: true });
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const santriRoutes = require("./routes/santri");
const transaksiRoutes = require("./routes/transaksi");
const permintaanRoutes = require("./routes/permintaan");
const pengasuhanRoutes = require("./routes/pengasuhan");
const pengajaranRoutes = require("./routes/pengajaran");
const lptqRoutes = require("./routes/lptq");
const keuanganRoutes = require("./routes/keuangan");
const { CashlessError } = require("./cashlessService");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true, waktu: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/santri", santriRoutes);
app.use("/api/transaksi", transaksiRoutes);
app.use("/api/permintaan", permintaanRoutes);
app.use("/api/pengasuhan", pengasuhanRoutes);
app.use("/api/pengajaran", pengajaranRoutes);
app.use("/api/lptq", lptqRoutes);
app.use("/api/keuangan", keuanganRoutes);

// Error handler terpusat — CashlessError membawa status HTTP yang sesuai (400/403/404/409),
// error lain dianggap kesalahan server.
app.use((err, req, res, next) => {
  if (err instanceof CashlessError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Terjadi kesalahan pada server." });
});

const PORT = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Cashless backend jalan di http://localhost:${PORT}`));
}

module.exports = app;
