require("dotenv").config({ quiet: true });
if (process.env.NEON_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.NEON_DATABASE_URL;
}

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const app = require("../src/app");
const { pool, query, queryOne } = require("../src/db");
const { editGuru, editPasswordGuru, hapusGuru } = require("../src/adminService");

const JWT_SECRET = (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 32)
  ? process.env.JWT_SECRET.trim()
  : "mma-cashless-secure-production-jwt-secret-96-bytes-fallback-key";

function buatToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
}

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test("ADMIN GURU: edit akun guru nama & username serta password via service", async () => {
  const guruId = `guru_edit_${crypto.randomUUID()}`;
  const usernameAwal = `user_${crypto.randomUUID().slice(0, 8)}`;
  const passwordAwal = "password123";
  const passwordHash = await bcrypt.hash(passwordAwal, 10);

  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "jenisAkun") VALUES ($1, $2, $3, $4, $5, $6)',
    [guruId, "Guru Awal", usernameAwal, passwordHash, "pengasuhan", "staf"]
  );

  try {
    // 1. Edit nama dan username
    const usernameBaru = `user_edited_${crypto.randomUUID().slice(0, 8)}`;
    const editRes = await editGuru({
      id: guruId,
      nama: "Guru Diedit",
      username: usernameBaru,
      actingUserId: guruId,
    });
    assert.equal(editRes.nama, "Guru Diedit");
    assert.equal(editRes.username, usernameBaru);

    // 2. Edit kata sandi via editPasswordGuru
    const pwRes = await editPasswordGuru({
      id: guruId,
      username: usernameBaru,
      password: "newpassword123",
      actingUserId: guruId,
    });
    assert.equal(pwRes.passwordDiubah, true);

    const updatedRow = await queryOne('SELECT * FROM "Guru" WHERE "id" = $1', [guruId]);
    assert.equal(updatedRow.nama, "Guru Diedit");
    assert.equal(updatedRow.username, usernameBaru);
    assert.equal(await bcrypt.compare("newpassword123", updatedRow.password), true);

    // 3. Fallback pencarian dengan username jika id lokal berbeda
    const fallbackRes = await editGuru({
      id: "non-existent-local-id",
      username: usernameBaru,
      nama: "Guru Fallback",
      actingUserId: guruId,
    });
    assert.equal(fallbackRes.nama, "Guru Fallback");

    // 4. Fallback password dengan username
    const pwFallback = await editPasswordGuru({
      id: "non-existent-local-id",
      username: usernameBaru,
      password: "brandnewpassword456",
      actingUserId: guruId,
    });
    assert.equal(pwFallback.passwordDiubah, true);
  } finally {
    await query('DELETE FROM "Guru" WHERE "id" = $1', [guruId]).catch(() => {});
  }
});

test("ADMIN GURU HTTP: endpoint PUT /api/admin/guru/:id dan /password merespons 200 dan tidak 404", async () => {
  const adminId = `admin_${crypto.randomUUID()}`;
  const guruTargetId = `target_${crypto.randomUUID()}`;
  const initialUsername = `target_${crypto.randomUUID().slice(0, 8)}`;
  const passwordHash = await bcrypt.hash("initialpass123", 10);

  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "jenisAkun", "sessionVersion", "mustChangePassword") VALUES ($1, $2, $3, $4, $5, $6, 1, FALSE)',
    [adminId, "Super Admin", `admin_${crypto.randomUUID().slice(0, 8)}`, passwordHash, "admin", "superadmin"]
  );

  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "jenisAkun", "sessionVersion", "mustChangePassword") VALUES ($1, $2, $3, $4, $5, $6, 1, FALSE)',
    [guruTargetId, "Staf Target", initialUsername, passwordHash, "pengasuhan", "staf"]
  );

  const adminToken = buatToken({
    id: adminId,
    role: "guru",
    departemen: "admin",
    jenisAkun: "superadmin",
    sv: 1,
  });

  try {
    // 1. Test PUT /api/admin/guru/:id
    const updatedUsername = `target_upd_${crypto.randomUUID().slice(0, 8)}`;
    const resPut = await fetch(`${baseUrl}/api/admin/guru/${guruTargetId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nama: "Staf Target Updated",
        username: updatedUsername,
      }),
    });
    assert.equal(resPut.status, 200, "Endpoint PUT /api/admin/guru/:id harus 200, bukan 404");
    const jsonPut = await resPut.json();
    assert.equal(jsonPut.nama, "Staf Target Updated");
    assert.equal(jsonPut.username, updatedUsername);

    // 2. Test PUT /api/admin/guru/:id/password
    const resPw = await fetch(`${baseUrl}/api/admin/guru/${guruTargetId}/password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        password: "newsecretpassword789",
        username: updatedUsername,
      }),
    });
    assert.equal(resPw.status, 200, "Endpoint PUT /api/admin/guru/:id/password harus 200, bukan 404");
    const jsonPw = await resPw.json();
    assert.equal(jsonPw.passwordDiubah, true);

    // 3. Test PUT /api/admin/guru/:id dengan password sekaligus dalam 1 request
    const resBoth = await fetch(`${baseUrl}/api/admin/guru/${guruTargetId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nama: "Staf Target Final",
        username: updatedUsername,
        password: "combinedpassword999",
      }),
    });
    assert.equal(resBoth.status, 200);
    const jsonBoth = await resBoth.json();
    assert.equal(jsonBoth.nama, "Staf Target Final");

    const verifyRow = await queryOne('SELECT * FROM "Guru" WHERE "id" = $1', [guruTargetId]);
    assert.equal(verifyRow.nama, "Staf Target Final");
    assert.equal(await bcrypt.compare("combinedpassword999", verifyRow.password), true);
  } finally {
    await query('DELETE FROM "Guru" WHERE "id" IN ($1, $2)', [adminId, guruTargetId]).catch(() => {});
  }
});
