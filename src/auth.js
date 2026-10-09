const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { query, queryOne, withTransaction } = require("./db");
const { CashlessError } = require("./cashlessService");
const { isProduction } = require("./environment");

const JWT_SECRET = (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 32)
  ? process.env.JWT_SECRET.trim()
  : "mma-cashless-secure-production-jwt-secret-96-bytes-fallback-key";
const JWT_EXPIRES_IN = "15m";
const JWT_REFRESH_EXPIRES_IN = "7d";
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const UNIFORM_LOGIN_ERROR = "Nama pengguna atau kata sandi tidak valid.";
const { PASSWORD_MIN_LENGTH } = require("./passwordPolicy");
const LEGACY_DEMO_CREDENTIALS = new Map([
  ["fahmi", "guru123"], ["nadia", "guru123"], ["hilmi.lptq", "guru123"],
  ["hilmi.data", "guru123"], ["admin", "admin123"], ["admin.operasional", "admin123"],
  ["hendra", "uang123"], ["slamet.kantin", "guru123"], ["fatimah.bmt", "guru123"],
  ["ahmad.ridwan", "wali123"], ["siti.aminah", "wali123"], ["yusuf.hakim", "wali123"],
]);
const utcNowSql = "to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')";

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

function sanitizeAuditDetail(detail = {}) {
  if (typeof detail !== "object" || detail === null) return detail;
  const clone = JSON.parse(JSON.stringify(detail));
  const sensitiveKeys = ["password", "pin", "token", "refreshToken", "totpSecret", "pinHash", "currentPassword", "newPassword"];
  function maskObj(obj) {
    if (!obj || typeof obj !== "object") return;
    for (const key of Object.keys(obj)) {
      if (sensitiveKeys.includes(key)) {
        obj[key] = "[REDACTED]";
      } else if (typeof obj[key] === "object") {
        maskObj(obj[key]);
      }
    }
  }
  maskObj(clone);
  return clone;
}

async function recordLoginAudit({ actorId, actorRole, action, reason, ip }) {
  await query(`INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "ip", "detail")
    VALUES ($1, $2, $3, $4, 'Auth', $2, $5, $6::jsonb)`,
  [crypto.randomUUID(), actorId || null, actorRole, action, ip || null, JSON.stringify({ reason })]);
}

