const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "auth-security-test-secret-that-is-not-used-in-production";
process.env.NODE_ENV = "test";

const accounts = {
  Guru: [{
    id: "guru-admin",
    nama: "Admin Test",
    username: "admin",
    password: bcrypt.hashSync("admin123", 4),
    mustChangePassword: true,
    loginFailedAttempts: 0,
    loginLockedUntil: null,
    sessionVersion: 0,
    departemen: "admin",
    jenisAkun: "superadmin",
  }],
  Wali: [{
    id: "wali-1",
    nama: "Wali Test",
    username: "wali.test",
    password: bcrypt.hashSync("Current-password-123", 4),
    mustChangePassword: true,
    loginFailedAttempts: 0,
    loginLockedUntil: null,
    sessionVersion: 0,
  }],
};
let failAccountLookup = false;

const databaseMock = {
  async withTransaction(callback) { return callback(); },
  async queryOne(sql, params = []) {
    if (failAccountLookup && /FROM "(Guru|Wali)" WHERE "id"/.test(sql)) throw new Error("database unavailable");
    const tableMatch = sql.match(/(?:FROM|UPDATE) "(Guru|Wali)"/);
    const table = tableMatch?.[1];
    if (!table) return null;
    if (sql.includes('WHERE "username"')) {
      return accounts[table].find((account) => account.username === params[0]) || null;
    }
    if (sql.includes('WHERE "id"')) {
      const id = sql.startsWith("UPDATE") ? params[1] : params[0];
      const account = accounts[table].find((entry) => entry.id === id);
      if (!account) return null;
      if (sql.startsWith("UPDATE")) {
        if (sql.includes('RETURNING "loginFailedAttempts"')) {
          account.loginFailedAttempts = account.loginLockedUntil && Date.parse(account.loginLockedUntil) <= Date.now()
            ? 1 : account.loginFailedAttempts + 1;
          account.loginLockedUntil = account.loginFailedAttempts >= params[0]
            ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
          return { loginFailedAttempts: account.loginFailedAttempts, loginLockedUntil: account.loginLockedUntil };
        }
        if (sql.includes('"password" = $1')) {
          account.password = params[0];
          account.mustChangePassword = false;
          account.sessionVersion += 1;
          account.loginFailedAttempts = 0;
          account.loginLockedUntil = null;
        } else {
          account.loginFailedAttempts = 0;
          account.loginLockedUntil = null;
        }
        return account;
      }
      if (sql.includes('"password"')) return {
        password: account.password,
        mustChangePassword: account.mustChangePassword,
        sessionVersion: account.sessionVersion,
      };
      return account;
    }
    return null;
  },
  async query(sql, params = []) {
    if (sql.includes('INSERT INTO "AuditLog"')) return { rowCount: 1, rows: [] };
    const table = sql.match(/UPDATE "(Guru|Wali)"/)?.[1];
    if (table) {
      const account = accounts[table].find((entry) => entry.id === params[params.length - 1]);
      if (account && sql.includes('"password" = $1')) {
        account.password = params[0];
        account.mustChangePassword = false;
        account.sessionVersion += 1;
        account.loginFailedAttempts = 0;
        account.loginLockedUntil = null;
      } else if (account) {
        account.loginFailedAttempts = 0;
        account.loginLockedUntil = null;
      }
    }
    return { rowCount: 1, rows: [] };
  },
};

const dbModulePath = require.resolve("../src/db");
require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: databaseMock,
};
const { login, changePassword, requireAuth, JWT_SECRET } = require("../src/auth");
const { CashlessError } = require("../src/cashlessService");

function middlewareRequest(token, baseUrl, routePath) {
  const req = { headers: { authorization: `Bearer ${token}` }, baseUrl, path: routePath };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return { req, res };
}

test("login rejects invalid credentials and locks after five consecutive failures", async () => {
  const account = accounts.Wali[0];
  account.loginFailedAttempts = 0;
  account.loginLockedUntil = null;

  for (let attempt = 1; attempt < 5; attempt += 1) {
    assert.equal(await login(account.username, "wrong-password"), null);
  }
  await assert.rejects(
    login(account.username, "wrong-password"),
    (error) => error instanceof CashlessError && error.status === 423,
  );
  await assert.rejects(
    login(account.username, "Current-password-123"),
    (error) => error instanceof CashlessError && error.status === 423,
  );
});

