require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { query, withTransaction, pool } = require("../src/db");

async function backupDanBersihkan() {
  console.log("=== MEMULAI PROSES PEMBERSIHAN DATA MMA ===");

  // 1. Ambil data saat ini untuk backup darurat
  console.log("1. Mengambil data saat ini untuk cadangan (snapshot backup)...");
  const backupDir = path.join(__dirname, "..", "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const snapshotTables = [
    "Santri",
    "Wali",
    "TransaksiCashless",
    "TransaksiCashlessIdempotency",
    "Ledger",
    "PermintaanBMT",
    "QueueOfflineKasir",
    "LogPin",
    "FaceTemplate",
    "LogWajah",
    "Absensi",
    "Perizinan",
    "Pelanggaran",
    "Nilai",
    "Prestasi",
    "Hafalan",
    "PenilaianUbudiyah",
    "PenilaianKegiatan",
    "Tagihan",
    "PendaftaranUlang",
    "RaportAkademik",
    "RaportMental",
    "RaportTahfidz",
    "BatchImpor",
    "RekonsiliasiImpor",
    "TransaksiUnitUsaha",
    "Cashflow"
  ];

  const backupData = {};
  for (const table of snapshotTables) {
    try {
      const rows = (await query(`SELECT * FROM "${table}"`)).rows;
      backupData[table] = rows;
      console.log(`   - ${table}: ${rows.length} baris dicadangkan`);
    } catch (e) {
      console.log(`   - ${table}: lewati (${e.message})`);
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(backupDir, `backup_sebelum_wipe_${timestamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), "utf8");
  console.log(`-> Berkas cadangan berhasil disimpan di: ${backupFile}`);

  // 2. Eksekusi pembersihan dalam transaksi tunggal PostgreSQL yang aman
  console.log("2. Menjalankan transaksi pembersihan di PostgreSQL...");
  await withTransaction(async (client) => {
    // A. Antrean & Transaksi Cashless serta Keuangan Unit
    await client.query('DELETE FROM "QueueOfflineKasir"');
    await client.query('DELETE FROM "TransaksiCashless"');
    await client.query('DELETE FROM "TransaksiCashlessIdempotency"');
    await client.query('DELETE FROM "TransaksiUnitUsaha"');
    await client.query('DELETE FROM "Cashflow"');
    await client.query('DELETE FROM "Ledger"');
    await client.query('DELETE FROM "LogPin"');
    await client.query('DELETE FROM "PermintaanBMT"');

    // B. Aktivitas Santri & Nilai / Raport
    await client.query('DELETE FROM "Absensi"');
    await client.query('DELETE FROM "Perizinan"');
    await client.query('DELETE FROM "Pelanggaran"');
    await client.query('DELETE FROM "Nilai"');
    await client.query('DELETE FROM "Prestasi"');
    await client.query('DELETE FROM "Hafalan"');
    await client.query('DELETE FROM "PenilaianUbudiyah"');
    await client.query('DELETE FROM "PenilaianKegiatan"');
    await client.query('DELETE FROM "Tagihan"');
    await client.query('DELETE FROM "PendaftaranUlang"');
    await client.query('DELETE FROM "RaportAkademik"');
    await client.query('DELETE FROM "RaportMental"');
    await client.query('DELETE FROM "RaportTahfidz"');

    // C. Biometrik & Log
    await client.query('DELETE FROM "LogWajah"');
    await client.query('DELETE FROM "FaceTemplate"');

    // D. Batch Impor Lama
    await client.query('DELETE FROM "RekonsiliasiImpor"');
    await client.query('DELETE FROM "BatchImpor"');

    // E. Data Utama Santri & Wali
    await client.query('DELETE FROM "Santri"');
    await client.query('DELETE FROM "Wali"');
  });

  console.log("3. Memverifikasi status tabel setelah pembersihan...");
  const cekTables = [
    "Santri",
    "Wali",
    "TransaksiCashless",
    "TransaksiCashlessIdempotency",
    "Ledger",
    "PermintaanBMT",
    "QueueOfflineKasir",
    "Guru",
    "UnitUsaha",
    "MasterKelas",
    "TahunAjaran"
  ];

  for (const t of cekTables) {
    const res = await query(`SELECT COUNT(*) AS c FROM "${t}"`);
    console.log(`   - ${t}: ${res.rows[0].c} baris`);
  }

  console.log("=== PEMBERSIHAN SELESAI DENGAN SUKSES ===");
}

if (require.main === module) {
  backupDanBersihkan()
    .catch((err) => {
      console.error("Gagal membersihkan data:", err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { backupDanBersihkan };
