const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "fase3-performa-test-secret-32-characters-minimum-length";
process.env.NODE_ENV = "test";

const nilaiDb = [
  { id: "n1", santriId: "s1", mapel: "Matematika", nilai: 85, createdAt: "2026-01-01T00:00:00Z" },
  { id: "n2", santriId: "s2", mapel: "Bahasa Arab", nilai: 90, createdAt: "2026-01-01T00:00:00Z" },
];

const databaseMock = {
  FACE_MODEL: "mfn192-v2",
  async withTransaction(callback) { return callback(); },
  async queryOne(sql, params = []) { return null; },
  async queryAll(sql, params = []) {
    if (sql.includes('FROM "Nilai" WHERE "santriId" = $1')) {
      return nilaiDb.filter((n) => n.santriId === params[0]);
    }
    if (sql.includes('FROM "Nilai"')) return nilaiDb;
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

const akademik = require("../src/akademikService");

test("FASE 3: Query nilaiPerSantri menggunakan SQL WHERE terfokus (Bebas N+1)", async () => {
  const hasil = await akademik.nilaiPerSantri("s1");
  assert.equal(hasil.length, 1);
  assert.equal(hasil[0].id, "n1");
  assert.equal(hasil[0].santriId, "s1");
});
