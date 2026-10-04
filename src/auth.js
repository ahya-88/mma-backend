const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { query, queryOne, withTransaction } = require("./db");
const { CashlessError } = require("./cashlessService");
const { isProduction } = require("./environment");

const JWT_SECRET = process.env.JWT_SECRET || (isProduction() ? "" : crypto.randomBytes(48).toString("hex"));
const JWT_EXPIRES_IN = "2h";
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const { PASSWORD_MIN_LENGTH } = require("./passwordPolicy");
const LEGACY_DEMO_CREDENTIALS = new Map([
  ["fahmi", "guru123"], ["nadia", "guru123"], ["hilmi.lptq", "guru123"],
  ["hilmi.data", "guru123"], ["admin", "admin123"], ["admin.operasional", "admin123"],
  ["hendra", "uang123"], ["slamet.kantin", "guru123"], ["fatimah.bmt", "guru123"],
  ["ahmad.ridwan", "wali123"], ["siti.aminah", "wali123"], ["yusuf.hakim", "wali123"],
]);
const utcNowSql = "to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')";

if (isProduction() && (JWT_SECRET.length < 32 || JWT_SECRET === "dev-secret-jangan-dipakai-di-produksi")) {
  throw new Error("JWT_SECRET produksi wajib diisi dengan minimal 32 karakter acak.");
}

// Peran Admin sudah dilebur ke Superadmin (keputusan 4 Okt 2026): hanya ada dua jenis akun,
// "staf" dan "superadmin". Nilai lama jenisAkun = "admin" diperlakukan sebagai Superadmin
// (schema.pg.sql juga memigrasikannya) agar akun lama tidak kehilangan akses.
function jenisAkunEfektif(guru) {
  if (guru?.jenisAkun === "admin") return "superadmin";
  return guru?.jenisAkun || (guru?.departemen === "admin" ? "superadmin" : "staf");
}

function isSuperAdmin(user) {
  return user?.role === "guru" && jenisAkunEfektif(user) === "superadmin";
}

function requireDashboardAdmin(req, res, next) {
  if (isSuperAdmin(req.user)) return next();
  res.status(403).json({ error: "Hanya akun Superadmin yang berwenang mengakses dashboard." });
}

async function recordLoginAudit({ actorId, actorRole, action, reason }) {
  await query(`INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
    VALUES ($1, $2, $3, $4, 'Auth', $2, $5::jsonb)`,
  [crypto.randomUUID(), actorId || null, actorRole, action, JSON.stringify({ reason })]);
}

async function login(username, password) {
  if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password) {
    throw new CashlessError(400, "Username dan password wajib diisi.");
  }
  username = username.trim();
  const guru = await queryOne('SELECT * FROM "Guru" WHERE "username" = $1', [username]);
  const wali = guru ? null : await queryOne('SELECT * FROM "Wali" WHERE "username" = $1', [username]);
  const account = guru || wali;
  const table = guru ? "Guru" : "Wali";
  const role = guru ? "guru" : "wali";
  if (!account) {
    await recordLoginAudit({ actorRole: "anonymous", action: "auth.login_failed", reason: "invalid_credentials" });
    return null;
  }

  if (account.loginLockedUntil && Date.parse(account.loginLockedUntil) > Date.now()) {
    await recordLoginAudit({ actorId: account.id, actorRole: role, action: "auth.login_locked", reason: "account_locked" });
    throw new CashlessError(423, "Akun terkunci sementara. Silakan coba lagi setelah 15 menit.");
  }

  const knownDemoCredential = isProduction() && LEGACY_DEMO_CREDENTIALS.get(username) === password;
  if (knownDemoCredential || !await bcrypt.compare(password, account.password)) {
    const updated = await queryOne(`UPDATE "${table}" SET
      "loginFailedAttempts" = CASE WHEN "loginLockedUntil" IS NOT NULL AND "loginLockedUntil" <= ${utcNowSql} THEN 1 ELSE "loginFailedAttempts" + 1 END,
      "loginLockedUntil" = CASE
        WHEN (CASE WHEN "loginLockedUntil" IS NOT NULL AND "loginLockedUntil" <= ${utcNowSql} THEN 1 ELSE "loginFailedAttempts" + 1 END) >= $1
        THEN to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '15 minutes', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ELSE NULL END
      WHERE "id" = $2 RETURNING "loginFailedAttempts", "loginLockedUntil"`, [LOGIN_FAILURE_LIMIT, account.id]);
    if (!updated) return null;
    await recordLoginAudit({ actorId: account.id, actorRole: role, action: "auth.login_failed", reason: "invalid_credentials" });
    if (updated.loginLockedUntil) throw new CashlessError(423, "Terlalu banyak percobaan. Akun terkunci selama 15 menit.");
    return null;
  }

  await query(`UPDATE "${table}" SET "loginFailedAttempts" = 0, "loginLockedUntil" = NULL WHERE "id" = $1`, [account.id]);
  const payload = guru
    ? { role, id: guru.id, nama: guru.nama, departemen: guru.departemen, unit: guru.unit, jenisAkun: jenisAkunEfektif(guru), sv: Number(guru.sessionVersion || 0) }
    : { role, id: wali.id, nama: wali.nama, sv: Number(wali.sessionVersion || 0) };
  const mustChangePassword = !!account.mustChangePassword;
  const token = jwt.sign(
    mustChangePassword ? { ...payload, purpose: "password-change" } : payload,
    JWT_SECRET,
    { expiresIn: mustChangePassword ? "10m" : JWT_EXPIRES_IN },
  );
  if (!mustChangePassword) {
    await recordLoginAudit({ actorId: account.id, actorRole: role, action: "auth.login_succeeded", reason: "password_current" });
  }
  return { token, user: { ...payload, mustChangePassword } };
}

