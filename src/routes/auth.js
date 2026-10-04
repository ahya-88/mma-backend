const express = require("express");
const rateLimit = require("express-rate-limit");
const { login, changePassword, requireAuth } = require("../auth");
const asyncHandler = require("../asyncHandler");

const router = express.Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan login. Silakan coba lagi dalam 15 menit." },
});

router.post("/login", loginLimiter, asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password) {
    return res.status(400).json({ error: "Username dan password wajib diisi." });
  }
  const result = await login(username, password);
  if (!result) return res.status(401).json({ error: "Username atau password salah." });
  res.json(result);
}));

router.post("/change-password", requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (req.user.purpose !== "password-change" && typeof currentPassword !== "string") {
    return res.status(400).json({ error: "Kata sandi saat ini wajib diisi." });
  }
  res.json(await changePassword({ user: req.user, currentPassword, newPassword }));
}));

module.exports = router;
