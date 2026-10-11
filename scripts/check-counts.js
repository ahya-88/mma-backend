require("dotenv").config({ quiet: true });
const { query, pool } = require("../src/db");

async function check() {
  const tables = [
    "Santri",
    "Wali",
    "Guru",
    "TransaksiCashless",
    "TransaksiCashlessIdempotency",
    "Ledger",
    "LogPin",
    "PermintaanBMT",
    "QueueOfflineKasir",
    "LogWajah",
    "FaceTemplate",
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
    "UnitUsaha",
    "MasterKelas",
    "TahunAjaran"
  ];

  console.log("=== JUMLAH BARIS SAAT INI ===");
  for (const t of tables) {
    try {
      const res = await query(`SELECT COUNT(*) AS c FROM "${t}"`);
      console.log(`${t}: ${res.rows[0].c}`);
    } catch (e) {
      console.log(`${t}: ERROR (${e.message})`);
    }
  }
  await pool.end();
}

check().catch(console.error);