test("legacy demo credentials are refused in production environments", async () => {
  const previousRailwayEnvironment = process.env.RAILWAY_ENVIRONMENT;
  process.env.RAILWAY_ENVIRONMENT = "production";
  try {
    assert.equal(await login("admin", "admin123"), null);
  } finally {
    if (previousRailwayEnvironment === undefined) delete process.env.RAILWAY_ENVIRONMENT;
    else process.env.RAILWAY_ENVIRONMENT = previousRailwayEnvironment;
  }
});

test("first-login token is restricted to password change and rotates to a normal session", async () => {
  const account = accounts.Wali[0];
  account.password = bcrypt.hashSync("Current-password-123", 4);
  account.mustChangePassword = true;
  account.loginFailedAttempts = 0;
  account.loginLockedUntil = null;

  const session = await login(account.username, "Current-password-123");
  assert.equal(session.user.mustChangePassword, true);
  const blocked = middlewareRequest(session.token, "/api/santri", "/me-anak");
  await requireAuth(blocked.req, blocked.res, () => assert.fail("protected route must not be reached"));
  assert.equal(blocked.res.statusCode, 403);
  assert.equal(blocked.res.body.kode, "PASSWORD_CHANGE_REQUIRED");

  const allowed = middlewareRequest(session.token, "/api/auth", "/change-password");
  await requireAuth(allowed.req, allowed.res, () => {});
  assert.equal(allowed.req.user.purpose, "password-change");
  const changed = await changePassword({
    user: allowed.req.user,
    newPassword: "New-strong-password-456",
  });
  assert.equal(changed.user.mustChangePassword, false);
  assert.equal(await bcrypt.compare("New-strong-password-456", account.password), true);

  const reused = middlewareRequest(session.token, "/api/auth", "/change-password");
  await requireAuth(reused.req, reused.res, () => assert.fail("consumed password-change token must not be reusable"));
  assert.equal(reused.res.statusCode, 401);

  const normal = middlewareRequest(changed.token, "/api/santri", "/me-anak");
  await requireAuth(normal.req, normal.res, () => {});
  assert.equal(normal.req.user.id, account.id);

  account.sessionVersion += 1;
  account.mustChangePassword = true;
  const resetInvalidatesOldSession = middlewareRequest(changed.token, "/api/santri", "/me-anak");
  await requireAuth(resetInvalidatesOldSession.req, resetInvalidatesOldSession.res, () => assert.fail("reset must invalidate existing sessions"));
  assert.equal(resetInvalidatesOldSession.res.statusCode, 401);
});

test("password change accepts 6 characters and rejects 5", async () => {
  const account = accounts.Wali[0];
  account.password = bcrypt.hashSync("Current-password-123", 4);
  account.mustChangePassword = false;
  account.sessionVersion = 0;
  const user = { role: "wali", id: account.id, sv: 0 };
  await assert.rejects(
    changePassword({ user, currentPassword: "Current-password-123", newPassword: "12345" }),
    (error) => error instanceof CashlessError && error.status === 400 && /minimal 6 karakter/.test(error.message),
  );
  const changed = await changePassword({ user, currentPassword: "Current-password-123", newPassword: "abc123" });
  assert.equal(changed.user.mustChangePassword, false);
  assert.equal(await bcrypt.compare("abc123", account.password), true);
});

test("password change validates length and current password", async () => {
  const account = accounts.Wali[0];
  account.password = bcrypt.hashSync("Current-password-123", 4);
  account.mustChangePassword = false;
  account.sessionVersion = 0;
  const user = { role: "wali", id: account.id, sv: 0 };
  await assert.rejects(
    changePassword({ user, currentPassword: "Current-password-123", newPassword: "short" }),
    (error) => error instanceof CashlessError && error.status === 400,
  );
  await assert.rejects(
    changePassword({ user, currentPassword: "not-the-current-password", newPassword: "New-strong-password-456" }),
    (error) => error instanceof CashlessError && error.status === 400,
  );
});

test("database failures in authentication middleware are passed to the server error handler", async () => {
  const token = jwt.sign({ role: "wali", id: accounts.Wali[0].id }, JWT_SECRET, { expiresIn: "5m" });
  const { req, res } = middlewareRequest(token, "/api/santri", "/me-anak");
  let receivedError;
  failAccountLookup = true;
  try {
    await requireAuth(req, res, (error) => { receivedError = error; });
  } finally {
    failAccountLookup = false;
  }
  assert.match(receivedError.message, /database unavailable/);
  assert.equal(res.statusCode, null);
});
