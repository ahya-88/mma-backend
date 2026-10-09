require("dotenv").config({ quiet: true });
const path = require("path");
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { isProduction } = require("./environment");
const { query, initializeDatabase, getPoolStats } = require("./db");
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
const kasirRoutes = require("./routes/kasir");
const daftarUlangRoutes = require("./routes/daftarUlang");
const { CashlessError } = require("./cashlessService");

const { httpLoggerMiddleware } = require("./logger");
const { captureException } = require("./sentry");
const { record5xxError, sendHealthFailureAlert } = require("./alerting");
const { requireAuth, requireDashboardAdmin } = require("./auth");
const { auditSaldo } = require("./cashlessService");

const APP_VERSION = require("../package.json").version || "1.0.0";

const app = express();
app.use(httpLoggerMiddleware);

if (process.env.DEMO_MODE === "true" && (isProduction() || !["development", "test"].includes(process.env.NODE_ENV))) {
  throw new Error("DEMO_MODE hanya boleh aktif dengan NODE_ENV=development atau test.");
}
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) {
  throw new Error("TRUST_PROXY_HOPS harus berupa bilangan bulat antara 0 dan 5.");
}
app.set("trust proxy", trustProxyHops);
const defaultOrigins = [
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
  "ionic://localhost",
  "http://127.0.0.1",
  "https://mma.up.railway.app",
];
const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...defaultOrigins, ...corsOrigins])];

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin(origin, callback) {
    const customOrigins = (process.env.CORS_ORIGINS || "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    const allowed = customOrigins.length ? customOrigins : allowedOrigins;
    // Perbaikan: gunakan regex yang ketat untuk railway.app
    if (!origin || allowed.includes(origin) || (!customOrigins.length && /localhost|capacitor|ionic/i.test(origin)) || (!customOrigins.length && /^https:\/\/.*\.up\.railway\.app$/i.test(origin))) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Idempotency-Key", "X-Request-ID"],
}));
app.use(compression());
app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000, // Perbaikan: Batasi 1000 req/15 menit
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak permintaan. Silakan coba lagi nanti." },
}));

const standardJsonParser = express.json({ limit: "8mb" });
const topUpJsonParser = express.json({ limit: "2.1mb" });
app.use((req, res, next) => (
  req.path.startsWith("/api/permintaan") ? topUpJsonParser : standardJsonParser
)(req, res, next));

app.get("/api/health", asyncHandler(async (req, res) => {
  try {
    await query("SELECT 1");
    res.json({ ok: true, version: APP_VERSION, waktu: new Date().toISOString() });
  } catch (err) {
    sendHealthFailureAlert(err);
    res.status(503).json({ ok: false, version: APP_VERSION, error: "Database unreachable", waktu: new Date().toISOString() });
  }
}));

app.get("/api/health/deep", requireAuth, requireDashboardAdmin, asyncHandler(async (req, res) => {
  try {
    const start = Date.now();
    await query("SELECT 1");
    const dbLatencyMs = Date.now() - start;

    const audit = await auditSaldo();
    const ledgerConsistent = audit.jumlahTidakCocok === 0;

    const memory = process.memoryUsage();
    res.json({
      ok: ledgerConsistent,
      database: "connected",
      dbLatencyMs,
      ledgerConsistent,
      poolStats: getPoolStats(),
      auditResult: { jumlahSantri: audit.jumlahSantri, jumlahTidakCocok: audit.jumlahTidakCocok },
      version: APP_VERSION,
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
      ok: false,
      database: "disconnected",
      error: error.message,
      waktu: new Date().toISOString(),
    });
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
      version: APP_VERSION,
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

// Intentional Test Error Trigger for Staging/Test verification
if (process.env.NODE_ENV !== "production") {
  app.get("/api/public/test-error", (req, res, next) => {
    next(new Error("INTENTIONAL_STAGING_TEST_ERROR_500"));
  });
}

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
app.use("/api/kasir", kasirRoutes);
app.use("/api/daftar-ulang", daftarUlangRoutes);

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));
app.get(["/admin", "/superadmin"], (req, res) => res.redirect("/#admin"));
app.get("/bmt/qr", (req, res) => res.sendFile(path.join(publicDir, "bmt-qr.html")));
app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.use((err, req, res, next) => {
  if (err instanceof CashlessError) return res.status(err.status).json({ error: err.message, ...err.details });
  if (req.path.startsWith("/api/permintaan") && err.type === "entity.too.large") {
    return res.status(400).json({ error: "Ukuran bukti transfer maksimal 1,5 MB setelah decode." });
  }

  captureException(err, { requestId: req.id, path: req.path, method: req.method });
  record5xxError(req, err);

  res.status(500).json({ error: "Terjadi kesalahan pada server.", requestId: req.id });
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
