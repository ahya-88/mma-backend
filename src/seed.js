require("dotenv").config({ quiet: true });
const bcrypt = require("bcryptjs");
const { query, withTransaction, initializeDatabase } = require("./db");
const { isProduction } = require("./environment");

const GURU_SEED = [
  { id: "g1", nama: "Ustadz Fahmi", username: "fahmi", departemen: "pengasuhan", password: "guru123" },
  { id: "g2", nama: "Ustadzah Nadia", username: "nadia", departemen: "pengajaran", password: "guru123" },
  { id: "g3a", nama: "Ustadz Hilmi", username: "hilmi.lptq", departemen: "lptq", password: "guru123" },
  { id: "g3b", nama: "Ustadz Hilmi", username: "hilmi.data", departemen: "sekretariat", password: "guru123" },
  { id: "g4", nama: "Pimpinan Pondok", username: "admin", departemen: "admin", jenisAkun: "superadmin", password: "admin123" },
  { id: "g5", nama: "Bpk. Hendra", username: "hendra", departemen: "administrasi", password: "uang123" },
  { id: "g6", nama: "Bpk. Slamet", username: "slamet.kantin", departemen: "unitusaha", unit: "Kantin", password: "guru123" },
  { id: "g7", nama: "Ibu Fatimah", username: "fatimah.bmt", departemen: "unitusaha", unit: "BMT", password: "guru123" },
];

const WALI_SEED = [
  { id: "w1", nama: "Bpk. Ahmad Ridwan", hp: "0812-3456-7890", username: "ahmad.ridwan", password: "wali123" },
  { id: "w2", nama: "Ibu Siti Aminah", hp: "0813-2233-4455", username: "siti.aminah", password: "wali123" },
  { id: "w3", nama: "Bpk. Yusuf Hakim", hp: "0857-9988-1122", username: "yusuf.hakim", password: "wali123" },
];

const SANTRI_SEED = [
  { id: "s1", nama: "Abdul Malik", kelas: "Tahfidz 1A", waliId: "w1", nis: "2024001", nisn: "0051234561" },
  { id: "s2", nama: "Bilal Ramadhan", kelas: "Tahfidz 1A", waliId: "w2", nis: "2024002", nisn: "0051234562" },
  { id: "s3", nama: "Umar Faruq", kelas: "Tahfidz 1B", waliId: "w1", nis: "2024003", nisn: "0051234563" },
  { id: "s4", nama: "Zaid Alfarizi", kelas: "Tahfidz 1B", waliId: "w3", nis: "2024004", nisn: "0051234564" },
  { id: "s5", nama: "Hamzah Fadhil", kelas: "Tahfidz 2A", waliId: "w2", nis: "2024005", nisn: "0051234565" },
  { id: "s6", nama: "Salman Aziz", kelas: "Tahfidz 2A", waliId: "w3", nis: "2024006", nisn: "0051234566" },
];

async function seed() {
  if (process.env.DEMO_MODE !== "true") {
    throw new Error("Seed akun demo dinonaktifkan. Set DEMO_MODE=true hanya pada database lokal/staging terisolasi.");
  }
  if (isProduction() || !["development", "test"].includes(process.env.NODE_ENV)) {
    throw new Error("Seed akun demo hanya boleh dijalankan dengan NODE_ENV=development atau test.");
  }
  await initializeDatabase();
  await withTransaction(async () => {
    for (const guru of GURU_SEED) {
      await query('INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "unit", "jenisAkun") VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING',
        [guru.id, guru.nama, guru.username, bcrypt.hashSync(guru.password, 10), guru.departemen, guru.unit || null, guru.jenisAkun || "staf"]);
    }
    for (const wali of WALI_SEED) {
      await query('INSERT INTO "Wali" ("id", "nama", "hp", "username", "password") VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
        [wali.id, wali.nama, wali.hp, wali.username, bcrypt.hashSync(wali.password, 10)]);
    }
    for (const santri of SANTRI_SEED) {
      await query('INSERT INTO "Santri" ("id", "nama", "kelas", "nis", "nisn", "waliId", "saldo") VALUES ($1, $2, $3, $4, $5, $6, 0) ON CONFLICT DO NOTHING',
        [santri.id, santri.nama, santri.kelas, santri.nis, santri.nisn, santri.waliId]);
    }
  });
  console.log("Seed selesai:", GURU_SEED.length, "guru,", WALI_SEED.length, "wali,", SANTRI_SEED.length, "santri.");
  console.log("Akun demo dibuat hanya pada database lokal/staging terisolasi.");
}

seed().catch((error) => {
  console.error("Seed gagal:", error);
  process.exitCode = 1;
});