const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { queryOne } = require("./db");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-jangan-dipakai-di-produksi";
const JWT_EXPIRES_IN = "12h";

// Existing department-admin accounts are the system-wide superadmin identity.
function isSuperAdmin(user) {
  return user?.role === "guru" && user.departemen === "admin";
}

async function login(username, password) {
  const guru = await queryOne('SELECT * FROM "Guru" WHERE "username" = $1', [username]);
  if (guru && bcrypt.compareSync(password, guru.password)) {
    const payload = { role: "guru", id: guru.id, nama: guru.nama, departemen: guru.departemen, unit: guru.unit };
    return { token: jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }), user: payload };
  }
  const wali = await queryOne('SELECT * FROM "Wali" WHERE "username" = $1', [username]);
  if (wali && bcrypt.compareSync(password, wali.password)) {
    const payload = { role: "wali", id: wali.id, nama: wali.nama };
    return { token: jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }), user: payload };
  }
  return null;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Token tidak ditemukan. Silakan login." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token tidak valid atau kedaluwarsa. Silakan login ulang." });
  }
}

// Hanya staf BMT (Guru dengan departemen "unitusaha" dan unit "BMT") yang boleh lewat.
function requireBMT(req, res, next) {
  if (isSuperAdmin(req.user) || (req.user?.role === "guru" && req.user.departemen === "unitusaha" && req.user.unit === "BMT")) return next();
  res.status(403).json({ error: "Hanya staf BMT yang berwenang mengakses endpoint ini." });
}

// Staf unit usaha manapun (untuk mencatat transaksi di unitnya sendiri).
function requireUnitUsaha(req, res, next) {
  if (req.user?.role === "guru" && req.user.departemen === "unitusaha") return next();
  res.status(403).json({ error: "Hanya staf Unit Usaha yang berwenang mengakses endpoint ini." });
}

// Staf departemen apa pun (guru) — dipakai untuk endpoint yang aman diakses lintas departemen,
// mis. sinkronisasi identitas dasar santri yang dibutuhkan banyak modul (bukan cuma BMT).
function requireAnyStaff(req, res, next) {
  if (req.user?.role === "guru") return next();
  res.status(403).json({ error: "Hanya akun staf (guru) yang berwenang mengakses endpoint ini." });
}

function requireWali(req, res, next) {
  if (req.user?.role === "wali") return next();
  res.status(403).json({ error: "Hanya akun wali santri yang berwenang mengakses endpoint ini." });
}

// Staf Pengasuhan (untuk absensi, perizinan, pelanggaran).
function requirePengasuhan(req, res, next) {
  if (isSuperAdmin(req.user) || (req.user?.role === "guru" && req.user.departemen === "pengasuhan")) return next();
  res.status(403).json({ error: "Hanya staf Pengasuhan yang berwenang mengakses endpoint ini." });
}

// Staf Pengajaran (untuk nilai, prestasi).
function requirePengajaran(req, res, next) {
  if (isSuperAdmin(req.user) || (req.user?.role === "guru" && req.user.departemen === "pengajaran")) return next();
  res.status(403).json({ error: "Hanya staf Pengajaran yang berwenang mengakses endpoint ini." });
}

// Staf LPTQ (untuk hafalan, ubudiyah).
function requireLPTQ(req, res, next) {
  if (isSuperAdmin(req.user) || (req.user?.role === "guru" && req.user.departemen === "lptq")) return next();
  res.status(403).json({ error: "Hanya staf LPTQ yang berwenang mengakses endpoint ini." });
}

// Staf Administrasi/Keuangan (untuk tagihan, pembayaran, cashflow).
function requireAdministrasi(req, res, next) {
  if (isSuperAdmin(req.user) || (req.user?.role === "guru" && req.user.departemen === "administrasi")) return next();
  res.status(403).json({ error: "Hanya staf Administrasi/Keuangan yang berwenang mengakses endpoint ini." });
}

// Staf Sekretariat (untuk Master Data Santri, alumni, wali, surat-menyurat).
function requireSekretariat(req, res, next) {
  if (isSuperAdmin(req.user) || (req.user?.role === "guru" && req.user.departemen === "sekretariat")) return next();
  res.status(403).json({ error: "Hanya staf Sekretariat yang berwenang mengakses endpoint ini." });
}

// Staf Admin (untuk akun guru/staf, unit usaha, tahun ajaran, dan tampilan aplikasi).
function requireAdmin(req, res, next) {
  if (isSuperAdmin(req.user)) return next();
  res.status(403).json({ error: "Hanya staf Admin yang berwenang mengakses endpoint ini." });
}

module.exports = { login, requireAuth, requireBMT, requireUnitUsaha, requireWali, requirePengasuhan, requirePengajaran, requireLPTQ, requireAdministrasi, requireSekretariat, requireAdmin, requireAnyStaff, isSuperAdmin, JWT_SECRET };
