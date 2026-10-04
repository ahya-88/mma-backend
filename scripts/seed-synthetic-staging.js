/**
 * Skrip Seeder Data Sintetis Skala Penuh (2.000 Santri, 2.000 Wali, 50 Staf)
 * KHUSUS LINGKUNGAN STAGING / TEST.
 * Dilarang dijalankan di lingkungan Produksi.
 */
const bcrypt = require("bcryptjs");
const { query, withTransaction } = require("../src/db");

async function seedSyntheticStaging() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SYNTHETIC_SEED !== "true") {
    console.error("❌ BATAL: Skrip data sintetis tidak boleh dijalankan pada lingkungan Produksi!");
    process.exit(1);
  }

  console.log("🚀 Memulai seeding data sintetis skala penuh (2.000 Santri, 2.000 Wali, 50 Staf)...");
  const defaultHash = await bcrypt.hash("Staging123!", 4);

  await withTransaction(async () => {
    // 1. Seed 50 Staf (Guru)
    console.log("  -> Seeding 50 Akun Staf...");
    const departemens = ["pengasuhan", "pengajaran", "lptq", "administrasi", "unitusaha", "sekretariat"];
    for (let i = 1; i <= 50; i++) {
      const id = `g_synth_${i}`;
      const username = `staf.synth.${i}`;
      const dep = departemens[(i - 1) % departemens.length];
      const unit = dep === "unitusaha" ? (i % 2 === 0 ? "BMT" : "Kantin") : null;
      await query(
        `INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "unit", "jenisAkun", "mustChangePassword")
         VALUES ($1, $2, $3, $4, $5, $6, 'staf', FALSE)
         ON CONFLICT ("id") DO NOTHING`,
        [id, `Staf Sintetis ${i}`, username, defaultHash, dep, unit],
      );
    }

    // 2. Seed 2.000 Wali & 2.000 Santri
    console.log("  -> Seeding 2.000 Wali dan 2.000 Santri...");
    const kelasList = ["7A", "7B", "8A", "8B", "9A", "9B", "10A", "10B", "11A", "11B", "12A", "12B"];

    for (let i = 1; i <= 2000; i++) {
      const waliId = `w_synth_${i}`;
      const santriId = `s_synth_${i}`;
      const nis = String(10000 + i);
      const nisn = String(8000000000 + i);
      const kelas = kelasList[(i - 1) % kelasList.length];

      await query(
        `INSERT INTO "Wali" ("id", "nama", "hp", "username", "password", "mustChangePassword", "statusAkun")
         VALUES ($1, $2, $3, $4, $5, FALSE, 'Aktif')
         ON CONFLICT ("id") DO NOTHING`,
        [waliId, `Wali Santri ${i}`, `0812999${String(i).padStart(4, "0")}`, `wali.${nis}`, defaultHash],
      );

      await query(
        `INSERT INTO "Santri" ("id", "nama", "kelas", "nis", "nisn", "waliId", "saldo", "limitJajanHarian", "jenisKelamin")
         VALUES ($1, $2, $3, $4, $5, $6, 150000, 25000, $7)
         ON CONFLICT ("id") DO NOTHING`,
        [santriId, `Santri Sintetis ${i}`, kelas, nis, nisn, waliId, i % 2 === 0 ? "L" : "P"],
      );

      if (i % 500 === 0) {
        console.log(`     ...terproses ${i} / 2.000 santri`);
      }
    }
  });

  console.log("✅ Seeding data sintetis selesai!");
}

if (require.main === module) {
  seedSyntheticStaging()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Seeding gagal:", err);
      process.exit(1);
    });
}

module.exports = { seedSyntheticStaging };
