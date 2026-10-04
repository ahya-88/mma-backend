const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.JWT_SECRET = "fase1-security-test-secret-32-characters-minimum-length";
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/mma_test";

const auth = require("../src/auth");
const { PASSWORD_MIN_LENGTH } = require("../src/passwordPolicy");

test("FASE 1: Policy Password Minimum Length", () => {
  assert.equal(PASSWORD_MIN_LENGTH, 6, "Kebijakan password wajib minimal 6 karakter.");
});

test("FASE 1: Verifikasi Struktur dan Keberadaan Dokumentasi Security Ops & Backup Script", () => {
  const docPath = path.join(__dirname, "..", "docs", "security-operations.md");
  const scriptPath = path.join(__dirname, "..", "scripts", "backup-postgres.ps1");

  assert.ok(fs.existsSync(docPath), "Dokumen security-operations.md wajib ada.");
  assert.ok(fs.existsSync(scriptPath), "Skrip backup-postgres.ps1 wajib ada.");

  const docContent = fs.readFileSync(docPath, "utf-8");
  assert.ok(docContent.includes("PostgreSQL backup and restore drill"), "Dokumen memuat instruksi backup & restore drill.");
  assert.ok(docContent.includes("Children's personal data (UU PDP)"), "Dokumen memuat instruksi perlindungan data pribadi anak (UU PDP).");
  assert.ok(docContent.includes("JWT_SECRET"), "Dokumen memuat panduan rahasia JWT.");
  assert.ok(docContent.includes("mustChangePassword"), "Dokumen memuat panduan ganti sandi login pertama.");
});

test("FASE 1: Verifikasi RBAC Middleware & Penolakan Akses Lintas Peran", () => {
  const waliUser = { role: "wali", id: "w1", nama: "Bpk Wali" };
  const guruPengasuhan = { role: "guru", departemen: "pengasuhan", id: "g1", nama: "Ustd Pengasuhan" };
  const guruLPTQ = { role: "guru", departemen: "lptq", id: "g2", nama: "Ustd LPTQ" };
  const superAdmin = { role: "guru", departemen: "admin", jenisAkun: "superadmin", id: "g0", nama: "Super Admin" };

  const mockRes = () => {
    const res = {};
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.body = data; return res; };
    return res;
  };

  // Uji Wali mencoba akses endpoint Pengasuhan
  let req = { user: waliUser };
  let res = mockRes();
  let nextCalled = false;
  auth.requirePengasuhan(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false, "Wali harus ditolak mengakses endpoint Pengasuhan.");
  assert.equal(res.statusCode, 403, "Response status harus 403 Forbidden.");

  // Uji Staf Pengasuhan mengakses endpoint Pengasuhan (Diizinkan)
  req = { user: guruPengasuhan };
  res = mockRes();
  nextCalled = false;
  auth.requirePengasuhan(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true, "Staf Pengasuhan diizinkan mengakses endpoint Pengasuhan.");

  // Uji Staf LPTQ mengakses Pengasuhan (Ditolak)
  req = { user: guruLPTQ };
  res = mockRes();
  nextCalled = false;
  auth.requirePengasuhan(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false, "Staf LPTQ harus ditolak mengakses endpoint Pengasuhan.");
  assert.equal(res.statusCode, 403);

  // Uji Superadmin mengakses Pengasuhan (Diizinkan)
  req = { user: superAdmin };
  res = mockRes();
  nextCalled = false;
  auth.requirePengasuhan(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true, "Superadmin diizinkan mengakses seluruh endpoint departemen.");
});
