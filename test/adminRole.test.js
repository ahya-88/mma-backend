process.env.DATABASE_URL ||= "postgres://test:test@127.0.0.1:5432/test";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isSuperAdmin, isOperationalAdmin, requireDashboardAdmin, requireAdmin,
  requireAnyStaff, requirePengasuhan, requireBMT, requirePasswordResetAuthority,
} = require("../src/auth");

const admin = { role: "guru", id: "admin", departemen: "admin", jenisAkun: "admin" };
const superadmin = { role: "guru", id: "superadmin", departemen: "admin", jenisAkun: "superadmin" };

function invoke(middleware, user, method = "GET") {
  let nextCalled = false;
  let statusCode = 200;
  let body;
  middleware(
    { user, method },
    { status(code) { statusCode = code; return this; }, json(value) { body = value; return this; } },
    () => { nextCalled = true; },
  );
  return { nextCalled, statusCode, body };
}

test("classifies separate Admin and Superadmin identities", () => {
  assert.equal(isOperationalAdmin(admin), true);
  assert.equal(isSuperAdmin(admin), false);
  assert.equal(isSuperAdmin(superadmin), true);
  assert.equal(isSuperAdmin({ role: "guru", departemen: "admin" }), true);
});

test("Admin can open the dashboard but cannot access Superadmin management", () => {
  assert.equal(invoke(requireDashboardAdmin, admin).nextCalled, true);
  assert.equal(invoke(requireAdmin, admin).statusCode, 403);
  assert.equal(invoke(requireAdmin, superadmin).nextCalled, true);
});

test("Admin can read cross-department data but cannot write it", () => {
  assert.equal(invoke(requirePengasuhan, admin, "GET").nextCalled, true);
  assert.equal(invoke(requirePengasuhan, admin, "POST").statusCode, 403);
  assert.equal(invoke(requireAnyStaff, admin, "GET").nextCalled, true);
  assert.equal(invoke(requireAnyStaff, admin, "POST").statusCode, 403);
});

test("Admin is not granted BMT-only access", () => {
  assert.equal(invoke(requireBMT, admin).statusCode, 403);
  assert.equal(invoke(requireBMT, superadmin).nextCalled, true);
});

test("password reset is limited to Admin, Superadmin, and Sekretariat", () => {
  const sekretariat = { role: "guru", id: "sekretariat", departemen: "sekretariat" };
  const pengasuhan = { role: "guru", id: "pengasuhan", departemen: "pengasuhan" };
  assert.equal(invoke(requirePasswordResetAuthority, admin).nextCalled, true);
  assert.equal(invoke(requirePasswordResetAuthority, superadmin).nextCalled, true);
  assert.equal(invoke(requirePasswordResetAuthority, sekretariat).nextCalled, true);
  assert.equal(invoke(requirePasswordResetAuthority, pengasuhan).statusCode, 403);
  assert.equal(invoke(requirePasswordResetAuthority, { role: "wali", id: "wali" }).statusCode, 403);
});
