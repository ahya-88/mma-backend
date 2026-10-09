const express = require("express");
const rateLimit = require("express-rate-limit");
const { login, refreshTokens, logout, changePassword, setup2FA, verify2FA, requireAuth } = require("../auth");
const asyncHandler = require("../asyncHandler");

const router = express.Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20, // Perbaikan: Maksimal 20 login per 15 menit per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan login. Silakan coba lagi dalam 15 menit." },
});

router.post("/login", loginLimiter, asyncHandler(async (req, res) => {
  const { username, password, totpCode } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password) {
    return res.status(400).json({ error: "Username dan password wajib diisi." });
  }
  const result = await login(username, password, { totpCode, ip: req.ip });
  if (!result) return res.status(401).json({ error: "Nama pengguna atau kata sandi tidak valid." });
  res.json(result);
}));

router.post("/refresh", asyncHandler(async (req, res) => {
  const { refreshToken } = req.body || {};
  res.json(await refreshTokens({ refreshToken }));
}));

router.post("/logout", requireAuth, asyncHandler(async (req, res) => {
  res.json(await logout({ user: req.user, ip: req.ip }));
}));

router.post("/2fa/setup", requireAuth, asyncHandler(async (req, res) => {
  res.json(await setup2FA({ user: req.user }));
}));

router.post("/2fa/verify", requireAuth, asyncHandler(async (req, res) => {
  const { totpCode } = req.body || {};
  if (!totpCode) return res.status(400).json({ error: "Kode TOTP 2FA wajib diisi." });
  res.json(await verify2FA({ user: req.user, totpCode }));
}));

router.post("/change-password", requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (req.user.purpose !== "password-change" && typeof currentPassword !== "string") {
    return res.status(400).json({ error: "Kata sandi saat ini wajib diisi." });
  }
  res.json(await changePassword({ user: req.user, currentPassword, newPassword, ip: req.ip }));
}));

module.exports = router;