async function changePassword({ user, currentPassword, newPassword }) {
  if (typeof newPassword !== "string" || newPassword.length < PASSWORD_MIN_LENGTH) {
    throw new CashlessError(400, `Kata sandi baru minimal ${PASSWORD_MIN_LENGTH} karakter.`);
  }
  const table = user.role === "guru" ? "Guru" : "Wali";
  const hashed = await bcrypt.hash(newPassword, 12);
  await withTransaction(async () => {
    const account = await queryOne(`SELECT "password", "mustChangePassword", "sessionVersion" FROM "${table}" WHERE "id" = $1 FOR UPDATE`, [user.id]);
    if (!account) throw new CashlessError(404, "Akun tidak ditemukan.");
    if (Number(account.sessionVersion || 0) !== Number(user.sv || 0)
      || (user.purpose === "password-change" && !account.mustChangePassword)) {
      throw new CashlessError(401, "Sesi ganti kata sandi sudah tidak berlaku. Silakan login ulang.");
    }
    if (user.purpose !== "password-change" && (typeof currentPassword !== "string" || !await bcrypt.compare(currentPassword, account.password))) {
      throw new CashlessError(400, "Kata sandi saat ini tidak sesuai.");
    }
    if (await bcrypt.compare(newPassword, account.password)) {
      throw new CashlessError(400, "Kata sandi baru harus berbeda dari kata sandi saat ini.");
    }
    await query(`UPDATE "${table}" SET "password" = $1, "mustChangePassword" = FALSE,
      "passwordChangedAt" = ${utcNowSql}, "sessionVersion" = "sessionVersion" + 1,
      "loginFailedAttempts" = 0, "loginLockedUntil" = NULL WHERE "id" = $2`, [hashed, user.id]);
    await recordLoginAudit({ actorId: user.id, actorRole: user.role, action: "auth.password_changed", reason: "self_service" });
  });
  const { purpose, iat, exp, nbf, ...userPayload } = user;
  const payload = { ...userPayload, sv: Number(user.sv || 0) + 1 };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return { token, user: { ...payload, mustChangePassword: false } };
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Token tidak ditemukan. Silakan login." });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Token tidak valid atau kedaluwarsa. Silakan login ulang." });
  }
  if (payload.purpose === "password-change") {
    if (`${req.baseUrl}${req.path}` !== "/api/auth/change-password") return res.status(403).json({ error: "Ganti kata sandi sebelum menggunakan sistem.", kode: "PASSWORD_CHANGE_REQUIRED" });
    const changeTable = payload.role === "guru" ? "Guru" : payload.role === "wali" ? "Wali" : null;
    if (!changeTable) return res.status(401).json({ error: "Token perubahan kata sandi tidak valid." });
    try {
      const account = await queryOne(`SELECT "mustChangePassword", "loginLockedUntil", "sessionVersion" FROM "${changeTable}" WHERE "id" = $1`, [payload.id]);
      if (!account || !account.mustChangePassword) return res.status(401).json({ error: "Sesi ganti kata sandi sudah tidak berlaku. Silakan login ulang." });
      if (!Number.isSafeInteger(payload.sv) || Number(account.sessionVersion || 0) !== payload.sv) {
        return res.status(401).json({ error: "Token perubahan kata sandi sudah tidak berlaku. Silakan login ulang." });
      }
      if (account.loginLockedUntil && Date.parse(account.loginLockedUntil) > Date.now()) {
        return res.status(423).json({ error: "Akun terkunci sementara. Silakan coba lagi setelah 15 menit." });
      }
      req.user = payload;
      return next();
    } catch (error) {
      return next(error);
    }
  }
  const table = payload.role === "guru" ? "Guru" : payload.role === "wali" ? "Wali" : null;
  if (!table) return res.status(401).json({ error: "Token tidak valid. Silakan login ulang." });
  try {
    const account = await queryOne(`SELECT "id", "nama", "mustChangePassword", "loginLockedUntil", "sessionVersion"${table === "Guru" ? ', "departemen", "unit", "jenisAkun"' : ""}
      FROM "${table}" WHERE "id" = $1`, [payload.id]);
    if (!account) return res.status(401).json({ error: "Akun tidak lagi tersedia. Silakan login ulang." });
    if (!Number.isSafeInteger(payload.sv) || Number(account.sessionVersion || 0) !== payload.sv) {
      return res.status(401).json({ error: "Sesi sudah tidak berlaku. Silakan login ulang." });
    }
    if (account.loginLockedUntil && Date.parse(account.loginLockedUntil) > Date.now()) {
      return res.status(423).json({ error: "Akun terkunci sementara. Silakan coba lagi setelah 15 menit." });
    }
    if (account.mustChangePassword) return res.status(403).json({ error: "Ganti kata sandi sebelum menggunakan sistem.", kode: "PASSWORD_CHANGE_REQUIRED" });
    req.user = table === "Guru"
      ? { role: "guru", id: account.id, nama: account.nama, departemen: account.departemen, unit: account.unit, jenisAkun: jenisAkunEfektif(account) }
      : { role: "wali", id: account.id, nama: account.nama };
    return next();
  } catch (error) {
    return next(error);
  }
}

