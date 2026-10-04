const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "fase4-ketahanan-test-secret-32-characters-minimum-length";
process.env.NODE_ENV = "test";

const santriDb = [
  { id: "s1", nama: "Santri Test 1", nis: "1001", saldo: 50000, pinHash: null, limitJajanHarian: null, durasiBlokirHari: 3, blokirAktif: 0 }
];
const txDb = [];

const databaseMock = {
  FACE_MODEL: "mfn192-v2",
  async withTransaction(callback) { return callback(); },
  async queryOne(sql, params = []) {
    if (sql.includes('FROM "Santri"')) return santriDb.find((s) => s.id === params[0]) || null;
    if (sql.includes('SELECT COALESCE(SUM("jumlah"), 0) AS "total"')) return { total: 0 };
    if (sql.includes('SELECT 1 AS "ok"')) return { ok: 1 };
    return null;
  },
  async queryAll(sql, params = []) { return []; },
  async query(sql, params = []) {
    if (sql.includes('INSERT INTO "TransaksiCashlessIdempotency"')) {
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes('UPDATE "Santri" SET "saldo"')) {
      const s = santriDb.find((item) => item.id === params[params.length - 1]);
      if (s) s.saldo = params[0];
    }
    if (sql.includes('INSERT INTO "TransaksiCashless"')) {
      txDb.push({ id: params[0], santriId: params[1], jumlah: params[6] });
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

const cashless = require("../src/cashlessService");

test("FASE 4: Sinkronisasi Offline Kasir Memproses Antrian dan Menolak Parameter Tidak Lengkap", async () => {
  const items = [
    {
      idempotencyKey: "11111111-1111-1111-1111-111111111111",
      santriId: "s1",
      jenis: "Setor Tunai",
      kategori: "Setor Tunai",
      jumlah: 10000,
      metode: "manual"
    },
    {
      // Tanpa idempotencyKey -> Harus Gagal
      santriId: "s1",
      jumlah: 5000
    }
  ];

  const res = await cashless.sinkronisasiOfflineKasir({ items, kasirId: "g_kasir", unit: "Kantin" });

  assert.equal(res.totalItem, 2);
  assert.equal(res.suksesCount, 1);
  assert.equal(res.gagalCount, 1);
  assert.equal(res.hasilDetail[0].status, "Sukses");
  assert.equal(res.hasilDetail[1].status, "Gagal");
});

test("FASE 4: Sinkronisasi Offline Kasir Menolak List Kosong", async () => {
  await assert.rejects(async () => {
    await cashless.sinkronisasiOfflineKasir({ items: [], kasirId: "g_kasir", unit: "Kantin" });
  }, /tidak boleh kosong/);
});
