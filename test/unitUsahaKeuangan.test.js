process.env.DATABASE_URL ||= "postgres://test:test@127.0.0.1:5432/test";
process.env.JWT_SECRET ||= "unit-usaha-test-secret-minimum-32-chars-long";

const test = require("node:test");
const assert = require("node:assert/strict");
const { requireBMT, requireUnitUsaha } = require("../src/auth");
const { JENIS_TRANSAKSI_UNIT, KATEGORI_CASHFLOW } = require("../src/keuanganService");

test("RBAC & Constants untuk Transaksi Unit Usaha", () => {
  assert.ok(JENIS_TRANSAKSI_UNIT.includes("Dana Masuk"));
  assert.ok(JENIS_TRANSAKSI_UNIT.includes("Dana Keluar"));
  assert.ok(JENIS_TRANSAKSI_UNIT.includes("Transfer Antar Bagian"));

  assert.ok(KATEGORI_CASHFLOW.includes("Unit Usaha - Dana Masuk"));
  assert.ok(KATEGORI_CASHFLOW.includes("Unit Usaha - Dana Keluar"));
  assert.ok(KATEGORI_CASHFLOW.includes("Unit Usaha - Transfer Antar Bagian"));

  // BMT Staff & Superadmin allowed as Admin Unit Usaha
  const bmtUser = { role: "guru", id: "g_bmt", departemen: "unitusaha", unit: "BMT" };
  const superUser = { role: "guru", id: "g_super", departemen: "admin", jenisAkun: "superadmin" };
  const kantinUser = { role: "guru", id: "g_kantin", departemen: "unitusaha", unit: "Kantin" };
  const pengasuhanUser = { role: "guru", id: "g_pengasuhan", departemen: "pengasuhan" };

  function invoke(middleware, user) {
    let nextCalled = false;
    let statusCode = 200;
    let body;
    middleware(
      { user },
      { status(code) { statusCode = code; return this; }, json(v) { body = v; return this; } },
      () => { nextCalled = true; }
    );
    return { nextCalled, statusCode, body };
  }

  // requireBMT (Admin Unit Usaha)
  assert.strictEqual(invoke(requireBMT, bmtUser).nextCalled, true);
  assert.strictEqual(invoke(requireBMT, superUser).nextCalled, true);
  assert.strictEqual(invoke(requireBMT, kantinUser).nextCalled, false);
  assert.strictEqual(invoke(requireBMT, kantinUser).statusCode, 403);

  // requireUnitUsaha (All Unit Usaha staff)
  assert.strictEqual(invoke(requireUnitUsaha, bmtUser).nextCalled, true);
  assert.strictEqual(invoke(requireUnitUsaha, kantinUser).nextCalled, true);
  assert.strictEqual(invoke(requireUnitUsaha, pengasuhanUser).nextCalled, false);
});
