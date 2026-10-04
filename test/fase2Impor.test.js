const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "fase2-impor-test-secret-32-characters-minimum-length";
process.env.NODE_ENV = "test";

const santriDb = [
  { id: "s1", nama: "Santri Lama 1", nis: "9901", nisn: "009901" }
];
const waliDb = [];
const batchDb = [];
const rekonDb = [];
const auditDb = [];

const databaseMock = {
  FACE_MODEL: "mfn192-v2",
  async withTransaction(callback) { return callback(); },
  async queryOne(sql, params = []) {
    if (sql.includes('FROM "BatchImpor"')) return batchDb.find((b) => b.id === params[0]) || null;
    if (sql.includes('FROM "Santri" WHERE "nis" = $1')) return santriDb.find((s) => s.nis === params[0] || (params[1] && s.nisn === params[1])) || null;
    if (sql.includes('FROM "Wali" WHERE "nama" = $1')) return waliDb.find((w) => w.nama === params[0]) || null;
    if (sql.includes('FROM "Wali" WHERE "username" = $1')) return waliDb.find((w) => w.username === params[0]) || null;
    if (sql.includes('FROM "Wali" WHERE "id" = $1')) return waliDb.find((w) => w.id === params[0]) || null;
    if (sql.includes('FROM "Santri" WHERE "id" = $1')) return santriDb.find((s) => s.id === params[0]) || null;
    if (sql.includes('SELECT COUNT(*) AS "n" FROM "TransaksiCashless"')) return { n: 0 };
    return null;
  },
  async queryAll(sql, params = []) {
    if (sql.includes('SELECT "nis" FROM "Santri"')) return santriDb.map((s) => ({ nis: s.nis }));
    if (sql.includes('SELECT "nisn" FROM "Santri"')) return santriDb.map((s) => ({ nisn: s.nisn }));
    if (sql.includes('FROM "Santri"')) return santriDb;
    if (sql.includes('FROM "Wali"')) return waliDb;
    return [];
  },
  async query(sql, params = []) {
    if (sql.includes('INSERT INTO "BatchImpor"')) {
      batchDb.push({ id: params[0], namaBatch: params[1], status: "Berhasil" });
    } else if (sql.includes('INSERT INTO "Wali"')) {
      waliDb.push({ id: params[0], nama: params[1], hp: params[2], username: params[3], password: params[4], mustChangePassword: true, statusAkun: "Belum Aktivasi" });
    } else if (sql.includes('INSERT INTO "Santri"')) {
      santriDb.push({ id: params[0], nama: params[1], kelas: params[2], nis: params[3], nisn: params[4], waliId: params[5] });
    } else if (sql.includes('INSERT INTO "AuditLog"')) {
      auditDb.push({ id: params[0], aksi: params[3] });
    } else if (sql.includes('INSERT INTO "RekonsiliasiImpor"')) {
      rekonDb.push({ id: params[0], batchId: params[1], tipe: params[2], status: params[7] });
    } else if (sql.includes('DELETE FROM "Santri"')) {
      const idx = santriDb.findIndex((s) => s.id === params[0] || s.importBatchId === params[0]);
      if (idx !== -1) santriDb.splice(idx, 1);
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

const impor = require("../src/imporService");

test("FASE 2: Pembuatan Berkas Template CSV Impor Santri", () => {
  const csv = impor.buatTemplateImporCSV();
  assert.ok(csv.includes("nama,nis,nisn,kelas,jenisKelamin"), "Header memuat kolom dasar santri");
  assert.ok(csv.includes("namaWali,hpWali"), "Header memuat kolom wali santri");
  assert.ok(csv.includes("Ahmad Ridwan"), "Memuat contoh baris data santri 1");
});

test("FASE 2: Dry-run Impor Excel memvalidasi baris kosong dan duplikat NIS/NISN", async () => {
  await assert.rejects(async () => {
    await impor.prosesDryRunImpor([]);
  }, /Data impor kosong/);

  const dataDuplikat = [
    { nama: "Santri A", nis: "1001", kelas: "7A" },
    { nama: "Santri B", nis: "1001", kelas: "7A" },
  ];
  const res = await impor.prosesDryRunImpor(dataDuplikat);
  assert.equal(res.valid, false, "Dry-run harus tidak valid untuk duplikat NIS.");
  assert.equal(res.jumlahGagal, 1);
  assert.ok(res.detailGagal[0].alasan.includes("duplikat"), "Alasan gagal memuat pesan duplikat");
});

test("FASE 2: Dry-run Impor Excel menerima data valid", async () => {
  const dataValid = [
    { nama: "Ahmad Ridwan", nis: "1001", nisn: "0012345678", kelas: "7A", jenisKelamin: "L" },
    { nama: "Siti Fatimah", nis: "1002", nisn: "0087654321", kelas: "7B", jenisKelamin: "P" },
  ];
  const res = await impor.prosesDryRunImpor(dataValid);
  assert.equal(res.valid, true, "Dry-run harus valid untuk data lengkap.");
  assert.equal(res.jumlahValid, 2);
  assert.equal(res.jumlahGagal, 0);
});

test("FASE 2: Eksekusi Impor Batch & Provisioning Akun Wali", async () => {
  const rows = [
    { nama: "Ananda Budi", nis: "2001", kelas: "7A", namaWali: "Bpk Budi", hpWali: "08123456789" }
  ];
  const result = await impor.eksekusiImporBatch({
    namaBatch: "Batch Angkatan 2026",
    rows,
    aktorId: "g0",
    aktorNama: "Superadmin Test"
  });

  assert.ok(result.batchId, "Batch ID harus terbuat.");
  assert.equal(result.totalSantri, 1);
  assert.equal(result.totalWaliBaru, 1);
  assert.equal(result.daftarKredensialAwal.length, 1);
  assert.equal(result.daftarKredensialAwal[0].username, "wali.2001");
  assert.ok(result.daftarKredensialAwal[0].passwordAwal, "Password sekali pakai terbuat.");
});

test("FASE 2: Rekonsiliasi Saldo Awal Menolak Selisih Nominal", async () => {
  const items = [
    { nis: "2001", nominal: 100000 },
    { nis: "9901", nominal: 150000 },
  ];
  await assert.rejects(async () => {
    await impor.rekonsiliasiSaldoDanTagihan({
      batchId: "batch-1",
      tipe: "Saldo Awal Cashless",
      items,
      totalKasTarget: 200000,
      aktorId: "g1",
    });
  }, /Rekonsiliasi gagal/);
});

test("FASE 2: Bersihkan Data Demo Membutuhkan Konfirmasi Eksplisit", async () => {
  await assert.rejects(async () => {
    await impor.bersihkanDataDemo({ konfirmasi: false, aktorId: "g0" });
  }, /Konfirmasi pembersihan data demo wajib disetujui/);
});
