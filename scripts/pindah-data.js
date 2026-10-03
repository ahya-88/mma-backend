require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { Pool } = require("pg");

const TABLES = [
  "Wali", "Guru", "UnitUsaha", "TahunAjaran", "Pengaturan", "AdminConfig", "Santri",
  "PengajuanAnggaran", "ProdukUnitUsaha", "FaceTemplate", "LogWajah",
  "TransaksiCashless", "TransaksiCashlessIdempotency", "LogPin", "PermintaanBMT", "Absensi", "Perizinan",
  "Pelanggaran", "Nilai", "Prestasi", "Hafalan", "PenilaianUbudiyah",
  "Tagihan", "Cashflow", "RincianAnggaran",
];
const BATCH_SIZE = 500;
const reset = process.argv.includes("--reset");
const sqlitePath = process.env.SQLITE_PATH;
const databaseUrl = process.env.DATABASE_URL;

if (!sqlitePath) throw new Error("SQLITE_PATH wajib menunjuk ke berkas database SQLite.");
if (!databaseUrl) throw new Error("DATABASE_URL wajib menunjuk ke database PostgreSQL.");

const sourcePath = path.resolve(sqlitePath);
const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
const host = new URL(databaseUrl).hostname;
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(host);
const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

const quoteIdentifier = (identifier) => `"${identifier.replace(/"/g, '""')}"`;
const sourceTables = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));

async function countPostgres(table) {
  const result = await pool.query(`SELECT COUNT(*) AS "count" FROM ${quoteIdentifier(table)}`);
  return Number(result.rows[0].count);
}

async function transferTable(table) {
  if (!sourceTables.has(table)) {
    const postgresCount = await countPostgres(table);
    return { table, sourceCount: 0, postgresCount, result: postgresCount === 0 ? "OK" : "BEDA" };
  }
  const quotedTable = quoteIdentifier(table);
  const columns = source.prepare(`PRAGMA table_info(${quotedTable})`).all().map((column) => column.name);
  const sourceCount = source.prepare(`SELECT COUNT(*) AS count FROM ${quotedTable}`).get().count;
  let offset = 0;
  while (offset < sourceCount) {
    const rows = source.prepare(`SELECT * FROM ${quotedTable} LIMIT ? OFFSET ?`).all(BATCH_SIZE, offset);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await insertBatchOnClient(client, table, columns, rows);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    offset += rows.length;
  }
  const postgresCount = await countPostgres(table);
  return { table, sourceCount, postgresCount, result: sourceCount === postgresCount ? "OK" : "BEDA" };
}

async function insertBatchOnClient(client, table, columns, rows) {
  if (!rows.length) return;
  const quotedColumns = columns.map(quoteIdentifier).join(", ");
  const values = [];
  const tuples = rows.map((row, rowIndex) => {
    const placeholders = columns.map((column, columnIndex) => {
      values.push(row[column]);
      return `$${rowIndex * columns.length + columnIndex + 1}`;
    });
    return `(${placeholders.join(", ")})`;
  });
  await client.query(`INSERT INTO ${quoteIdentifier(table)} (${quotedColumns}) VALUES ${tuples.join(", ")}`, values);
}

async function readSaldoPostgres() {
  const result = await pool.query('SELECT COALESCE(SUM("saldo"), 0) AS "total" FROM "Santri"');
  return Number(result.rows[0].total);
}

async function main() {
  await pool.query(fs.readFileSync(path.join(__dirname, "..", "src", "schema.pg.sql"), "utf8"));
  if (reset) {
    await pool.query(`TRUNCATE TABLE ${[...TABLES].reverse().map(quoteIdentifier).join(", ")} RESTART IDENTITY CASCADE`);
  }

  const results = [];
  for (const table of TABLES) results.push(await transferTable(table));

  const saldoSqlite = Number(source.prepare('SELECT COALESCE(SUM("saldo"), 0) AS total FROM "Santri"').get().total);
  const saldoPostgres = await readSaldoPostgres();
  const mismatch = results.some((row) => row.result !== "OK") || saldoSqlite !== saldoPostgres;
  console.table(results.map(({ table, sourceCount, postgresCount, result }) => ({
    tabel: table, "baris SQLite": sourceCount, "baris Postgres": postgresCount, hasil: result,
  })));
  console.log(`Total saldo Santri | SQLite: ${saldoSqlite} | Postgres: ${saldoPostgres} | ${saldoSqlite === saldoPostgres ? "OK" : "BEDA"}`);

  for (const table of ["FaceTemplate", "LogWajah", "LogPin"]) {
    const quotedTable = quoteIdentifier(table);
    await pool.query(`SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE(MAX("id"), 1), MAX("id") IS NOT NULL) FROM ${quotedTable}`, [quotedTable]);
  }
  if (mismatch) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("Pemindahan data gagal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    source.close();
    await pool.end();
  });
