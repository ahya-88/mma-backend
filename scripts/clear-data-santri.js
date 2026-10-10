require("dotenv").config({ quiet: true });
const { withTransaction, query } = require("../src/db");

async function clearDataSantriDanWali() {
  console.log("🧹 Memulai pembersihan total data Santri & Wali Santri...");
  await withTransaction(async () => {
    const tablesToDelete = [
      "TransaksiCashless",
      "TransaksiCashlessIdempotency",
      "TransaksiUnitUsaha",
      "RiwayatStokOpname",
      "Cashflow",
      "RincianAnggaran",
      "PengajuanAnggaran",
      "Ledger",
      "QueueOfflineKasir",
      "PendaftaranUlang",
      "LogPin",
      "PermintaanBMT",
      "Absensi",
      "Perizinan",
      "Pelanggaran",
      "Nilai",
      "Prestasi",
      "Hafalan",
      "PenilaianUbudiyah",
      "Tagihan",
      "FaceTemplate",
      "LogWajah",
      "RekonsiliasiImpor",
      "BatchImpor",
      "Santri",
      "Wali"
    ];

    for (const tbl of tablesToDelete) {
      try {
        await query(`DELETE FROM "${tbl}"`);
        console.log(`  ✓ Berhasil mengosongkan tabel "${tbl}"`);
      } catch (err) {
        // Abaikan jika tabel opsional belum dibuat
      }
    }

    console.log("✅ Berhasil mengosongkan seluruh data Santri & Wali Santri!");
  });
}

clearDataSantriDanWali().then(() => process.exit(0)).catch((err) => {
  console.error("❌ Gagal membersihkan data:", err);
  process.exit(1);
});
