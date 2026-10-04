process.env.DATABASE_URL ||= "postgres://test:test@127.0.0.1:5432/test";
process.env.JWT_SECRET ||= "unit-usaha-test-secret-minimum-32-chars-long";

const test = require("node:test");
const assert = require("node:assert/strict");
const { requireBMT, requireAdminUnitUsaha, requireUnitUsaha } = require("../src/auth");
const { JENIS_TRANSAKSI_UNIT, KATEGORI_CASHFLOW } = require("../src/keuanganService");

test("RBAC & Constants untuk Transaksi Unit Usaha", () => {
  assert.ok(JENIS_TRANSAKSI_UNIT.includes("Dana Masuk"));
  assert.ok(JENIS_TRANSAKSI_UNIT.includes("Dana Keluar"));
  assert.ok(JENIS_TRANSAKSI_UNIT.includes("Transfer Antar Bagian"));

  assert.ok(KATEGORI_CASHFLOW.includes("Unit Usaha - Dana Masuk"));
  assert.ok(KATEGORI_CASHFLOW.includes("Unit Usaha - Dana Keluar"));
  assert.ok(KATEGORI_CASHFLOW.includes("Unit Usaha - Transfer Antar Bagian"));

  // Staf Keuangan/Administrasi, Staf BMT, & Superadmin allowed as Admin Unit Usaha
  const bmtUser = { role: "guru", id: "g_bmt", departemen: "unitusaha", unit: "BMT" };
  const keuanganUser = { role: "guru", id: "g_keuangan", departemen: "administrasi" };
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

  // requireAdminUnitUsaha (Keuangan, BMT, Superadmin)
  assert.strictEqual(invoke(requireAdminUnitUsaha, bmtUser).nextCalled, true);
  assert.strictEqual(invoke(requireAdminUnitUsaha, keuanganUser).nextCalled, true);
  assert.strictEqual(invoke(requireAdminUnitUsaha, superUser).nextCalled, true);
  assert.strictEqual(invoke(requireAdminUnitUsaha, kantinUser).nextCalled, false);
  assert.strictEqual(invoke(requireAdminUnitUsaha, kantinUser).statusCode, 403);
  assert.strictEqual(invoke(requireAdminUnitUsaha, pengasuhanUser).nextCalled, false);

  // requireUnitUsaha (All Unit Usaha staff)
  assert.strictEqual(invoke(requireUnitUsaha, bmtUser).nextCalled, true);
  assert.strictEqual(invoke(requireUnitUsaha, kantinUser).nextCalled, true);
  assert.strictEqual(invoke(requireUnitUsaha, pengasuhanUser).nextCalled, false);
});
