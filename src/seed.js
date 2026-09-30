// Seed data — sinkron dengan GURU_SEED/WALI_SEED/SANTRI_SEED di pesantren-app.jsx,
// supaya akun demo di frontend & backend konsisten.
require("dotenv").config({ quiet: true });
const bcrypt = require("bcryptjs");
const db = require("./db");

const GURU_SEED = [
  { id: "g1", nama: "Ustadz Fahmi", username: "fahmi", departemen: "pengasuhan", password: "guru123" },
  { id: "g2", nama: "Ustadzah Nadia", username: "nadia", departemen: "pengajaran", password: "guru123" },
  { id: "g3a", nama: "Ustadz Hilmi", username: "hilmi.lptq", departemen: "lptq", password: "guru123" },
  { id: "g3b", nama: "Ustadz Hilmi", username: "hilmi.data", departemen: "sekretariat", password: "guru123" },
  { id: "g4", nama: "Pimpinan Pondok", username: "admin", departemen: "admin", password: "admin123" },
  { id: "g5", nama: "Bpk. Hendra", username: "hendra", departemen: "administrasi", password: "uang123" },
  { id: "g6", nama: "Bpk. Slamet", username: "slamet.kantin", departemen: "unitusaha", unit: "Kantin", password: "guru123" },
  { id: "g7", nama: "Ibu Fatimah", username: "fatimah.bmt", departemen: "unitusaha", unit: "BMT", password: "guru123" },
  { id: "g8", nama: "Kasir Kiosk", username: "kiosk", departemen: "unitusaha", unit: "Kopel", password: "kiosk" },
  { id: "g9", nama: "Staf Unit Usaha", username: "staf", departemen: "unitusaha", unit: "Kopel", password: "staf" },
  { id: "g10", nama: "Kasir Demo", username: "kasir", departemen: "unitusaha", unit: "BMT", password: "kasir123" },
  { id: "g11", nama: "BMT Demo", username: "bmt", departemen: "unitusaha", unit: "BMT", password: "bmt" },
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

const insertGuru = db.prepare(`INSERT OR IGNORE INTO Guru (id, nama, username, password, departemen, unit) VALUES (@id, @nama, @username, @password, @departemen, @unit)`);
const insertWali = db.prepare(`INSERT OR IGNORE INTO Wali (id, nama, hp, username, password) VALUES (@id, @nama, @hp, @username, @password)`);
const insertSantri = db.prepare(`INSERT OR IGNORE INTO Santri (id, nama, kelas, nis, nisn, waliId, saldo) VALUES (@id, @nama, @kelas, @nis, @nisn, @waliId, 0)`);

const seed = db.transaction(() => {
  for (const g of GURU_SEED) insertGuru.run({ ...g, unit: g.unit || null, password: bcrypt.hashSync(g.password, 10) });
  for (const w of WALI_SEED) insertWali.run({ ...w, password: bcrypt.hashSync(w.password, 10) });
  for (const s of SANTRI_SEED) insertSantri.run(s);
});

seed();
console.log("Seed selesai:", GURU_SEED.length, "guru,", WALI_SEED.length, "wali,", SANTRI_SEED.length, "santri.");
console.log("Akun demo untuk kasir: kiosk/kiosk, staf/staf, kasir/kasir123, bmt/bmt, fatimah.bmt/guru123.");
