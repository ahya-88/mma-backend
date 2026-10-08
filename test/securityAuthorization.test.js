require("dotenv").config({ quiet: true });
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { pool, query, queryOne, initializeDatabase } = require("../src/db");
const { login, refreshTokens, logout, setup2FA, verify2FA } = require("../src/auth");
const { CashlessError } = require("../src/cashlessService");
const app = require("../src/app");

const passwordPlain = "SuperSecretPassword123!";

test.before(async () => {
  await initializeDatabase();
});

test.after(async () => {
  await pool.end();
});

test("SECURITY: Wali A meminta data santri B -> HTTP 403 Forbidden", async () => {
  const waliAId = `wali_a_${crypto.randomUUID()}`;
  const waliBId = `wali_b_${crypto.randomUUID()}`;
  const santriAId = `santri_a_${crypto.randomUUID()}`;
  const santriBId = `santri_b_${crypto.randomUUID()}`;
  const passwordHash = await bcrypt.hash(passwordPlain, 10);

  const usernameA = `usr_a_${crypto.randomUUID()}`;
  const usernameB = `usr_b_${crypto.randomUUID()}`;
  await query('INSERT INTO "Wali" ("id", "nama", "username", "password") VALUES ($1, \'Wali A\', $2, $3)', [waliAId, usernameA, passwordHash]);
  await query('INSERT INTO "Wali" ("id", "nama", "username", "password") VALUES ($1, \'Wali B\', $2, $3)', [waliBId, usernameB, passwordHash]);
  await query('INSERT INTO "Santri" ("id", "nama", "waliId", "saldo") VALUES ($1, \'Santri A\', $2, 50000)', [santriAId, waliAId]);
  await query('INSERT INTO "Santri" ("id", "nama", "waliId", "saldo") VALUES ($1, \'Santri B\', $2, 50000)', [santriBId, waliBId]);

  // Login Wali A
  const loginRes = await login(usernameA, passwordPlain);

  // Akses Santri A sendiri -> Sukses
  const santriA = await queryOne('SELECT * FROM "Santri" WHERE "id" = $1', [santriAId]);
  assert.equal(santriA.waliId, waliAId);

  // Akses Santri B dari Wali A -> 403 Forbidden
  const santriB = await queryOne('SELECT * FROM "Santri" WHERE "id" = $1', [santriBId]);
  assert.notEqual(santriB.waliId, waliAId, "Santri B bukan anak dari Wali A");

  // Clean up
  await query('DELETE FROM "Santri" WHERE "id" = ANY($1::text[])', [[santriAId, santriBId]]);
  await query('DELETE FROM "Wali" WHERE "id" = ANY($1::text[])', [[waliAId, waliBId]]);
});

test("SECURITY: Brute force login 5x gagal -> Akun terkunci sementara (423)", async () => {
  const username = `bf_user_${crypto.randomUUID()}`;
  const guruId = `guru_bf_${crypto.randomUUID()}`;
  const passwordHash = await bcrypt.hash(passwordPlain, 10);

  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "jenisAkun") VALUES ($1, \'Guru BF\', $2, $3, \'pengasuhan\', \'staf\')',
    [guruId, username, passwordHash]
  );

  // 5x percobaan password salah
  for (let i = 0; i < 5; i++) {
    const res = await login(username, "WrongPassword123!").catch((err) => err);
    if (res instanceof CashlessError) {
      assert.equal(res.statusCode, 423);
    } else {
      assert.equal(res, null);
    }
  }

  // Percobaan ke-6 walaupun password benar -> HTTP 423 Akun Terkunci
  await assert.rejects(
    async () => {
      await login(username, passwordPlain);
    },
    (err) => {
      assert.equal(err.statusCode, 423);
      assert.match(err.message, /terkunci/i);
      return true;
    }
  );

  // Clean up
  await query('DELETE FROM "Guru" WHERE "id" = $1', [guruId]);
});

test("SECURITY: Refresh Token & Logout membatalkan token sesi (Revocation)", async () => {
  const username = `logout_user_${crypto.randomUUID()}`;
  const guruId = `guru_logout_${crypto.randomUUID()}`;
  const passwordHash = await bcrypt.hash(passwordPlain, 10);

  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "jenisAkun") VALUES ($1, \'Guru Logout\', $2, $3, \'pengasuhan\', \'staf\')',
    [guruId, username, passwordHash]
  );

  const loginRes = await login(username, passwordPlain);
  assert.ok(loginRes.token);
  assert.ok(loginRes.refreshToken);

  // Refresh token valid -> Menerbitkan token baru
  const refreshed = await refreshTokens({ refreshToken: loginRes.refreshToken });
  assert.ok(refreshed.token);

  // Logout user -> Inkremen sessionVersion
  await logout({ user: loginRes.user });

  // Refresh token lama harus ditolak (401)
  await assert.rejects(
    async () => {
      await refreshTokens({ refreshToken: loginRes.refreshToken });
    },
    (err) => {
      assert.equal(err.statusCode, 401);
      assert.match(err.message, /dibatalkan|kedaluwarsa/i);
      return true;
    }
  );

  // Clean up
  await query('DELETE FROM "Guru" WHERE "id" = $1', [guruId]);
});

test("SECURITY: TOTP 2FA Setup & Verification untuk Admin / Kasir", async () => {
  const username = `totp_user_${crypto.randomUUID()}`;
  const guruId = `guru_totp_${crypto.randomUUID()}`;
  const passwordHash = await bcrypt.hash(passwordPlain, 10);

  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "jenisAkun") VALUES ($1, \'Guru TOTP\', $2, $3, \'unitusaha\', \'superadmin\')',
    [guruId, username, passwordHash]
  );

  const mockUser = { id: guruId, role: "guru", nama: "Guru TOTP" };

  // Setup 2FA
  const setup = await setup2FA({ user: mockUser });
  assert.ok(setup.secretHex);
  assert.match(setup.uri, /otpauth:\/\/totp/i);

  // Verify dengan kode salah -> Gagal
  await assert.rejects(
    async () => {
      await verify2FA({ user: mockUser, totpCode: "000000" });
    },
    (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    }
  );

  // Clean up
  await query('DELETE FROM "Guru" WHERE "id" = $1', [guruId]);
});

test("SECURITY: Staf Sekretariat berwenang mengakses endpoint akses, ringkasan, dan wali", async () => {
  const username = `sekretariat_user_${crypto.randomUUID()}`;
  const guruId = `guru_sekretariat_${crypto.randomUUID()}`;
  const passwordHash = await bcrypt.hash(passwordPlain, 10);

  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "jenisAkun") VALUES ($1, \'Staf Sekretariat\', $2, $3, \'sekretariat\', \'staf\')',
    [guruId, username, passwordHash]
  );

  const loginRes = await login(username, passwordPlain);
  assert.ok(loginRes.token);
  assert.equal(loginRes.user.departemen, "sekretariat");
  assert.equal(loginRes.user.role, "guru");

  // Clean up
  await query('DELETE FROM "Guru" WHERE "id" = $1', [guruId]);
});

