const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.JWT_SECRET = "fase5-uat-test-secret-32-characters-minimum-length";
process.env.NODE_ENV = "test";

const santriDb = [
  { id: "s_p1", nama: "Santri Tanpa Wali", kelas: "7A", nis: "7001", waliId: null, saldo: 0 },
  { id: "s_p2", nama: "Santri Dengan Wali", kelas: "7A", nis: "7002", waliId: "w_p1", saldo: 50000 },
];
const waliDb = [
  { id: "w_p1", nama: "Wali P1", username: "wali.7002", statusAkun: "Aktif" }
];

const databaseMock = {
  FACE_MODEL: "mfn192-v2",
  async withTransaction(callback) { return callback(); },
  async queryOne(sql, params = []) {
    if (sql.includes('FROM "Santri" WHERE "id" = $1')) return santriDb.find((s) => s.id === params[0]) || null;
    if (sql.includes('FROM "Wali" WHERE "id" = $1')) return waliDb.find((w) => w.id === params[0]) || null;
    return null;
  },
  async queryAll(sql, params = []) {
    if (sql.includes('FROM "Santri" WHERE "waliId" = $1')) return santriDb.filter((s) => s.waliId === params[0]);
    return [];
  },
  async query(sql, params = []) { return { rowCount: 1, rows: [] }; },
};

const dbModulePath = require.resolve("../src/db");
require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: databaseMock,
};

const cashless = require("../src/cashlessService");

test("FASE 5: Handling Data Parsial (Santri Tanpa Wali & Tanpa Foto/Nilai)", async () => {
  const pub1 = await cashless.toPublicSantri(santriDb[0]);
  assert.equal(pub1.nama, "Santri Tanpa Wali");
  assert.equal(pub1.waliId, null);
  assert.equal(pub1.punyaWajah, false);
  assert.equal(pub1.punyaPin, false);
});

test("FASE 5: Verifikasi Dokumen UAT Checklist per Departemen", () => {
  const uatPath = path.join(__dirname, "..", "docs", "uat-checklist.md");
  assert.ok(fs.existsSync(uatPath), "Dokumen uat-checklist.md wajib ada.");

  const content = fs.readFileSync(uatPath, "utf-8");
  assert.ok(content.includes("SEKRETARIAT & ADMIN"), "Memuat checklist Sekretariat.");
  assert.ok(content.includes("PENGASUHAN"), "Memuat checklist Pengasuhan.");
  assert.ok(content.includes("PENGAJARAN"), "Memuat checklist Pengajaran.");
  assert.ok(content.includes("LPTQ"), "Memuat checklist LPTQ.");
  assert.ok(content.includes("KEUANGAN"), "Memuat checklist Keuangan.");
  assert.ok(content.includes("UNIT USAHA & BMT"), "Memuat checklist Cashless BMT.");
  assert.ok(content.includes("WALI SANTRI"), "Memuat checklist Wali.");
});
