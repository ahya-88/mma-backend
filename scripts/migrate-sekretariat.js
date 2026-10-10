require("dotenv").config({ quiet: true });
const { query, withTransaction } = require("../src/db");
const crypto = require("crypto");

const KOP_SURAT_DEFAULT = {
  id: "default",
  namaLembaga: "Ma'had Mudaiyatul Anwar",
  alamat: "Jl. Pesantren No. 1, Magelang, Jawa Tengah",
  kontak: "Telp: (0293) 123456 / info@mma.ponpes.id",
  kota: "Magelang",
  kodeOrganisasi: "MMA",
  tagline: "Berilmu · Berakhlak · Berdaya",
  motto: "Mencetak Generasi Qur'ani dan Berkarakter",
  namaPenandatangan: "K.H. Ahmad Dahlan, Lc., M.Pd.",
  jabatanPenandatangan: "Pimpinan Pondok",
  logoUrl: "",
};

const BAGIAN_SEED = [
  { id: "bg1", kode: "A", nama: "Pimpinan Pondok", organisasi: "MMA", deskripsi: "Pimpinan tertinggi pondok, menerbitkan surat kebijakan & keputusan.", aktif: true, dihapus: false },
  { id: "bg2", kode: "B", nama: "Sekretariat Pondok", organisasi: "MMA", deskripsi: "Mengelola korespondensi, arsip, dan administrasi surat-menyurat.", aktif: true, dihapus: false },
  { id: "bg3", kode: "C", nama: "Keuangan", organisasi: "MMA", deskripsi: "Bagian keuangan/administrasi, menerbitkan surat terkait anggaran & tagihan.", aktif: true, dihapus: false },
  { id: "bg4", kode: "D", nama: "Pengasuhan Santri", organisasi: "MMA", deskripsi: "Pengasuhan & pembinaan santri sehari-hari.", aktif: true, dihapus: false },
  { id: "bg5", kode: "E", nama: "Pengajaran", organisasi: "MMA", deskripsi: "Bagian akademik/KMI, menerbitkan surat terkait pengajaran.", aktif: true, dihapus: false },
  { id: "bg6", kode: "F", nama: "LPTQ", organisasi: "MMA", deskripsi: "Lembaga Pengembangan Tilawah Qur'an — tahfidz & ubudiyah.", aktif: true, dihapus: false },
  { id: "bg7", kode: "G", nama: "Unit Usaha", organisasi: "MMA", deskripsi: "Unit usaha pondok (kantin, koperasi, BMT, dsb.).", aktif: true, dihapus: false },
];

const KEPANITIAAN_SEED = [
  { id: "kp1", kode: "PHBI", nama: "Panitia Hari Besar Islam" },
  { id: "kp2", kode: "PORSENI", nama: "Panitia Pekan Olahraga dan Seni" },
  { id: "kp3", kode: "PSB", nama: "Panitia Penerimaan Santri Baru" },
];

