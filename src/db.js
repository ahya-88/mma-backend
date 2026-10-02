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
  "faceEmbedding", // embedding wajah (JSON array 192 float) — dihitung di aplikasi kasir, bukan biodata
];
const existingSantriCols = db.prepare("PRAGMA table_info(Santri)").all().map((c) => c.name);
for (const col of SANTRI_EXTRA_COLUMNS) {
  if (!existingSantriCols.includes(col)) {
    db.exec(`ALTER TABLE Santri ADD COLUMN ${col} TEXT`);
  }
}

// PermintaanBMT: kolom buktiTransfer ditambahkan belakangan untuk jenis "Top Up Saldo" (klaim
// transfer manual wali). Sama seperti kolom biodata Santri di atas, database lama perlu ALTER
// TABLE manual karena CREATE TABLE IF NOT EXISTS tidak menambah kolom ke tabel yang sudah ada.
const existingPermintaanCols = db.prepare("PRAGMA table_info(PermintaanBMT)").all().map((c) => c.name);
if (!existingPermintaanCols.includes("buktiTransfer")) {
  db.exec("ALTER TABLE PermintaanBMT ADD COLUMN buktiTransfer TEXT");
}

// Default data ringan untuk tabel Admin yang baru (UnitUsaha, TahunAjaran, Pengaturan.tampilan) —
// hanya diisi jika tabelnya masih kosong, supaya deployment yang sudah berjalan (mis. produksi di
// Railway) otomatis mendapat nilai awal yang masuk akal begitu update ini di-deploy, tanpa perlu
// menjalankan `npm run seed` secara manual. Nilainya sengaja sama dengan seed lama di frontend
// (UNIT_USAHA_SEED, TAHUN_AJARAN_SEED, default tampilan) supaya tidak terlihat berubah tiba-tiba.
const crypto = require("crypto");
if (db.prepare("SELECT COUNT(*) AS n FROM UnitUsaha").get().n === 0) {
  const insertUnit = db.prepare("INSERT INTO UnitUsaha (id, nama) VALUES (?, ?)");
  for (const nama of ["Kantin", "Kopel", "Dapur", "BMT"]) insertUnit.run(crypto.randomUUID(), nama);
}
if (db.prepare("SELECT COUNT(*) AS n FROM TahunAjaran").get().n === 0) {
  db.prepare("INSERT INTO TahunAjaran (id, tahunMulai, aktif) VALUES (?, 2026, 1)").run(crypto.randomUUID());
}
if (!db.prepare("SELECT 1 FROM Pengaturan WHERE kunci = 'tampilan'").get()) {
  const tampilanDefault = {
    logoUrl: "", buildingPhotoUrl: "", namaAplikasi: "Ma'had Mudaiyatul Anwar",
    warnaPrimer: "#29AAE1", warnaSekunder: "#0C4A6E", warnaAksenBg: "#7C3AED",
    warnaTeks: "#17242E", warnaTeksMuted: "#5B7C93", warnaBorder: "#CFE3F0",
    warnaLatarHalaman: "#F4F8FB", fontJudul: "Fraunces", fontIsi: "Inter", gayaBackground: "aurora",
  };
  db.prepare("INSERT INTO Pengaturan (kunci, nilai) VALUES ('tampilan', ?)").run(JSON.stringify(tampilanDefault));
}

// Model embedding wajah. Versi lama (proxy luminansi piksel) tidak valid untuk pengenalan wajah
// sungguhan, jadi semua embedding lama dikosongkan SEKALI saat model berganti; aplikasi kasir
// (MobileFaceNet + ML Kit) akan menghitung ulang dari foto santri saat sinkronisasi berikutnya.
const FACE_MODEL = "mfn192-v1";
const faceModelRow = db.prepare("SELECT nilai FROM Pengaturan WHERE kunci = 'faceModel'").get();
if (!faceModelRow || faceModelRow.nilai !== FACE_MODEL) {
  db.prepare("UPDATE Santri SET faceEmbedding = NULL").run();
  db.prepare(
    "INSERT INTO Pengaturan (kunci, nilai) VALUES ('faceModel', ?) ON CONFLICT(kunci) DO UPDATE SET nilai = excluded.nilai"
  ).run(FACE_MODEL);
}

module.exports = db;
