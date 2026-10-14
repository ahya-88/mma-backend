process.env.DATABASE_URL ||= "postgres://test:test@127.0.0.1:5432/test";

const test = require("node:test");
const assert = require("node:assert/strict");

test("RBAC Hardening: checks on secured endpoints", async () => {
  const { requireAdministrasi, requireAnyStaff, requireAdmin, isSuperAdmin } = require("../src/auth");
  const waliUser = { role: "wali", id: "wali-1" };
  const guruLptq = { role: "guru", id: "guru-1", departemen: "lptq" };
  const guruAdmin = { role: "guru", id: "guru-2", departemen: "administrasi" };
  const superadmin = { role: "guru", id: "admin", departemen: "admin", jenisAkun: "superadmin" };

  function invoke(middleware, user) {
    let nextCalled = false;
    let statusCode = 200;
    let body;
    middleware(
      { user },
      { status(code) { statusCode = code; return this; }, json(val) { body = val; return this; } },
      () => { nextCalled = true; },
    );
    return { nextCalled, statusCode, body };
  }

  // 1. requireAdministrasi
  assert.equal(invoke(requireAdministrasi, waliUser).statusCode, 403);
  assert.equal(invoke(requireAdministrasi, guruLptq).statusCode, 403);
  assert.equal(invoke(requireAdministrasi, guruAdmin).nextCalled, true);
  assert.equal(invoke(requireAdministrasi, superadmin).nextCalled, true);

  // 2. requireAnyStaff
  assert.equal(invoke(requireAnyStaff, waliUser).statusCode, 403);
  assert.equal(invoke(requireAnyStaff, guruLptq).nextCalled, true);
  assert.equal(invoke(requireAnyStaff, guruAdmin).nextCalled, true);

  // 3. requireAdmin
  assert.equal(invoke(requireAdmin, waliUser).statusCode, 403);
  assert.equal(invoke(requireAdmin, guruLptq).statusCode, 403);
  assert.equal(invoke(requireAdmin, superadmin).nextCalled, true);
});
