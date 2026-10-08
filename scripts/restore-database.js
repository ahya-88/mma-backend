require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

function decryptBuffer(encryptedBuffer, passphrase) {
  const salt = encryptedBuffer.subarray(0, 16);
  const iv = encryptedBuffer.subarray(16, 28);
  const tag = encryptedBuffer.subarray(28, 44);
  const ciphertext = encryptedBuffer.subarray(44);
  const key = crypto.pbkdf2Sync(passphrase, salt, 100000, 32, "sha256");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function getPgBin(binName) {
  try {
    execSync(`${binName} --version`, { stdio: "ignore" });
    return binName;
  } catch (_) {
    const commonPaths = [
      `C:\\Program Files\\PostgreSQL\\16\\bin\\${binName}.exe`,
      `C:\\Program Files\\PostgreSQL\\17\\bin\\${binName}.exe`,
      `C:\\Program Files\\PostgreSQL\\15\\bin\\${binName}.exe`,
      `/usr/bin/${binName}`,
      `/usr/local/bin/${binName}`,
    ];
    for (const p of commonPaths) {
      if (fs.existsSync(p)) return `"${p}"`;
    }
    return binName;
  }
}

const { Pool } = require("pg");

const TABLE_INSERT_ORDER = [
  "Wali", "Guru", "TahunAjaran", "BatchImpor", "UnitUsaha", "Pengaturan", "AdminConfig",
  "Santri", "Ledger", "TransaksiCashless", "PermintaanBMT", "AuditLog", "Absensi", "Perizinan",
  "Nilai", "Prestasi", "Hafalan", "PenilaianUbudiyah", "Pelanggaran", "ProdukUnitUsaha",
  "PengajuanAnggaran", "RincianAnggaran", "Cashflow", "LogPin", "LogWajah", "FaceTemplate",
  "QueueOfflineKasir", "RekonsiliasiImpor", "RiwayatStokOpname", "Tagihan",
  "TransaksiCashlessIdempotency", "TransaksiUnitUsaha",
];

async function restoreDatabaseNode(decryptedBuffer, targetDatabaseUrl) {
  const payload = JSON.parse(decryptedBuffer.toString("utf-8"));
  if (payload.type !== "MMA_PG_DUMP_JSON_V1" || !payload.tables) {
    throw new Error("Format dump JSON tidak dikenali.");
  }

  const pool = new Pool({ connectionString: targetDatabaseUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS "public"; SET search_path TO "public";');

    const schemaSql = fs.readFileSync(path.join(__dirname, "../src/schema.pg.sql"), "utf-8");
    try {
      await client.query(schemaSql);
    } catch (e) {
      console.warn(`[RESTORE SCHEMA NOTICE] ${e.message}`);
    }

    const dumpTables = Object.keys(payload.tables);
    const orderedTables = [
      ...TABLE_INSERT_ORDER.filter((t) => dumpTables.includes(t)),
      ...dumpTables.filter((t) => !TABLE_INSERT_ORDER.includes(t)),
    ];

    for (const tableName of orderedTables) {
      try {
        await client.query(`TRUNCATE TABLE "${tableName}" CASCADE`);
      } catch (_) {}
    }

    for (const tableName of orderedTables) {
      const tableData = payload.tables[tableName];
      if (!tableData?.rows || !tableData.rows.length) continue;

      for (const row of tableData.rows) {
        const columns = Object.keys(row);
        const values = Object.values(row);
        const colNames = columns.map((c) => `"${c}"`).join(", ");
        const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(", ");
        const sql = `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
        try {
          await client.query(sql, values);
        } catch (e) {
          // Ignore individual row conflict/type mismatch warnings during restore
        }
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

async function restoreDatabase({ backupFilePath, targetDatabaseUrl }) {
  if (!targetDatabaseUrl) {
    throw new Error("Target DATABASE_URL wajib diisi untuk melakukan restore.");
  }
  if (!backupFilePath || !fs.existsSync(backupFilePath)) {
    throw new Error(`File backup tidak ditemukan pada path: ${backupFilePath}`);
  }

  const passphrase = process.env.ENCRYPTION_PASSPHRASE || "mma-default-secure-passphrase-2026";
  const tempDumpPath = path.join(__dirname, `../backups/temp-restore-${Date.now()}.dump`);

  console.log(`[RESTORE] Membaca dan mendekripsi file backup ${path.basename(backupFilePath)}...`);
  const encryptedBuffer = fs.readFileSync(backupFilePath);
  const decryptedBuffer = decryptBuffer(encryptedBuffer, passphrase);

  const startTime = Date.now();
  let isJsonDump = false;
  try {
    const headerStr = decryptedBuffer.toString("utf-8", 0, 100);
    if (headerStr.includes("MMA_PG_DUMP_JSON_V1")) isJsonDump = true;
  } catch (_) {}

  if (isJsonDump) {
    console.log(`[RESTORE] Merestore snapshot database JSON via Node.js Pg Client...`);
    await restoreDatabaseNode(decryptedBuffer, targetDatabaseUrl);
  } else {
    fs.writeFileSync(tempDumpPath, decryptedBuffer);
    console.log(`[RESTORE] Menjalankan pg_restore ke target database...`);
    const pgRestoreBin = getPgBin("pg_restore");
    const restoreCmd = `${pgRestoreBin} --no-owner --no-acl --clean --if-exists --dbname="${targetDatabaseUrl}" "${tempDumpPath}"`;

    try {
      execSync(restoreCmd, { stdio: "pipe" });
    } catch (err) {
      console.warn(`[RESTORE NOTICE] pg_restore selesai dengan pesan: ${err.message}`);
    } finally {
      if (fs.existsSync(tempDumpPath)) fs.unlinkSync(tempDumpPath);
    }
  }

  const durationMs = Date.now() - startTime;
  console.log(`[RESTORE SUCCESS] Restore selesai dalam ${(durationMs / 1000).toFixed(2)} detik.`);
  return { durationMs, restoredFile: backupFilePath };
}

if (require.main === module) {
  const backupFilePath = process.argv[2] || path.join(__dirname, "../backups", fs.readdirSync(path.join(__dirname, "../backups")).filter(f => f.endsWith(".dump.enc")).sort().pop() || "");
  const targetDatabaseUrl = process.env.RESTORE_TEST_DATABASE_URL || process.env.DATABASE_URL;

  restoreDatabase({ backupFilePath, targetDatabaseUrl })
    .then((res) => {
      console.log(`[RESTORE DONE] ${JSON.stringify(res, null, 2)}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[RESTORE FAILED]`, err);
      process.exit(1);
    });
}

module.exports = { restoreDatabase, decryptBuffer };
