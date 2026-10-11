require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { query, withTransaction, pool } = require("../src/db");

async function bersihkanTransaksiUnit() {
  console.log("=== MEMULAI PEMBERSIHAN DATA TRANSAKSI UNIT USAHA ===");

  // 1. Backup snapshot
  const backupDir = path.join(__dirname, "..", "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const rows = (await query('SELECT * FROM "TransaksiUnitUsaha"')).rows;
  console.log(`1. Mencadangkan ${rows.length} baris TransaksiUnitUsaha...`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(backupDir, `backup_transaksi_unit_${timestamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(rows, null, 2), "utf8");
  console.log(`-> Berkas cadangan tersimpan di: ${backupFile}`);

  // 2. Eksekusi pembersihan
  console.log("2. Menghapus transaksi unit usaha dari PostgreSQL...");
  await withTransaction(async (client) => {
    await client.query('DELETE FROM "TransaksiUnitUsaha"');
    await client.query('DELETE FROM "Cashflow"');
  });

  // 3. Verifikasi
  const cUnit = await query('SELECT COUNT(*) AS c FROM "TransaksiUnitUsaha"');
  const cCashflow = await query('SELECT COUNT(*) AS c FROM "Cashflow"');
  console.log(`3. Hasil verifikasi -> TransaksiUnitUsaha: ${cUnit.rows[0].c} baris, Cashflow: ${cCashflow.rows[0].c} baris`);
  console.log("=== PEMBERSIHAN SELESAI DENGAN SUKSES ===");
}

if (require.main === module) {
  bersihkanTransaksiUnit()
    .catch((err) => {
      console.error("Gagal membersihkan transaksi unit:", err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { bersihkanTransaksiUnit };
