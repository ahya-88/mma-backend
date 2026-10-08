require("dotenv").config({ quiet: true });
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { pool, query, queryOne, withTransaction, initializeDatabase } = require("../src/db");
const {
  catatTransaksi, auditSaldo, koreksiSaldo, prosesPermintaan, ajukanPermintaan,
  CashlessError,
} = require("../src/cashlessService");

test.before(async () => {
  await initializeDatabase();
});

test.after(async () => {
  await pool.end();
});

test("LEDGER & IDEMPOTENCY: Klik ganda & request sama dikirim 2x mengembalikan respons lama (Idempotent)", async () => {
  const santriId = `test_idem_1_${crypto.randomUUID()}`;
  const waliId = `wali_idem_1_${crypto.randomUUID()}`;
  const idempotencyKey = crypto.randomUUID();

  // Setup fixture
  await query(
    'INSERT INTO "Wali" ("id", "nama", "username", "password") VALUES ($1, \'Wali Test\', $2, \'hash\')',
    [waliId, `wali_usr_${crypto.randomUUID()}`]
  );
  await query(
    'INSERT INTO "Santri" ("id", "nama", "waliId", "saldo") VALUES ($1, \'Santri Idem 1\', $2, 100000)',
    [santriId, waliId]
  );

  const txPayload = {
    santriId,
    unit: "Kantin",
    jenis: "Tarik Tunai",
    kategori: "Jajan Harian",
    jumlah: 25000,
    keterangan: "Jajan Es Krim",
    idempotencyKey,
  };

  // Request 1
  const res1 = await catatTransaksi(txPayload);
  assert.equal(res1.transaksi.saldoSetelah, 75000);

  // Request 2 (Klik ganda dengan idempotencyKey dan payload yang sama)
  const res2 = await catatTransaksi(txPayload);
  assert.equal(res2.idempotentReplay, true, "Request ganda harus ditandai idempotentReplay");
  assert.equal(res2.transaksi.saldoSetelah, 75000, "Saldo tidak boleh terpotong dua kali");

  // Verifikasi saldo di DB
  const santriDb = await queryOne('SELECT "saldo" FROM "Santri" WHERE "id" = $1', [santriId]);
  assert.equal(Number(santriDb.saldo), 75000);

  // Clean up fixture
  await query('DELETE FROM "TransaksiCashlessIdempotency" WHERE "idempotencyKey" = $1', [idempotencyKey]);
  await query('DELETE FROM "TransaksiCashless" WHERE "santriId" = $1', [santriId]);
  await query('DELETE FROM "Ledger" WHERE "santriId" = $1', [santriId]);
  await query('DELETE FROM "Santri" WHERE "id" = $1', [santriId]);
  await query('DELETE FROM "Wali" WHERE "id" = $1', [waliId]);
});

test("LEDGER & IDEMPOTENCY: Key idempotensi sama dengan payload berbeda ditolak dengan 409 Conflict", async () => {
  const santriId = `test_idem_409_${crypto.randomUUID()}`;
  const idempotencyKey = crypto.randomUUID();

  await query('INSERT INTO "Santri" ("id", "nama", "saldo") VALUES ($1, \'Santri 409\', 100000)', [santriId]);

  // Request 1
  await catatTransaksi({
    santriId,
    unit: "Kantin",
    jenis: "Tarik Tunai",
    kategori: "Jajan Harian",
    jumlah: 10000,
    idempotencyKey,
  });

  // Request 2 (Key sama, tapi jumlah berbeda)
  await assert.rejects(
    async () => {
      await catatTransaksi({
        santriId,
        unit: "Kantin",
        jenis: "Tarik Tunai",
        kategori: "Jajan Harian",
        jumlah: 20000,
        idempotencyKey,
      });
    },
    (err) => {
      assert.equal(err.statusCode || err.status, 409);
      assert.match(err.message, /Payload mismatch|idempotency/i);
      return true;
    }
  );

  // Clean up
  await query('DELETE FROM "TransaksiCashlessIdempotency" WHERE "idempotencyKey" = $1', [idempotencyKey]);
  await query('DELETE FROM "TransaksiCashless" WHERE "santriId" = $1', [santriId]);
  await query('DELETE FROM "Ledger" WHERE "santriId" = $1', [santriId]);
  await query('DELETE FROM "Santri" WHERE "id" = $1', [santriId]);
});

