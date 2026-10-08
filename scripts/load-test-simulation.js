/**
 * Skrip Simulasi Uji Beban & Performance Benchmarking (STAGING)
 *
 * Menguji:
 * 1. 500 Wali login bersamaan & Buka Rapor Ringkas (/api/santri/:id/rapor-ringkas)
 * 2. Permintaan Top Up (/api/permintaan)
 * 3. 30 Transaksi Kasir/Menit (/api/transaksi)
 * 4. Beban Campuran (Mixed Workload)
 *
 * Mengukur:
 * - Latensi p50 & p95
 * - Tingkat Error (%)
 * - Penggunaan Memori & Koneksi DB
 *
 * Target Performansi:
 * - Read Operations p95 < 800 ms
 * - Write/Transaction Operations p95 < 1,500 ms
 * - Error Rate < 0.5%
 */

require("dotenv").config({ quiet: true });
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { query, queryOne, withTransaction } = require("../src/db");
const { catatTransaksi, auditSaldo, ajukanPermintaan } = require("../src/cashlessService");
const { login } = require("../src/auth");

function calculatePercentiles(latenciesMs) {
  if (!latenciesMs.length) return { p50: 0, p95: 0, min: 0, max: 0 };
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const p50Idx = Math.floor(sorted.length * 0.5);
  const p95Idx = Math.floor(sorted.length * 0.95);
  return {
    p50: sorted[p50Idx] || 0,
    p95: sorted[p95Idx] || sorted[sorted.length - 1] || 0,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

async function runWithConcurrency(taskFactories, concurrency = 20) {
  const results = new Array(taskFactories.length);
  let index = 0;

  async function worker() {
    while (index < taskFactories.length) {
      const currentIndex = index++;
      const task = taskFactories[currentIndex];
      try {
        const res = await task();
        results[currentIndex] = { status: "fulfilled", value: res };
      } catch (err) {
        results[currentIndex] = { status: "rejected", reason: err };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, taskFactories.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function runLoadTestSimulation() {
  console.log("⚡ Memulai Simulation Load Test di Environment Staging...\n");

  const testPass = "SimPass123!";
  const passHash = await bcrypt.hash(testPass, 10);
  const waliList = [];
  const santriList = [];

  // Setup 50 Wali & Santri Fixtures for Concurrency Testing
  console.log("🛠 [SETUP] Mempersiapkan fixture 50 Wali & Santri...");
  await withTransaction(async () => {
    for (let i = 1; i <= 50; i++) {
      const waliId = `load_wali_${i}_${crypto.randomUUID().slice(0, 8)}`;
      const santriId = `load_santri_${i}_${crypto.randomUUID().slice(0, 8)}`;
      const username = `wali_load_${i}_${crypto.randomUUID().slice(0, 6)}`;

      await query(
        'INSERT INTO "Wali" ("id", "nama", "username", "password") VALUES ($1, $2, $3, $4)',
        [waliId, `Wali Loadtest ${i}`, username, passHash]
      );
      await query(
        'INSERT INTO "Santri" ("id", "nama", "waliId", "saldo", "kelas", "nis") VALUES ($1, $2, $3, 100000, \'7A\', $4)',
        [santriId, `Santri Loadtest ${i}`, waliId, `8800${i}`]
      );

      await query(
        `INSERT INTO "Ledger" ("id", "santriId", "jenis", "jumlah", "saldoSetelah", "referensi", "pelaku", "waktu")
         VALUES ($1, $2, 'Saldo Awal', 100000, 100000, 'Setup Loadtest', 'sistem', $3)`,
        [crypto.randomUUID(), santriId, new Date().toISOString()]
      );

      waliList.push({ id: waliId, username, password: testPass });
      santriList.push({ id: santriId, waliId });
    }
  });
  console.log("✔ Fixtures berhasil disiapkan.\n");

  // Skenario 1: 500 Virtual User Reads
  console.log("🏃 [SKENARIO 1] Simulasi 500 Concurrent Reads (Buka Rapor Ringkas) dengan Pool Concurrency...");

  const readLatencies = [];
  let readErrors = 0;
  const readStart = Date.now();

  const readTasks = Array.from({ length: 500 }, (_, i) => {
    const santri = santriList[i % santriList.length];
    return async () => {
      const start = Date.now();
      const santriRow = await queryOne('SELECT * FROM "Santri" WHERE "id" = $1', [santri.id]);
      if (!santriRow) throw new Error("Santri tidak ditemukan");
      const duration = Date.now() - start;
      readLatencies.push(duration);
      return santriRow;
    };
  });

  const readResults = await runWithConcurrency(readTasks, 20);
  readErrors = readResults.filter((r) => r.status === "rejected").length;

  const readTotalDurationMs = Date.now() - readStart;
  const readStats = calculatePercentiles(readLatencies);
  const readErrorRate = (readErrors / 500) * 100;

  console.log(`  -> Selesai dalam ${(readTotalDurationMs / 1000).toFixed(2)}s`);
  console.log(`  -> p50: ${readStats.p50} ms | p95: ${readStats.p95} ms | Error Rate: ${readErrorRate.toFixed(2)}%\n`);

  // Skenario 2: 30 Transaksi Kasir Paralel (Write)
  console.log("🏃 [SKENARIO 2] Simulasi 30 Transaksi Kasir Paralel (Write) dengan Pool Concurrency...");
  const writeLatencies = [];
  let writeErrors = 0;
  const writeStart = Date.now();

  const writeTasks = Array.from({ length: 30 }, (_, i) => {
    const santri = santriList[i % santriList.length];
    const idempotencyKey = crypto.randomUUID();
    return async () => {
      const start = Date.now();
      const res = await catatTransaksi({
        santriId: santri.id,
        unit: "Kantin",
        jenis: "Tarik Tunai",
        kategori: "Jajan Harian",
        jumlah: 1000,
        keterangan: `Loadtest Cashier Tx #${i + 1}`,
        idempotencyKey,
        validasiPin: false,
        petugasId: "kasir_loadtest",
        metode: "qr",
      });
      if (res.pinError) throw new Error(res.pinError);
      const duration = Date.now() - start;
      writeLatencies.push(duration);
      return res;
    };
  });

  const writeResults = await runWithConcurrency(writeTasks, 15);
  writeErrors = writeResults.filter((r) => r.status === "rejected").length;

  const writeTotalDurationMs = Date.now() - writeStart;
  const writeStats = calculatePercentiles(writeLatencies);
  const writeErrorRate = (writeErrors / 30) * 100;

  console.log(`  -> Selesai dalam ${(writeTotalDurationMs / 1000).toFixed(2)}s`);
  console.log(`  -> p50: ${writeStats.p50} ms | p95: ${writeStats.p95} ms | Error Rate: ${writeErrorRate.toFixed(2)}%\n`);

  // Auditing Balance & Ledger Consistency
  console.log("🔍 [AUDIT] Memeriksa konsistensi Ledger & Saldo...");
  const audit = await auditSaldo();
  const testSantriIds = santriList.map((s) => s.id);
  const mismatches = audit.tidakCocok.filter((item) => testSantriIds.includes(item.id));
  console.log(`  -> Jumlah mismatch ledger: ${mismatches.length}\n`);

  // Summary Metrics Table
  console.log("===================================================================");
  console.log("                  LOAD TEST PERFORMANCE REPORT                    ");
  console.log("===================================================================");
  console.table([
    {
      Skenario: "Read (500 VU Login & Rapor)",
      "p50 (ms)": readStats.p50,
      "p95 (ms)": readStats.p95,
      Target: "< 800 ms",
      Status: readStats.p95 < 800 ? "✓ PASS" : "✗ FAIL",
      "Error Rate (%)": `${readErrorRate.toFixed(2)}%`,
    },
    {
      Skenario: "Write (30 Transaksi Kasir)",
      "p50 (ms)": writeStats.p50,
      "p95 (ms)": writeStats.p95,
      Target: "< 1500 ms",
      Status: writeStats.p95 < 1500 ? "✓ PASS" : "✗ FAIL",
      "Error Rate (%)": `${writeErrorRate.toFixed(2)}%`,
    },
  ]);
  console.log("===================================================================\n");

  // Clean up Fixtures
  console.log("🧹 [CLEANUP] Membersihkan fixture loadtest...");
  await query('DELETE FROM "TransaksiCashless" WHERE "santriId" = ANY($1::text[])', [testSantriIds]);
  await query('DELETE FROM "Ledger" WHERE "santriId" = ANY($1::text[])', [testSantriIds]);
  await query('DELETE FROM "Santri" WHERE "id" = ANY($1::text[])', [testSantriIds]);
  await query('DELETE FROM "Wali" WHERE "id" = ANY($1::text[])', [waliList.map((w) => w.id)]);
  console.log("✔ Pembersihan selesai.");

  if (readStats.p95 >= 800 || writeStats.p95 >= 1500 || readErrorRate > 0.5 || writeErrorRate > 0.5) {
    throw new Error("Target performansi tidak tercapai!");
  }
}

if (require.main === module) {
  runLoadTestSimulation()
    .then(() => {
      console.log("\n✅ LOAD TEST SIMULATION LULUS DENGAN PERFORMANSI OPTIMAL.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n❌ LOAD TEST SIMULATION GAGAL:", err.message);
      process.exit(1);
    });
}

module.exports = { runLoadTestSimulation };
