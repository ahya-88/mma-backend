require("dotenv").config({ quiet: true });
const path = require("path");
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { isProduction } = require("./environment");
const { query, initializeDatabase } = require("./db");
const asyncHandler = require("./asyncHandler");

const authRoutes = require("./routes/auth");
const santriRoutes = require("./routes/santri");
const transaksiRoutes = require("./routes/transaksi");
const permintaanRoutes = require("./routes/permintaan");
const pengasuhanRoutes = require("./routes/pengasuhan");
const pengajaranRoutes = require("./routes/pengajaran");
const lptqRoutes = require("./routes/lptq");
const keuanganRoutes = require("./routes/keuangan");
const adminRoutes = require("./routes/admin");
const publicRoutes = require("./routes/public");
const produkRoutes = require("./routes/produk");
const wajahRoutes = require("./routes/wajah");
const kartuRoutes = require("./routes/kartu");
const { CashlessError } = require("./cashlessService");

const app = express();
if (process.env.DEMO_MODE === "true" && (isProduction() || !["development", "test"].includes(process.env.NODE_ENV))) {
  throw new Error("DEMO_MODE hanya boleh aktif dengan NODE_ENV=development atau test.");
}
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) {
  throw new Error("TRUST_PROXY_HOPS harus berupa bilangan bulat antara 0 dan 5.");
}
app.set("trust proxy", trustProxyHops);
const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
}));
app.use(compression());
app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak permintaan. Silakan coba lagi nanti." },
}));
// Keep the existing larger limit for other modules; Top Up only needs enough room for a
// 1.5 MB image encoded as base64 plus its JSON envelope.
const standardJsonParser = express.json({ limit: "8mb" });
const topUpJsonParser = express.json({ limit: "2.1mb" });
app.use((req, res, next) => (
  req.path.startsWith("/api/permintaan") ? topUpJsonParser : standardJsonParser
)(req, res, next));

app.get("/api/health", asyncHandler(async (req, res) => {
  try {
    await query("SELECT 1");
    res.json({ ok: true, waktu: new Date().toISOString() });
  } catch (_) {
    res.status(503).json({ ok: false, waktu: new Date().toISOString() });
  }
}));

app.get("/api/readiness", asyncHandler(async (req, res) => {
  try {
    const start = Date.now();
    await query("SELECT 1");
    const dbLatencyMs = Date.now() - start;
    const memory = process.memoryUsage();
    res.json({
      status: "ready",
      database: "connected",
      dbLatencyMs,
      environment: process.env.NODE_ENV || "development",
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMB: {
        rss: Math.round(memory.rss / (1024 * 1024)),
        heapUsed: Math.round(memory.heapUsed / (1024 * 1024)),
      },
      waktu: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "not_ready",
      database: "disconnected",
      error: error.message,
      waktu: new Date().toISOString(),
    });
  }
}));

app.use("/api/auth", authRoutes);
app.use("/api/santri", santriRoutes);
app.use("/api/transaksi", transaksiRoutes);
app.use("/api/permintaan", permintaanRoutes);
app.use("/api/pengasuhan", pengasuhanRoutes);
app.use("/api/pengajaran", pengajaranRoutes);
app.use("/api/lptq", lptqRoutes);
app.use("/api/keuangan", keuanganRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/produk", produkRoutes);
app.use("/api/wajah", wajahRoutes);
app.use("/api/kartu", kartuRoutes);

// Sajikan aplikasi frontend (pesantren-app.html, disalin sebagai public/index.html) dari service
// backend yang sama — satu URL untuk API dan aplikasi web, tidak perlu hosting frontend terpisah.
// Aplikasi tambahan (kasir, kiosk, dst.) nanti bisa ditambah sebagai service Railway lain dalam
// project yang sama, atau folder statis lain di sini.
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));
app.get("/admin", (req, res) => res.sendFile(path.join(publicDir, "superadmin.html")));
app.get("/superadmin", (req, res) => res.sendFile(path.join(publicDir, "superadmin.html")));
app.get("/bmt/qr", (req, res) => res.sendFile(path.join(publicDir, "bmt-qr.html")));
// Fallback: request GET selain /api/* (mis. refresh di path lain) tetap kembalikan index.html,
// supaya aplikasi single-page ini tidak pernah menampilkan 404 dari sisi server.
app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(publicDir, "index.html")));

// Error handler terpusat — CashlessError membawa status HTTP yang sesuai (400/403/404/409),
// error lain dianggap kesalahan server.
app.use((err, req, res, next) => {
  if (err instanceof CashlessError) return res.status(err.status).json({ error: err.message, ...err.details });
  if (req.path.startsWith("/api/permintaan") && err.type === "entity.too.large") {
    return res.status(400).json({ error: "Ukuran bukti transfer maksimal 1,5 MB setelah decode." });
  }
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
  initializeDatabase().then(() => {
    app.listen(PORT, "0.0.0.0", () => console.log(`Cashless backend jalan di port ${PORT} (menerima koneksi publik, bukan cuma localhost)`));
  }).catch((error) => {
    console.error("Gagal menginisialisasi PostgreSQL:", error);
    process.exitCode = 1;
  });
}

module.exports = app;
