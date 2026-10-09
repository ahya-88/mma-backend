require("dotenv").config({ quiet: true });
if (process.env.NEON_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.NEON_DATABASE_URL;
}

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const { pool, initializeDatabase } = require("../src/db");

const JWT_SECRET = (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 32)
  ? process.env.JWT_SECRET.trim()
  : "mma-cashless-secure-production-jwt-secret-96-bytes-fallback-key";

function buatToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
}

let server;
let baseUrl;
const adminId = `admin_${Date.now()}`;
const stafId = `staf_${Date.now()}`;

test.before(async () => {
  await initializeDatabase();
  const { query } = require("../src/db");
  await query(`
    INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "jenisAkun", "mustChangePassword", "sessionVersion")
    VALUES 
      ($1, 'Admin Tester', $2, 'hash', 'admin', 'superadmin', FALSE, 0),
      ($3, 'Staf Tester', $4, 'hash', 'unitusaha', 'staf', FALSE, 0)
    ON CONFLICT ("username") DO NOTHING
  `, [adminId, `admin_test_${Date.now()}`, stafId, `staf_test_${Date.now()}`]);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test("PERSISTENCE: GET /api/admin/database/status mengembalikan info database PostgreSQL", async () => {
  const adminToken = buatToken({
    id: adminId,
    role: "guru",
    departemen: "admin",
    jenisAkun: "superadmin",
    sv: 0,
  });

  const res = await fetch(`${baseUrl}/api/admin/database/status`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "ok");
  assert.equal(data.dbEngine, "PostgreSQL");
  assert.equal(data.isPersistent, true);
  assert.ok(typeof data.totalSantri === "number");
  assert.ok(typeof data.totalWali === "number");
  assert.ok(typeof data.totalTransaksi === "number");
});

test("PERSISTENCE: GET /api/admin/database/backup mengunduh berkas snapshot JSON", async () => {
  const adminToken = buatToken({
    id: adminId,
    role: "guru",
    departemen: "admin",
    jenisAkun: "superadmin",
    sv: 0,
  });

  const res = await fetch(`${baseUrl}/api/admin/database/backup`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  assert.equal(res.status, 200);
  const disposition = res.headers.get("content-disposition");
  assert.ok(disposition && disposition.includes("attachment; filename="));

  const data = await res.json();
  assert.ok(data.metadata);
  assert.equal(data.metadata.aplikasi, "Ma'had Mudaiyatul Anwar");
  assert.ok(Array.isArray(data.santri));
  assert.ok(Array.isArray(data.wali));
  assert.ok(Array.isArray(data.guru));
  assert.ok(Array.isArray(data.unitUsaha));
});

test("PERSISTENCE: POST /api/admin/database/backup/simpan-lokal menyimpan snapshot ke server", async () => {
  const adminToken = buatToken({
    id: adminId,
    role: "guru",
    departemen: "admin",
    jenisAkun: "superadmin",
    sv: 0,
  });

  const res = await fetch(`${baseUrl}/api/admin/database/backup/simpan-lokal`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "ok");
  assert.ok(data.filename.startsWith("backup-mma-"));
});

test("PERSISTENCE: Non-admin ditolak saat mengakses endpoint database (403)", async () => {
  const stafToken = buatToken({
    id: stafId,
    role: "guru",
    departemen: "unitusaha",
    jenisAkun: "staf",
    sv: 0,
  });

  const res = await fetch(`${baseUrl}/api/admin/database/status`, {
    headers: { Authorization: `Bearer ${stafToken}` },
  });

  assert.equal(res.status, 403);
});
