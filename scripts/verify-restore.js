require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { runBackup } = require("./backup-s3");
const { restoreDatabase } = require("./restore-database");

const TABLES_TO_VERIFY = [
  "Santri", "Wali", "Guru", "Ledger", "TransaksiCashless",
  "PermintaanBMT", "AuditLog", "Absensi", "Perizinan", "TahunAjaran",
];

async function countTableRows(pool, tableName) {
  try {
    const res = await pool.query(`SELECT COUNT(*) AS "total" FROM "${tableName}"`);
    return Number(res.rows[0]?.total || 0);
  } catch (err) {
    return 0; // Return 0 if table does not exist yet
  }
}

async function getFinancialSum(pool, tableName, columnName) {
  try {
    const res = await pool.query(`SELECT COALESCE(SUM("${columnName}"), 0) AS "sum" FROM "${tableName}"`);
    return Number(res.rows[0]?.sum || 0);
  } catch (err) {
    return 0;
  }
}

async function verifyRestore() {
  const prodDbUrl = process.env.DATABASE_URL_PROD || process.env.RAILWAY_PUBLIC_URL || process.env.DATABASE_URL;
  const testDbUrl = process.env.RESTORE_TEST_DATABASE_URL || process.env.TOPUP_TEST_DATABASE_URL || (prodDbUrl !== process.env.DATABASE_URL ? process.env.DATABASE_URL : process.env.NEON_DIRECT_URL);

  if (!prodDbUrl) {
    throw new Error("DATABASE_URL produksi wajib diisi.");
  }
  if (!testDbUrl) {
    throw new Error("RESTORE_TEST_DATABASE_URL wajib diisi (gunakan database sementara/staging terisolasi).");
  }
  if (prodDbUrl === testDbUrl) {
    throw new Error("PROHIBITION: RESTORE_TEST_DATABASE_URL tidak boleh sama dengan DATABASE_URL produksi!");
  }

  const startTime = Date.now();
  console.log(`[VERIFY DRILL] Starting restore verification drill at ${new Date().toISOString()}...`);

  // Ensure backup dump file exists
  const backupDir = path.join(__dirname, "../backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  let backupFiles = fs.readdirSync(backupDir).filter((f) => f.endsWith(".dump.enc")).sort();

  if (backupFiles.length === 0) {
    console.log(`[VERIFY DRILL] No existing backup dump found. Generating a fresh encrypted dump...`);
    await runBackup(prodDbUrl);
    backupFiles = fs.readdirSync(backupDir).filter((f) => f.endsWith(".dump.enc")).sort();
  }

  const latestBackupFile = path.join(backupDir, backupFiles[backupFiles.length - 1]);
  const dumpStats = fs.statSync(latestBackupFile);
  console.log(`[VERIFY DRILL] Using backup file: ${path.basename(latestBackupFile)} (${(dumpStats.size / 1024).toFixed(2)} KB)`);

  // Step 1: Restore to temporary test database
  const restoreStart = Date.now();
  console.log(`[VERIFY DRILL] Restoring backup dump to temporary database...`);
  await restoreDatabase({ backupFilePath: latestBackupFile, targetDatabaseUrl: testDbUrl });
  const restoreDurationMs = Date.now() - restoreStart;

  // Step 2: Connect to both databases and verify row counts & totals
  const prodPool = new Pool({ connectionString: prodDbUrl, ssl: { rejectUnauthorized: false } });
  const testPool = new Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false } });

  let isMatch = true;
  const report = [];

  try {
    // Health check on restored DB
    const healthCheck = await testPool.query("SELECT 1 AS ok");
    const healthOk = healthCheck.rows[0]?.ok === 1;
    console.log(`[VERIFY DRILL] Restored DB Health Check: ${healthOk ? "OK" : "FAILED"}`);

    for (const table of TABLES_TO_VERIFY) {
      const prodCount = await countTableRows(prodPool, table);
      const testCount = await countTableRows(testPool, table);

      const tableMatched = prodCount === testCount;
      if (!tableMatched) isMatch = false;

      report.push({
        table,
        prodCount,
        restoredCount: testCount,
        match: tableMatched ? "✓ PASS" : "✗ MISMATCH",
      });
    }

    // Financial sum verification
    const prodSaldoSum = await getFinancialSum(prodPool, "Santri", "saldo");
    const testSaldoSum = await getFinancialSum(testPool, "Santri", "saldo");
    const prodLedgerSum = await getFinancialSum(prodPool, "Ledger", "jumlah");
    const testLedgerSum = await getFinancialSum(testPool, "Ledger", "jumlah");

    const saldoMatch = prodSaldoSum === testSaldoSum;
    const ledgerMatch = prodLedgerSum === testLedgerSum;

    if (!saldoMatch || !ledgerMatch) isMatch = false;

    const totalDurationMs = Date.now() - startTime;
    const durationMinutes = (totalDurationMs / 60000).toFixed(2);

    console.log("\n=======================================================");
    console.log("             VERIFICATION DRILL REPORT                 ");
    console.log("=======================================================");
    console.table(report);
    console.log("-------------------------------------------------------");
    console.log(`Total Saldo Santri : Prod=Rp ${prodSaldoSum.toLocaleString("id-ID")} | Restored=Rp ${testSaldoSum.toLocaleString("id-ID")} [${saldoMatch ? "MATCH" : "MISMATCH"}]`);
    console.log(`Total Ledger Jumlah: Prod=Rp ${prodLedgerSum.toLocaleString("id-ID")} | Restored=Rp ${testLedgerSum.toLocaleString("id-ID")} [${ledgerMatch ? "MATCH" : "MISMATCH"}]`);
    console.log(`Ukuran Backup Dump : ${(dumpStats.size / 1024).toFixed(2)} KB`);
    console.log(`Durasi Restore     : ${(restoreDurationMs / 1000).toFixed(2)} detik`);
    console.log(`Durasi Total Drill : ${durationMinutes} menit (Target < 60 menit)`);
    console.log(`Hasil Verifikasi   : ${isMatch ? "✓ ALL VERIFICATIONS PASSED" : "✗ VERIFICATION FAILED"}`);
    console.log("=======================================================\n");

    if (!isMatch) {
      throw new Error("Verifikasi restore gagal: Terdapat ketidakcocokan jumlah baris atau saldo!");
    }

    return {
      success: true,
      dumpSizeKb: (dumpStats.size / 1024).toFixed(2),
      restoreDurationSec: (restoreDurationMs / 1000).toFixed(2),
      totalDurationMinutes: durationMinutes,
      prodSaldoSum,
      testSaldoSum,
      report,
    };
  } finally {
    await prodPool.end();
    await testPool.end();
  }
}

if (require.main === module) {
  verifyRestore()
    .then((res) => {
      console.log(`[VERIFY SUCCESS] ${JSON.stringify(res, null, 2)}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[VERIFY FAILED]`, err.message);
      process.exit(1);
    });
}

module.exports = { verifyRestore };
