require("dotenv").config({ quiet: true });
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { pool, query, queryOne, initializeDatabase } = require("../src/db");
const { sinkronisasiOfflineKasir, laporanOfflineKasir, auditSaldo, catatTransaksi } = require("../src/cashlessService");

test.before(async () => {
  await initializeDatabase();
});

test.after(async () => {
  await pool.end();
});

test("OFFLINE CASHIER: 50 transaksi offline disinkronkan tanpa saldo ganda", async () => {
  const santriId = `santri_off_50_${crypto.randomUUID()}`;
  const initialSaldo = 200000;

  await query('INSERT INTO "Santri" ("id", "nama", "saldo") VALUES ($1, \'Santri Off 50\', $2)', [santriId, initialSaldo]);
  await query(
    `INSERT INTO "Ledger" ("id", "santriId", "jenis", "jumlah", "saldoSetelah", "referensi", "pelaku", "waktu")
     VALUES ($1, $2, 'Saldo Awal', $3, $4, 'Inisialisasi', 'sistem', $5)`,
    [crypto.randomUUID(), santriId, initialSaldo, initialSaldo, new Date().toISOString()]
  );

  // Buat 50 item antrean offline
  const offlineItems = [];
  for (let i = 1; i <= 50; i++) {
    offlineItems.push({
      idempotencyKey: crypto.randomUUID(),
      santriId,
      unit: "Kantin",
      jenis: "Tarik Tunai",
      kategori: "Jajan Harian",
      jumlah: 2000, // 50 * 2000 = 100.000 total
      keterangan: `Jajan Offline #${i}`,
      metode: "qr",
    });
  }

  // Sinkronisasi batch ke server
  const hasil = await sinkronisasiOfflineKasir({ items: offlineItems, kasirId: "kasir_off_1", unit: "Kantin" });

  assert.equal(hasil.totalItem, 50);
  assert.equal(hasil.suksesCount, 50);
  assert.equal(hasil.gagalCount, 0);

  // Verifikasi saldo server terkini
  const santriDb = await queryOne('SELECT "saldo" FROM "Santri" WHERE "id" = $1', [santriId]);
  assert.equal(Number(santriDb.saldo), 100000, "Saldo server harus terpotong tepat Rp 100.000 menjadi Rp 100.000");

  // Re-sync item yang sama (Replay) -> Tidak memotong saldo lagi
  const replayRes = await sinkronisasiOfflineKasir({ items: offlineItems, kasirId: "kasir_off_1", unit: "Kantin" });
  assert.equal(replayRes.suksesCount, 50);

  const santriDbReplay = await queryOne('SELECT "saldo" FROM "Santri" WHERE "id" = $1', [santriId]);
  assert.equal(Number(santriDbReplay.saldo), 100000, "Replay tidak boleh memotong saldo dua kali");

  // Clean up
  await query('DELETE FROM "QueueOfflineKasir" WHERE "santriId" = $1', [santriId]);
  await query('DELETE FROM "TransaksiCashless" WHERE "santriId" = $1', [santriId]);
  await query('DELETE FROM "Ledger" WHERE "santriId" = $1', [santriId]);
  await query('DELETE FROM "Santri" WHERE "id" = $1', [santriId]);
});

test("OFFLINE CASHIER: Konflik dua kasir offline pada santri yang sama (Server balance NEVER overwritten)", async () => {
  const santriId = `santri_konflik_${crypto.randomUUID()}`;
  const initialSaldo = 30000; // Rp 30.000

  await query('INSERT INTO "Santri" ("id", "nama", "saldo") VALUES ($1, \'Santri Konflik\', $2)', [santriId, initialSaldo]);
  await query(
    `INSERT INTO "Ledger" ("id", "santriId", "jenis", "jumlah", "saldoSetelah", "referensi", "pelaku", "waktu")
     VALUES ($1, $2, 'Saldo Awal', $3, $4, 'Inisialisasi', 'sistem', $5)`,
    [crypto.randomUUID(), santriId, initialSaldo, initialSaldo, new Date().toISOString()]
  );

  // Kasir 1 mencatat transaksi 20.000 offline
  const txKasir1 = {
    idempotencyKey: crypto.randomUUID(),
    santriId,
    unit: "Kantin",
    jenis: "Tarik Tunai",
    kategori: "Jajan Harian",
    jumlah: 20000,
    keterangan: "Jajan Kasir 1",
    metode: "qr",
  };

  // Kasir 2 mencatat transaksi 20.000 offline pada santri yang sama
  const txKasir2 = {
    idempotencyKey: crypto.randomUUID(),
    santriId,
    unit: "Kopel",
    jenis: "Tarik Tunai",
    kategori: "Jajan Harian",
    jumlah: 20000,
    keterangan: "Jajan Kasir 2",
    metode: "qr",
  };

  // Kasir 1 sinkron lebih dulu
  const resKasir1 = await sinkronisasiOfflineKasir({ items: [txKasir1], kasirId: "kasir_1", unit: "Kantin" });
  assert.equal(resKasir1.suksesCount, 1);

  // Saldo tersisa di server = Rp 10.000
  const santriMidsync = await queryOne('SELECT "saldo" FROM "Santri" WHERE "id" = $1', [santriId]);
  assert.equal(Number(santriMidsync.saldo), 10000);

  // Kasir 2 sinkron belakangan -> Ditolak karena saldo tidak cukup (Rp 10.000 < Rp 20.000)
  const resKasir2 = await sinkronisasiOfflineKasir({ items: [txKasir2], kasirId: "kasir_2", unit: "Kopel" });
  assert.equal(resKasir2.suksesCount, 0);
  assert.equal(resKasir2.gagalCount, 1);
  assert.match(resKasir2.hasilDetail[0].pesanError, /saldo/i);

  // Saldo server TETAP Rp 10.000, TIDAK MENJADI NEGATIF, TIDAK MENIMPA
  const santriFinal = await queryOne('SELECT "saldo" FROM "Santri" WHERE "id" = $1', [santriId]);
  assert.equal(Number(santriFinal.saldo), 10000);

  // Verifikasi laporan offline untuk admin
  const report = await laporanOfflineKasir({ page: 1, limit: 10, statusSync: "Semua" });
  const itemDitolak = report.data.find((item) => item.idempotencyKey === txKasir2.idempotencyKey);
  assert.ok(itemDitolak);
  assert.equal(itemDitolak.statusSync, "Ditolak");

  // Clean up
  await query('DELETE FROM "QueueOfflineKasir" WHERE "santriId" = $1', [santriId]);
  await query('DELETE FROM "TransaksiCashless" WHERE "santriId" = $1', [santriId]);
  await query('DELETE FROM "Ledger" WHERE "santriId" = $1', [santriId]);
  await query('DELETE FROM "Santri" WHERE "id" = $1', [santriId]);
});
