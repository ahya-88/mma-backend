const express = require("express");
const { login } = require("../auth");
const asyncHandler = require("../asyncHandler");

const router = express.Router();

router.post("/login", asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username dan password wajib diisi." });
  const result = await login(username, password);
  if (!result) return res.status(401).json({ error: "Username atau password salah." });
  res.json(result);
}));

module.exports = router;