async function recordSensitiveAudit({ actorId, actorRole, action, targetType, targetId, ip, sebelum, sesudah, metadata = {} }) {
  const detail = sanitizeAuditDetail({ sebelum, sesudah, ...metadata });
  await query(
    `INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "ip", "detail")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [crypto.randomUUID(), actorId || null, actorRole, action, targetType, targetId || null, ip || null, JSON.stringify(detail)]
  );
}

function generateTOTPSecret() {
  return crypto.randomBytes(20).toString("hex");
}

function verifyTOTPCode(secretHex, code, window = 1) {
  if (!secretHex || !code) return false;
  try {
    const key = Buffer.from(secretHex, "hex");
    const timeStep = 30;
    const now = Math.floor(Date.now() / 1000);

    for (let i = -window; i <= window; i++) {
      const counter = Math.floor((now + i * timeStep) / timeStep);
      const buf = Buffer.alloc(8);
      buf.writeBigInt64BE(BigInt(counter), 0);
      const hmac = crypto.createHmac("sha1", key).update(buf).digest();
      const offset = hmac[hmac.length - 1] & 0xf;
      const binary = ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);
      const generatedCode = String(binary % 1000000).padStart(6, "0");
      if (generatedCode === String(code).trim()) return true;
    }
  } catch (_) {}
  return false;
}

async function setup2FA({ user }) {
  if (user.role !== "guru") throw new CashlessError(400, "2FA hanya dapat diaktifkan untuk akun staf/admin.");
  const secretHex = generateTOTPSecret();
  await query('UPDATE "Guru" SET "totpSecret" = $1 WHERE "id" = $2', [secretHex, user.id]);
  const uri = `otpauth://totp/MMA:${encodeURIComponent(user.nama)}?secret=${secretHex}&issuer=MMA`;
  return { secretHex, uri };
}

async function verify2FA({ user, totpCode }) {
  const guru = await queryOne('SELECT "totpSecret" FROM "Guru" WHERE "id" = $1', [user.id]);
  if (!guru?.totpSecret) throw new CashlessError(400, "2FA belum diinisialisasi. Silakan lakukan setup terlebih dahulu.");
  const ok = verifyTOTPCode(guru.totpSecret, totpCode);
  if (!ok) throw new CashlessError(400, "Kode TOTP 2FA tidak valid.");
  await query('UPDATE "Guru" SET "totpEnabled" = TRUE WHERE "id" = $1', [user.id]);
  return { totpEnabled: true };
}

async function login(username, password, { totpCode, ip } = {}) {
  if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password) {
    throw new CashlessError(400, "Username dan password wajib diisi.");
  }
  username = username.trim();
  const guru = await queryOne('SELECT * FROM "Guru" WHERE "username" = $1 OR LOWER("username") = LOWER($1)', [username]);
  const wali = guru ? null : await queryOne('SELECT * FROM "Wali" WHERE "username" = $1 OR LOWER("username") = LOWER($1)', [username]);
  const account = guru || wali;
  const table = guru ? "Guru" : "Wali";
  const role = guru ? "guru" : "wali";

  if (!account) {
    await recordLoginAudit({ actorRole: "anonymous", action: "auth.login_failed", reason: "invalid_credentials", ip });
    return null;
  }

  if (account.loginLockedUntil && Date.parse(account.loginLockedUntil) > Date.now()) {
    await recordLoginAudit({ actorId: account.id, actorRole: role, action: "auth.login_locked", reason: "account_locked", ip });
    throw new CashlessError(423, "Akun terkunci sementara. Silakan coba lagi setelah 15 menit.");
  }

  const knownDemoCredential = isProduction() && account.mustChangePassword && LEGACY_DEMO_CREDENTIALS.get(username) === password;
  if (knownDemoCredential || !await bcrypt.compare(password, account.password)) {
    const updated = await queryOne(`UPDATE "${table}" SET
      "loginFailedAttempts" = CASE WHEN "loginLockedUntil" IS NOT NULL AND "loginLockedUntil" <= ${utcNowSql} THEN 1 ELSE "loginFailedAttempts" + 1 END,
      "loginLockedUntil" = CASE
        WHEN (CASE WHEN "loginLockedUntil" IS NOT NULL AND "loginLockedUntil" <= ${utcNowSql} THEN 1 ELSE "loginFailedAttempts" + 1 END) >= $1
        THEN to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '15 minutes', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ELSE NULL END
      WHERE "id" = $2 RETURNING "loginFailedAttempts", "loginLockedUntil"`, [LOGIN_FAILURE_LIMIT, account.id]);
    await recordLoginAudit({ actorId: account.id, actorRole: role, action: "auth.login_failed", reason: "invalid_credentials", ip });
    if (updated?.loginLockedUntil) throw new CashlessError(423, "Terlalu banyak percobaan. Akun terkunci selama 15 menit.");
    return null;
  }

  // 2FA TOTP Enforcement for enabled staff / admin
  if (guru && account.totpEnabled) {
    if (!totpCode) {
      return { requires2FA: true, userId: guru.id, message: "Masukkan 6-digit kode 2FA (TOTP) dari aplikasi pengautentikasi Anda." };
    }
    const totpValid = verifyTOTPCode(account.totpSecret, totpCode);
    if (!totpValid) {
      await recordLoginAudit({ actorId: account.id, actorRole: role, action: "auth.login_2fa_failed", reason: "invalid_totp", ip });
      throw new CashlessError(401, "Kode 2FA TOTP tidak valid.");
    }
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

  const refreshToken = jwt.sign(
    { ...payload, tokenType: "refresh" },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN }
  );

  if (!mustChangePassword) {
    await recordLoginAudit({ actorId: account.id, actorRole: role, action: "auth.login_succeeded", reason: "password_current", ip });
  }
  return { token, refreshToken, user: { ...payload, mustChangePassword } };
}

