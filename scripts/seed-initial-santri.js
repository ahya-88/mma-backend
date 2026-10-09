require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const { query, queryOne, withTransaction, pool } = require('../src/db');

const WALI_SEED = [
  { id: "w1", nama: "Bpk. Ahmad Ridwan", hp: "0812-3456-7890", username: "ahmad.ridwan", password: "wali123" },
  { id: "w2", nama: "Ibu Siti Aminah", hp: "0813-2233-4455", username: "siti.aminah", password: "wali123" },
  { id: "w3", nama: "Bpk. Yusuf Hakim", hp: "0857-9988-1122", username: "yusuf.hakim", password: "wali123" },
];

const SANTRI_SEED = [
  { id: "s1", nama: "Abdul Malik", kelas: "Tahfidz 1A", waliId: "w1", nis: "2024001", nisn: "0051234561", jenisKelamin: "Laki-laki", tempatLahir: "Bandung", tanggalLahir: "2013-04-11", alamat: "Jl. Melati No. 3, Bandung", asrama: "Asrama Al-Fatih Kamar 2", golDarah: "O", noDarurat: "0812-3456-7890", catatanKesehatan: "-" },
  { id: "s2", nama: "Bilal Ramadhan", kelas: "Tahfidz 1A", waliId: "w2", nis: "2024002", nisn: "0051234562", jenisKelamin: "Laki-laki", tempatLahir: "Bogor", tanggalLahir: "2013-08-02", alamat: "Jl. Kenanga No. 8, Bogor", asrama: "Asrama Al-Fatih Kamar 2", golDarah: "A", noDarurat: "0813-2233-4455", catatanKesehatan: "Alergi udang" },
  { id: "s3", nama: "Umar Faruq", kelas: "Tahfidz 1B", waliId: "w1", nis: "2024003", nisn: "0051234563", jenisKelamin: "Laki-laki", tempatLahir: "Bandung", tanggalLahir: "2013-01-20", alamat: "Jl. Melati No. 3, Bandung", asrama: "Asrama Al-Fatih Kamar 3", golDarah: "B", noDarurat: "0812-3456-7890", catatanKesehatan: "-" },
  { id: "s4", nama: "Zaid Alfarizi", kelas: "Tahfidz 1B", waliId: "w3", nis: "2024004", nisn: "0051234564", jenisKelamin: "Laki-laki", tempatLahir: "Cianjur", tanggalLahir: "2013-11-05", alamat: "Jl. Aster No. 1, Cianjur", asrama: "Asrama Al-Fatih Kamar 3", golDarah: "AB", noDarurat: "0857-9988-1122", catatanKesehatan: "-" },
  { id: "s5", nama: "Hamzah Fadhil", kelas: "Tahfidz 2A", waliId: "w2", nis: "2024005", nisn: "0051234565", jenisKelamin: "Laki-laki", tempatLahir: "Bogor", tanggalLahir: "2012-06-15", alamat: "Jl. Kenanga No. 8, Bogor", asrama: "Asrama An-Nur Kamar 1", golDarah: "O", noDarurat: "0813-2233-4455", catatanKesehatan: "-" },
  { id: "s6", nama: "Salman Aziz", kelas: "Tahfidz 2A", waliId: "w3", nis: "2024006", nisn: "0051234566", jenisKelamin: "Laki-laki", tempatLahir: "Cianjur", tanggalLahir: "2012-09-09", alamat: "Jl. Aster No. 1, Cianjur", asrama: "Asrama An-Nur Kamar 1", golDarah: "B", noDarurat: "0857-9988-1122", catatanKesehatan: "-" },
];

async function seedInitialSantri() {
  console.log("Menyinkronkan data awal Santri & Wali ke Database Cloud...");

  await withTransaction(async (client) => {
    // 1. Wali
    for (const w of WALI_SEED) {
      const hash = await bcrypt.hash(w.password, 10);
      await client.query(`
        INSERT INTO "Wali" ("id", "nama", "hp", "username", "password", "mustChangePassword", "statusAkun")
        VALUES ($1, $2, $3, $4, $5, FALSE, 'Aktif')
        ON CONFLICT ("username") DO UPDATE SET "nama" = EXCLUDED."nama", "hp" = EXCLUDED."hp"
      `, [w.id, w.nama, w.hp, w.username, hash]);
    }

    // 2. Santri
    for (const s of SANTRI_SEED) {
      await client.query(`
        INSERT INTO "Santri" (
          "id", "nama", "kelas", "nis", "nisn", "waliId", "jenisKelamin",
          "tempatLahir", "tanggalLahir", "alamat", "asrama", "golDarah",
          "noDarurat", "catatanKesehatan", "saldo", "limitJajanHarian"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12,
          $13, $14, 50000, 25000
        )
        ON CONFLICT ("id") DO UPDATE SET
          "nama" = EXCLUDED."nama",
          "kelas" = EXCLUDED."kelas",
          "nis" = EXCLUDED."nis",
          "nisn" = EXCLUDED."nisn",
          "waliId" = EXCLUDED."waliId"
      `, [
        s.id, s.nama, s.kelas, s.nis, s.nisn, s.waliId, s.jenisKelamin,
        s.tempatLahir, s.tanggalLahir, s.alamat, s.asrama, s.golDarah,
        s.noDarurat, s.catatanKesehatan
      ]);
    }
  });

  const count = await queryOne('SELECT COUNT(*) AS total FROM "Santri"');
  console.log(`✓ Selesai! Total santri tersimpan di PostgreSQL: ${count.total}`);
}

seedInitialSantri()
  .catch((e) => console.error("Gagal seed:", e))
  .finally(() => pool.end());