const JENIS_SURAT_SEED = [
  { id: "js1", kode: "h", nama: "Surat Undangan", kategori: "Keluar", formatTataLetak: "Berperihal", tipeIsi: "Bebas" },
  { id: "js2", kode: "b", nama: "Surat Keterangan", kategori: "Keluar", formatTataLetak: "Berjudul", tipeIsi: "Keterangan" },
  { id: "js3", kode: "s", nama: "Surat Tugas", kategori: "Keluar", formatTataLetak: "Berjudul", tipeIsi: "Bebas" },
  { id: "js4", kode: "d", nama: "Surat Keputusan (SK)", kategori: "Keluar", formatTataLetak: "Berjudul", tipeIsi: "SK" },
  { id: "js5", kode: "ab", nama: "Surat Edaran", kategori: "Keluar", formatTataLetak: "Berperihal", tipeIsi: "Bebas" },
  { id: "js6", kode: "e", nama: "Surat Pemberitahuan", kategori: "Keluar", formatTataLetak: "Berperihal", tipeIsi: "Bebas" },
  { id: "js7", kode: "ac", nama: "Surat Rekomendasi", kategori: "Keluar", formatTataLetak: "Berperihal", tipeIsi: "Bebas" },
  { id: "js8", kode: "a", nama: "Surat Izin/Cuti Pegawai", kategori: "Keluar", formatTataLetak: "Berperihal", tipeIsi: "Bebas" },
  { id: "js9", kode: "ad", nama: "Surat Keluar Umum", kategori: "Keluar", formatTataLetak: "Berperihal", tipeIsi: "Bebas" },
  { id: "js10", kode: "z", nama: "Surat Mandat", kategori: "Keluar", formatTataLetak: "Berjudul", tipeIsi: "SK" },
  { id: "js11", kode: "c", nama: "Surat Instruksi", kategori: "Keluar", formatTataLetak: "Berperihal", tipeIsi: "Bebas" },
  { id: "js12", kode: "f", nama: "Surat Permohonan", kategori: "Keluar", formatTataLetak: "Berperihal", tipeIsi: "Bebas" },
  { id: "js13", kode: "g", nama: "Surat Mohon Pinjaman", kategori: "Keluar", formatTataLetak: "Berperihal", tipeIsi: "Bebas" },
  { id: "js14", kode: "i", nama: "Surat Mohon Persetujuan", kategori: "Keluar", formatTataLetak: "Berperihal", tipeIsi: "Bebas" },
  { id: "js15", kode: "j", nama: "Surat Hantaran", kategori: "Keluar", formatTataLetak: "Berperihal", tipeIsi: "Bebas" },
  { id: "js16", kode: "k", nama: "Surat Tagihan", kategori: "Keluar", formatTataLetak: "Berperihal", tipeIsi: "Bebas" },
  { id: "js17", kode: "l", nama: "Surat Perubahan", kategori: "Keluar", formatTataLetak: "Berperihal", tipeIsi: "Bebas" },
  { id: "js18", kode: "m", nama: "Surat Pengangkatan", kategori: "Keluar", formatTataLetak: "Berjudul", tipeIsi: "SK" },
  { id: "js19", kode: "n", nama: "Surat Mohon Kesediaan", kategori: "Keluar", formatTataLetak: "Berperihal", tipeIsi: "Bebas" },
  { id: "js20", kode: "o", nama: "Surat Penyerahan Mandat", kategori: "Keluar", formatTataLetak: "Berjudul", tipeIsi: "SK" },
  { id: "js21", kode: "p", nama: "Surat Ucapan Terima Kasih", kategori: "Keluar", formatTataLetak: "Berperihal", tipeIsi: "Bebas" },
  { id: "js22", kode: "q", nama: "Surat Laporan Umum", kategori: "Keluar", formatTataLetak: "Berperihal", tipeIsi: "Bebas" },
  { id: "js23", kode: "r", nama: "Surat Ucapan Selamat", kategori: "Keluar", formatTataLetak: "Berperihal", tipeIsi: "Bebas" },
  { id: "js24", kode: "t", nama: "Surat Balasan", kategori: "Keluar", formatTataLetak: "Berperihal", tipeIsi: "Bebas" },
  { id: "js25", kode: "u", nama: "Surat Penghargaan", kategori: "Keluar", formatTataLetak: "Berjudul", tipeIsi: "Bebas" },
  { id: "js26", kode: "v", nama: "Surat Saksi", kategori: "Keluar", formatTataLetak: "Berjudul", tipeIsi: "Keterangan" },
  { id: "js27", kode: "w", nama: "Surat Non Aktif", kategori: "Keluar", formatTataLetak: "Berjudul", tipeIsi: "Keterangan" },
  { id: "js28", kode: "x", nama: "Surat Bela Sungkawa", kategori: "Keluar", formatTataLetak: "Berperihal", tipeIsi: "Bebas" },
  { id: "js29", kode: "y", nama: "Surat Mohon Bantuan", kategori: "Keluar", formatTataLetak: "Berperihal", tipeIsi: "Bebas" },
  { id: "js30", kode: "aa", nama: "Surat Pesanan", kategori: "Keluar", formatTataLetak: "Berperihal", tipeIsi: "Bebas" },
];

