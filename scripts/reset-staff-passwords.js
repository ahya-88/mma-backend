require("dotenv").config({ quiet: true });
const bcrypt = require("bcryptjs");
const { query, queryOne, withTransaction } = require("../src/db");

const ACCOUNT_RESETS = [
  { username: "admin", nama: "Pimpinan Pondok", departemen: "admin", jenisAkun: "superadmin", password: "admin123" },
  { username: "ikmal", nama: "Superadmin Ikmal", departemen: "admin", jenisAkun: "superadmin", password: "admin123" },
  { username: "hendra", nama: "Bpk. Hendra", departemen: "administrasi", jenisAkun: "staf", password: "uang123" },
  { username: "fatimah.bmt", nama: "Ibu Fatimah BMT", departemen: "unitusaha", unit: "BMT", jenisAkun: "staf", password: "guru123" },
  { username: "fatimah", nama: "Ibu Fatimah", departemen: "unitusaha", unit: "BMT", jenisAkun: "staf", password: "guru123" },
  { username: "hilmi.data", nama: "Ustadz Hilmi Data", departemen: "sekretariat", jenisAkun: "staf", password: "guru123" },
  { username: "slamet.kantin", nama: "Bpk. Slamet Kantin", departemen: "unitusaha", unit: "Kantin", jenisAkun: "staf", password: "guru123" },
  { username: "fahmi", nama: "Ustadz Fahmi", departemen: "pengasuhan", jenisAkun: "staf", password: "guru123" },
  { username: "nadia", nama: "Ustadzah Nadia", departemen: "pengajaran", jenisAkun: "staf", password: "guru123" },
  { username: "hilmi.lptq", nama: "Ustadz Hilmi LPTQ", departemen: "lptq", jenisAkun: "staf", password: "guru123" },
];

const WALI_RESETS = [
  { username: "ahmad.ridwan", nama: "Bpk. Ahmad Ridwan", hp: "0812-3456-7890", password: "wali123" },
  { username: "siti.aminah", nama: "Ibu Siti Aminah", hp: "0813-2233-4455", password: "wali123" },
  { username: "yusuf.hakim", nama: "Bpk. Yusuf Hakim", hp: "0857-9988-1122", password: "wali123" },
];

async function resetPasswords() {
  console.log("🔑 Memperbarui & mereset kata sandi seluruh akun staf & wali...");
  await withTransaction(async () => {
    for (const acc of ACCOUNT_RESETS) {
      const hash = bcrypt.hashSync(acc.password, 10);
      const existing = await queryOne('SELECT "id" FROM "Guru" WHERE "username" = $1', [acc.username]);
      if (existing) {
        await query(
          'UPDATE "Guru" SET "password" = $1, "mustChangePassword" = FALSE, "loginFailedAttempts" = 0, "loginLockedUntil" = NULL WHERE "id" = $2',
          [hash, existing.id]
        );
        console.log(`  ✓ Updated password for Guru: ${acc.username} (${acc.password})`);
      } else {
        const id = acc.username === "admin" ? "g4" : "g_" + acc.username;
        await query(
          'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "unit", "jenisAkun", "mustChangePassword") VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)',
          [id, acc.nama, acc.username, hash, acc.departemen, acc.unit || null, acc.jenisAkun || "staf"]
        );
        console.log(`  + Created missing Guru account: ${acc.username} (${acc.password})`);
      }
    }

    for (const wali of WALI_RESETS) {
      const hash = bcrypt.hashSync(wali.password, 10);
      const existing = await queryOne('SELECT "id" FROM "Wali" WHERE "username" = $1', [wali.username]);
      if (existing) {
        await query(
          'UPDATE "Wali" SET "password" = $1, "mustChangePassword" = FALSE, "loginFailedAttempts" = 0, "loginLockedUntil" = NULL WHERE "id" = $2',
          [hash, existing.id]
        );
        console.log(`  ✓ Updated password for Wali: ${wali.username} (${wali.password})`);
      } else {
        const id = "w_" + wali.username;
        await query(
          'INSERT INTO "Wali" ("id", "nama", "hp", "username", "password", "mustChangePassword") VALUES ($1, $2, $3, $4, $5, FALSE)',
          [id, wali.nama, wali.hp, wali.username, hash]
        );
        console.log(`  + Created missing Wali account: ${wali.username} (${wali.password})`);
      }
    }
  });
  console.log("✅ Berhasil mereset seluruh kata sandi akun!");
}

resetPasswords().then(() => process.exit(0)).catch((err) => {
  console.error("❌ Reset gagal:", err);
  process.exit(1);
});
