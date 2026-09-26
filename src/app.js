require("dotenv").config({ quiet: true });
const path = require("path");
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
const adminRoutes = require("./routes/admin");
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
app.use("/api/admin", adminRoutes);

// Sajikan aplikasi frontend (pesantren-app.html, disalin sebagai public/index.html) dari service
// backend yang sama — satu URL untuk API dan aplikasi web, tidak perlu hosting frontend terpisah.
// Aplikasi tambahan (kasir, kiosk, dst.) nanti bisa ditambah sebagai service Railway lain dalam
// project yang sama, atau folder statis lain di sini.
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));
// Fallback: request GET selain /api/* (mis. refresh di path lain) tetap kembalikan index.html,
// supaya aplikasi single-page ini tidak pernah menampilkan 404 dari sisi server.
app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(publicDir, "index.html")));

// Error handler terpusat — CashlessError membawa status HTTP yang sesuai (400/403/404/409),
// error lain dianggap kesalahan server.
app.use((err, req, res, next) => {
  if (err instanceof CashlessError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Terjadi kesalahan pada server." });
});

const PORT = process.env.PORT || 4000;
if (require.main === module) {
  // "0.0.0.0" eksplisit (bukan cuma default) — supaya jelas server ini memang harus menerima
  // koneksi dari luar container, bukan cuma dari dalam mesin sendiri (localhost/127.0.0.1).
  // Ini WAJIB di semua PaaS (Railway, Render, Fly.io, dst.): mereka mem-forward trafik publik
  // ke container lewat 0.0.0.0, jadi kalau server hanya listen di "localhost", trafik dari
  // luar tidak akan pernah sampai walau proses node-nya tetap terlihat "jalan" di log.
  app.listen(PORT, "0.0.0.0", () => console.log(`Cashless backend jalan di port ${PORT} (menerima koneksi publik, bukan cuma localhost)`));
}

module.exports = app;