const PIMPINAN_SEED = [
  { id: "pp1", nama: "K.H. Ahmad Dahlan, Lc., M.Pd.", jabatan: "Pimpinan Pondok" },
];

async function migrate() {
  console.log("🚀 Menjalankan migrasi database modul Persuratan & Sekretariat...");

  const fs = require("fs");
  const path = require("path");
  const ddl = fs.readFileSync(path.join(__dirname, "../src/schema.pg.sql"), "utf8");
  await query(ddl);
  console.log("✓ Tabel persuratan berhasil dibuat / diverifikasi.");

  await withTransaction(async (client) => {
    // 1. Seed Kop Surat
    await client.query(`
      INSERT INTO "KopSurat" ("id", "namaLembaga", "alamat", "kontak", "kota", "kodeOrganisasi", "tagline", "motto", "namaPenandatangan", "jabatanPenandatangan", "logoUrl")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT ("id") DO NOTHING;
    `, [
      KOP_SURAT_DEFAULT.id,
      KOP_SURAT_DEFAULT.namaLembaga,
      KOP_SURAT_DEFAULT.alamat,
      KOP_SURAT_DEFAULT.kontak,
      KOP_SURAT_DEFAULT.kota,
      KOP_SURAT_DEFAULT.kodeOrganisasi,
      KOP_SURAT_DEFAULT.tagline,
      KOP_SURAT_DEFAULT.motto,
      KOP_SURAT_DEFAULT.namaPenandatangan,
      KOP_SURAT_DEFAULT.jabatanPenandatangan,
      KOP_SURAT_DEFAULT.logoUrl,
    ]);

    // 2. Seed MasterBagian
    for (const b of BAGIAN_SEED) {
      await client.query(`
        INSERT INTO "MasterBagian" ("id", "kode", "nama", "organisasi", "deskripsi", "aktif", "dihapus")
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT ("kode") DO UPDATE SET "nama" = EXCLUDED."nama", "organisasi" = EXCLUDED."organisasi";
      `, [b.id, b.kode, b.nama, b.organisasi, b.deskripsi, b.aktif, b.dihapus]);
    }

    // 3. Seed MasterKepanitiaan
    for (const k of KEPANITIAAN_SEED) {
      await client.query(`
        INSERT INTO "MasterKepanitiaan" ("id", "kode", "nama")
        VALUES ($1, $2, $3)
        ON CONFLICT ("kode") DO UPDATE SET "nama" = EXCLUDED."nama";
      `, [k.id, k.kode, k.nama]);
    }

    // 4. Seed MasterJenisSurat
    for (const j of JENIS_SURAT_SEED) {
      await client.query(`
        INSERT INTO "MasterJenisSurat" ("id", "kode", "nama", "kategori", "formatTataLetak", "tipeIsi")
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT ("kode") DO UPDATE SET "nama" = EXCLUDED."nama", "formatTataLetak" = EXCLUDED."formatTataLetak", "tipeIsi" = EXCLUDED."tipeIsi";
      `, [j.id, j.kode, j.nama, j.kategori, j.formatTataLetak, j.tipeIsi]);
    }

    // 5. Seed MasterPimpinan
    for (const p of PIMPINAN_SEED) {
      await client.query(`
        INSERT INTO "MasterPimpinan" ("id", "nama", "jabatan")
        VALUES ($1, $2, $3)
        ON CONFLICT ("id") DO NOTHING;
      `, [p.id, p.nama, p.jabatan]);
    }
  });

  console.log("✅ Migrasi modul persuratan & sekretariat selesai 100%!");
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Gagal migrasi:", e);
    process.exit(1);
  });