async function refreshTokens({ refreshToken }) {
  if (!refreshToken) throw new CashlessError(401, "Refresh token wajib diisi.");
  let payload;
  try {
    payload = jwt.verify(refreshToken, JWT_SECRET);
  } catch {
    throw new CashlessError(401, "Refresh token tidak valid atau kedaluwarsa. Silakan login ulang.");
  }
  if (payload.tokenType !== "refresh") throw new CashlessError(401, "Token yang diberikan bukan refresh token.");

  const table = payload.role === "guru" ? "Guru" : "Wali";
  const account = await queryOne(`SELECT "id", "sessionVersion", "mustChangePassword" FROM "${table}" WHERE "id" = $1`, [payload.id]);
  if (!account || Number(account.sessionVersion || 0) !== payload.sv) {
    throw new CashlessError(401, "Sesi refresh token sudah dibatalkan atau kedaluwarsa.");
  }

  const accessPayload = { ...payload };
  delete accessPayload.tokenType;
  delete accessPayload.exp;
  delete accessPayload.iat;

  const newAccessToken = jwt.sign(accessPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const newRefreshToken = jwt.sign({ ...accessPayload, tokenType: "refresh" }, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });

  return { token: newAccessToken, refreshToken: newRefreshToken };
}

async function logout({ user, ip }) {
  if (!user || !user.id) return { loggedOut: true };
  const table = user.role === "guru" ? "Guru" : "Wali";
  await query(`UPDATE "${table}" SET "sessionVersion" = "sessionVersion" + 1 WHERE "id" = $1`, [user.id]);
  await recordLoginAudit({ actorId: user.id, actorRole: user.role, action: "auth.logout", reason: "user_logout", ip });
  return { loggedOut: true };
}

