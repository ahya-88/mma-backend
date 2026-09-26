const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "..", "cashless.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Jalankan schema.sql sekali saat startup (idempoten — semua statement pakai IF NOT EXISTS).
const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
db.exec(schema);

// Migrasi ringan: CREATE TABLE IF NOT EXISTS tidak menambah kolom baru ke tabel yang sudah ada
// di database lama. Untuk kolom biodata Santri yang ditambahkan belakangan, tambahkan secara
// manual & idempoten lewat ALTER TABLE bila database yang dipakai (cashless.db yang sudah ada)
// belum punya kolom tersebut.
const SANTRI_EXTRA_COLUMNS = [
  "jenisKelamin", "tempatLahir", "tanggalLahir", "alamat", "asrama", "golDarah",
  "noDarurat", "catatanKesehatan", "halaqoh", "foto", "namaAyah", "namaIbu",
  "asalSekolah", "programPilihan", "citaCita", "pendidikanSD", "tahunSD",
  "pendidikanSMP", "tahunSMP", "pendidikanSMA", "tahunSMA", "riwayatKelas",
];
const existingSantriCols = db.prepare("PRAGMA table_info(Santri)").all().map((c) => c.name);
for (const col of SANTRI_EXTRA_COLUMNS) {
  if (!existingSantriCols.includes(col)) {
    db.exec(`ALTER TABLE Santri ADD COLUMN ${col} TEXT`);
  }
}

module.exports = db;
