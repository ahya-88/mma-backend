process.env.DATABASE_URL ||= "postgres://test:test@127.0.0.1:5432/test";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isSuperAdmin, jenisAkunEfektif, requireDashboardAdmin, requireAdmin,
  requireAnyStaff, requirePengasuhan, requireBMT, requirePasswordResetAuthority,
} = require("../src/auth");

// Admin sudah dilebur ke Superadmin (4 Okt 2026). Akun lama berjenis "admin" harus
// diperlakukan persis seperti Superadmin, termasuk sebelum migrasi database berjalan.
const legacyAdmin = { role: "guru", id: "admin", departemen: "admin", jenisAkun: "admin" };
const superadmin = { role: "guru", id: "superadmin", departemen: "admin", jenisAkun: "superadmin" };
const staf = { role: "guru", id: "staf", departemen: "pengasuhan", jenisAkun: "staf" };

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

test("legacy Admin accounts are treated as Superadmin", () => {
  assert.equal(jenisAkunEfektif(legacyAdmin), "superadmin");
  assert.equal(jenisAkunEfektif(superadmin), "superadmin");
  assert.equal(jenisAkunEfektif({ role: "guru", departemen: "admin" }), "superadmin");
  assert.equal(jenisAkunEfektif(staf), "staf");
  assert.equal(isSuperAdmin(legacyAdmin), true);
  assert.equal(isSuperAdmin(superadmin), true);
  assert.equal(isSuperAdmin(staf), false);
  assert.equal(isSuperAdmin({ role: "wali", id: "w" }), false);
});

test("legacy Admin gets the full Superadmin surface, including writes", () => {
  for (const user of [legacyAdmin, superadmin]) {
    assert.equal(invoke(requireDashboardAdmin, user).nextCalled, true);
    assert.equal(invoke(requireAdmin, user).nextCalled, true);
    assert.equal(invoke(requirePengasuhan, user, "POST").nextCalled, true);
    assert.equal(invoke(requireAnyStaff, user, "POST").nextCalled, true);
    assert.equal(invoke(requireBMT, user).nextCalled, true);
  }
});

test("regular staff and guardians still cannot reach Superadmin management", () => {
  assert.equal(invoke(requireAdmin, staf).statusCode, 403);
  assert.equal(invoke(requireDashboardAdmin, staf).statusCode, 403);
  assert.equal(invoke(requireAdmin, { role: "wali", id: "w" }).statusCode, 403);
  assert.equal(invoke(requirePengasuhan, { ...staf, departemen: "lptq" }).statusCode, 403);
});

test("password reset is limited to Superadmin (incl. legacy Admin) and Sekretariat", () => {
  const sekretariat = { role: "guru", id: "sekretariat", departemen: "sekretariat" };
  const pengasuhan = { role: "guru", id: "pengasuhan", departemen: "pengasuhan" };
  assert.equal(invoke(requirePasswordResetAuthority, legacyAdmin).nextCalled, true);
  assert.equal(invoke(requirePasswordResetAuthority, superadmin).nextCalled, true);
  assert.equal(invoke(requirePasswordResetAuthority, sekretariat).nextCalled, true);
  assert.equal(invoke(requirePasswordResetAuthority, pengasuhan).statusCode, 403);
  assert.equal(invoke(requirePasswordResetAuthority, { role: "wali", id: "wali" }).statusCode, 403);
});