async function changePassword({ user, currentPassword, newPassword, ip }) {
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
      "loginFailedAttempts" = 0, "loginLockedUntil" = NULL${table === "Wali" ? ', "statusAkun" = \'Aktif\'' : ""} WHERE "id" = $2`, [hashed, user.id]);
    await recordLoginAudit({ actorId: user.id, actorRole: user.role, action: "auth.password_changed", reason: "self_service", ip });
  });
  const { purpose, iat, exp, nbf, ...userPayload } = user;
  const payload = { ...userPayload, sv: Number(user.sv || 0) + 1 };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const refreshToken = jwt.sign({ ...payload, tokenType: "refresh" }, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
  return { token, refreshToken, user: { ...payload, mustChangePassword: false } };
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
      ? { role: "guru", id: account.id, nama: account.nama, departemen: account.departemen, unit: account.unit, jenisAkun: jenisAkunEfektif(account), sv: Number(account.sessionVersion || 0) }
      : { role: "wali", id: account.id, nama: account.nama, sv: Number(account.sessionVersion || 0) };
    return next();
  } catch (error) {
    return next(error);
  }
}

async function authorizeAccess(req, res, next, options = {}) {
  const { roles, departments, allowPublic, checkWaliOwnership = true } = options;
  if (allowPublic) return next();
  if (!req.user) return res.status(401).json({ error: "Token tidak ditemukan. Silakan login." });

  if (isSuperAdmin(req.user)) return next();

  if (roles && !roles.includes(req.user.role)) {
    return res.status(403).json({ error: "Akses ditolak. Peran Anda tidak memiliki izin untuk mengakses endpoint ini." });
  }

  if (departments && req.user.role === "guru" && !departments.includes(req.user.departemen)) {
    return res.status(403).json({ error: "Akses ditolak. Departemen Anda tidak memiliki izin untuk mengakses endpoint ini." });
  }

  if (req.user.role === "wali" && checkWaliOwnership) {
    const santriIdTarget = req.params.id || req.params.santriId || req.query.santriId || req.body?.santriId;
    if (santriIdTarget) {
      const santri = await queryOne('SELECT "waliId" FROM "Santri" WHERE "id" = $1', [santriIdTarget]);
      if (!santri || santri.waliId !== req.user.id) {
        return res.status(403).json({ error: "Akses ditolak. Anda hanya berwenang mengakses data anak Anda sendiri." });
      }
    }
  }

  next();
}

function requireBMT(req, res, next) {
  if (isSuperAdmin(req.user) || (req.user?.role === "guru" && req.user.departemen === "unitusaha" && req.user.unit === "BMT")) return next();
  res.status(403).json({ error: "Hanya staf BMT yang berwenang mengakses endpoint ini." });
}

function requireAdminUnitUsaha(req, res, next) {
  if (isSuperAdmin(req.user)) return next();
  if (req.user?.role === "guru") {
    if (req.user.departemen === "administrasi") return next();
    if (req.user.departemen === "unitusaha" && req.user.unit === "BMT") return next();
  }
  res.status(403).json({ error: "Hanya staf Keuangan/Administrasi, staf BMT, atau Superadmin yang berwenang mengelola transaksi unit usaha." });
}

function requireUnitUsaha(req, res, next) {
  if (isSuperAdmin(req.user) || (req.user?.role === "guru" && req.user.departemen === "unitusaha")) return next();
  res.status(403).json({ error: "Hanya staf Unit Usaha yang berwenang mengakses endpoint ini." });
}

function requireAnyStaff(req, res, next) {
  if (req.user?.role === "guru") return next();
  res.status(403).json({ error: "Hanya akun staf (guru) yang berwenang mengakses endpoint ini." });
}

function requireWali(req, res, next) {
  if (req.user?.role === "wali") return next();
  res.status(403).json({ error: "Hanya akun wali santri yang berwenang mengakses endpoint ini." });
}

function requirePengasuhan(req, res, next) {
  if (isSuperAdmin(req.user) || (req.user?.role === "guru" && req.user.departemen === "pengasuhan")) return next();
  res.status(403).json({ error: "Hanya staf Pengasuhan yang berwenang mengakses endpoint ini." });
}

function requirePengajaran(req, res, next) {
  if (isSuperAdmin(req.user) || (req.user?.role === "guru" && req.user.departemen === "pengajaran")) return next();
  res.status(403).json({ error: "Hanya staf Pengajaran yang berwenang mengakses endpoint ini." });
}

function requireLPTQ(req, res, next) {
  if (isSuperAdmin(req.user) || (req.user?.role === "guru" && req.user.departemen === "lptq")) return next();
  res.status(403).json({ error: "Hanya staf LPTQ yang berwenang mengakses endpoint ini." });
}

function requireAdministrasi(req, res, next) {
  if (isSuperAdmin(req.user) || (req.user?.role === "guru" && req.user.departemen === "administrasi")) return next();
  res.status(403).json({ error: "Hanya staf Administrasi/Keuangan yang berwenang mengakses endpoint ini." });
}

function requireSekretariat(req, res, next) {
  if (isSuperAdmin(req.user) || (req.user?.role === "guru" && req.user.departemen === "sekretariat")) return next();
  res.status(403).json({ error: "Hanya staf Sekretariat yang berwenang mengakses endpoint ini." });
}

function requirePasswordResetAuthority(req, res, next) {
  if (isSuperAdmin(req.user)
    || (req.user?.role === "guru" && req.user.departemen === "sekretariat")) return next();
  res.status(403).json({ error: "Hanya Superadmin atau staf Sekretariat yang dapat mereset kata sandi." });
}

function requireAdmin(req, res, next) {
  if (isSuperAdmin(req.user)) return next();
  res.status(403).json({ error: "Hanya Superadmin yang berwenang mengakses pengelolaan ini." });
}

module.exports = {
  login, refreshTokens, logout, changePassword, setup2FA, verify2FA,
  requireAuth, authorizeAccess, requireBMT, requireAdminUnitUsaha, requireUnitUsaha, requireWali,
  requirePengasuhan, requirePengajaran, requireLPTQ, requireAdministrasi, requireSekretariat,
  requirePasswordResetAuthority, requireAdmin, requireAnyStaff, isSuperAdmin, jenisAkunEfektif,
  requireDashboardAdmin, recordLoginAudit, recordSensitiveAudit, JWT_SECRET,
};