// Hanya staf BMT (Guru dengan departemen "unitusaha" dan unit "BMT") yang boleh lewat.
function requireBMT(req, res, next) {
  if (isSuperAdmin(req.user) || (req.user?.role === "guru" && req.user.departemen === "unitusaha" && req.user.unit === "BMT")) return next();
  res.status(403).json({ error: "Hanya staf BMT yang berwenang mengakses endpoint ini." });
}

// Admin Unit Usaha: Staf Keuangan/Administrasi, Staf BMT, atau Superadmin.
function requireAdminUnitUsaha(req, res, next) {
  if (isSuperAdmin(req.user)) return next();
  if (req.user?.role === "guru") {
    if (req.user.departemen === "administrasi") return next();
    if (req.user.departemen === "unitusaha" && req.user.unit === "BMT") return next();
  }
  res.status(403).json({ error: "Hanya staf Keuangan/Administrasi, staf BMT, atau Superadmin yang berwenang mengelola transaksi unit usaha." });
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

function requirePasswordResetAuthority(req, res, next) {
  if (isSuperAdmin(req.user)
    || (req.user?.role === "guru" && req.user.departemen === "sekretariat")) return next();
  res.status(403).json({ error: "Hanya Superadmin atau staf Sekretariat yang dapat mereset kata sandi." });
}

// Staf Admin (untuk akun guru/staf, unit usaha, tahun ajaran, dan tampilan aplikasi).
function requireAdmin(req, res, next) {
  if (isSuperAdmin(req.user)) return next();
  res.status(403).json({ error: "Hanya Superadmin yang berwenang mengakses pengelolaan ini." });
}

module.exports = { login, changePassword, requireAuth, requireBMT, requireAdminUnitUsaha, requireUnitUsaha, requireWali, requirePengasuhan, requirePengajaran, requireLPTQ, requireAdministrasi, requireSekretariat, requirePasswordResetAuthority, requireAdmin, requireAnyStaff, isSuperAdmin, jenisAkunEfektif, requireDashboardAdmin, JWT_SECRET };