test("LEDGER & IDEMPOTENCY: 20 debit paralel @10.000 pada saldo 100.000 (10 sukses, 10 ditolak, saldo 0) diulang 5 putaran", async () => {
  for (let round = 1; round <= 5; round++) {
    const santriId = `test_paralel_r${round}_${crypto.randomUUID()}`;
    await query('INSERT INTO "Santri" ("id", "nama", "saldo") VALUES ($1, $2, 100000)', [santriId, `Santri Paralel R${round}`]);

    // Inisialisasi awal ledger jika belum
    await query(
      `INSERT INTO "Ledger" ("id", "santriId", "jenis", "jumlah", "saldoSetelah", "referensi", "pelaku", "waktu")
       VALUES ($1, $2, 'Saldo Awal', 100000, 100000, 'Test Setup', 'test', $3)`,
      [crypto.randomUUID(), santriId, new Date().toISOString()]
    );

    // Kirim 20 request debit paralel
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(
        catatTransaksi({
          santriId,
          unit: "Kantin",
          jenis: "Tarik Tunai",
          kategori: "Jajan Harian",
          jumlah: 10000,
          idempotencyKey: crypto.randomUUID(),
        })
      );
    }

    const results = await Promise.allSettled(promises);
    const successList = results.filter((r) => r.status === "fulfilled" && r.value?.transaksi);
    const failureList = results.filter((r) => r.status === "rejected" || r.value?.error);

    assert.equal(successList.length, 10, `Putaran ${round}: Tepat 10 transaksi harus sukses`);
    assert.equal(failureList.length, 10, `Putaran ${round}: Tepat 10 transaksi harus ditolak karena saldo tidak cukup`);

    const santriDb = await queryOne('SELECT "saldo" FROM "Santri" WHERE "id" = $1', [santriId]);
    assert.equal(Number(santriDb.saldo), 0, `Putaran ${round}: Saldo akhir harus tepat 0`);

    // Verifikasi saldo di ledger
    const ledgerSum = await queryOne('SELECT COALESCE(SUM("jumlah"), 0) AS "total" FROM "Ledger" WHERE "santriId" = $1', [santriId]);
    assert.equal(Number(ledgerSum.total), 0, `Putaran ${round}: Total sum ledger harus 0`);

    // Clean up
    await query('DELETE FROM "TransaksiCashless" WHERE "santriId" = $1', [santriId]);
    await query('DELETE FROM "Ledger" WHERE "santriId" = $1', [santriId]);
    await query('DELETE FROM "Santri" WHERE "id" = $1', [santriId]);
  }
});

test("LEDGER & IDEMPOTENCY: Simulasi error / koneksi putus di tengah transaksi (Rollback Atomik)", async () => {
  const santriId = `test_rollback_${crypto.randomUUID()}`;
  await query('INSERT INTO "Santri" ("id", "nama", "saldo") VALUES ($1, \'Santri Rollback\', 50000)', [santriId]);

  // Coba eksekusi transaksi yang disimulasikan gagal di tengah alur
  await assert.rejects(
    async () => {
      await withTransaction(async () => {
        // Step 1: Potong saldo
        await query('UPDATE "Santri" SET "saldo" = "saldo" - 20000 WHERE "id" = $1', [santriId]);
        // Step 2: Insert ledger
        await query(
          `INSERT INTO "Ledger" ("id", "santriId", "jenis", "jumlah", "saldoSetelah", "referensi", "pelaku", "waktu")
           VALUES ($1, $2, 'Tarik Tunai', -20000, 30000, 'Tx Failure Sim', 'test', $3)`,
          [crypto.randomUUID(), santriId, new Date().toISOString()]
        );
        // Step 3: Simulasi error koneksi putus
        throw new Error("SIMULATED_NETWORK_FAILURE");
      });
    },
    /SIMULATED_NETWORK_FAILURE/
  );

  // Pastikan saldo kembali utuh (50000) dan tidak ada entri ledger yatim
  const santriDb = await queryOne('SELECT "saldo" FROM "Santri" WHERE "id" = $1', [santriId]);
  assert.equal(Number(santriDb.saldo), 50000);

  const ledgerEntries = await queryOne('SELECT COUNT(*) AS "n" FROM "Ledger" WHERE "santriId" = $1', [santriId]);
  assert.equal(Number(ledgerEntries.n), 0);

  // Clean up
  await query('DELETE FROM "Santri" WHERE "id" = $1', [santriId]);
});

test("LEDGER & IDEMPOTENCY: Koreksi saldo melalui entri pembalik & audit rekonsiliasi", async () => {
  const santriId = `test_koreksi_${crypto.randomUUID()}`;
  await query('INSERT INTO "Santri" ("id", "nama", "saldo") VALUES ($1, \'Santri Koreksi\', 100000)', [santriId]);
  await query(
    `INSERT INTO "Ledger" ("id", "santriId", "jenis", "jumlah", "saldoSetelah", "referensi", "pelaku", "waktu")
     VALUES ($1, $2, 'Saldo Awal', 100000, 100000, 'Inisialisasi', 'sistem', $3)`,
    [crypto.randomUUID(), santriId, new Date().toISOString()]
  );

  // Lakukan koreksi pengurangan (-30000)
  const kor1 = await koreksiSaldo({
    santriId,
    jumlah: -30000,
    alasan: "Salah input transaksi kasir",
    dikoreksiOleh: "Petugas BMT",
  });
  assert.equal(kor1.saldoSetelah, 70000);

  // Lakukan koreksi penambahan (+15000)
  const kor2 = await koreksiSaldo({
    santriId,
    jumlah: 15000,
    alasan: "Pengembalian dana sisa",
    dikoreksiOleh: "Petugas BMT",
  });
  assert.equal(kor2.saldoSetelah, 85000);

  // Verifikasi saldo di DB
  const santriDb = await queryOne('SELECT "saldo" FROM "Santri" WHERE "id" = $1', [santriId]);
  assert.equal(Number(santriDb.saldo), 85000);

  // Jalankan audit saldo
  const audit = await auditSaldo();
  const santriMismatched = audit.tidakCocok.find((s) => s.id === santriId);
  assert.equal(santriMismatched, undefined, "Santri tidak boleh ada di daftar tidakCocok audit saldo");

  // Clean up
  await query('DELETE FROM "TransaksiCashless" WHERE "santriId" = $1', [santriId]);
  await query('DELETE FROM "Ledger" WHERE "santriId" = $1', [santriId]);
  await query('DELETE FROM "Santri" WHERE "id" = $1', [santriId]);
});
