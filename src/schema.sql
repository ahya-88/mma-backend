-- Skema database — Modul Cashless BMT (Ma'had Mudaiyatul Anwar)
-- SQLite (via better-sqlite3): file lokal, tanpa server database terpisah.
-- Untuk skala lebih besar, layer db.js bisa diganti ke Postgres tanpa mengubah cashlessService/routes.

CREATE TABLE IF NOT EXISTS Wali (
  id        TEXT PRIMARY KEY,
  nama      TEXT NOT NULL,
  hp        TEXT,
  username  TEXT NOT NULL UNIQUE,
  password  TEXT NOT NULL, -- hash bcrypt
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Guru (
  id         TEXT PRIMARY KEY,
  nama       TEXT NOT NULL,
  username   TEXT NOT NULL UNIQUE,
  password   TEXT NOT NULL, -- hash bcrypt
  departemen TEXT NOT NULL, -- admin | pengasuhan | pengajaran | lptq | administrasi | unitusaha | sekretariat
  unit       TEXT,          -- khusus departemen "unitusaha": Kantin | Kopel | Dapur | BMT
  createdAt  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Santri (
  id               TEXT PRIMARY KEY,
  nama             TEXT NOT NULL,
  kelas            TEXT,
  nis              TEXT,
  nisn             TEXT,
  waliId           TEXT REFERENCES Wali(id),
  saldo            INTEGER NOT NULL DEFAULT 0,
  limitJajanHarian INTEGER,          -- null/0 = tidak dibatasi
  durasiBlokirHari INTEGER,          -- default DEFAULT_DURASI_BLOKIR_HARI jika kosong
  blokirAktif      INTEGER NOT NULL DEFAULT 0, -- 0/1
  blokirSejakISO   TEXT,
  blokirSampaiISO  TEXT,
  blokirAlasan     TEXT,
  -- ---- Biodata lengkap (Master Data Santri — Sekretariat) ----
  jenisKelamin     TEXT,
  tempatLahir      TEXT,
  tanggalLahir     TEXT,
  alamat           TEXT,
  asrama           TEXT,
  golDarah         TEXT,
  noDarurat        TEXT,
  catatanKesehatan TEXT,
  halaqoh          TEXT,
  foto             TEXT,             -- data URI base64, opsional
  namaAyah         TEXT,
  namaIbu          TEXT,
  asalSekolah      TEXT,
  programPilihan   TEXT,
  citaCita         TEXT,
  pendidikanSD     TEXT,
  tahunSD          TEXT,
  pendidikanSMP    TEXT,
  tahunSMP         TEXT,
  pendidikanSMA    TEXT,
  tahunSMA         TEXT,
  riwayatKelas     TEXT,             -- JSON array [{kelas, tanggal}]
  updatedAt        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS TransaksiCashless (
  id           TEXT PRIMARY KEY,
  santriId     TEXT NOT NULL REFERENCES Santri(id),
  unit         TEXT NOT NULL,  -- Kantin | Kopel | Dapur | BMT
  jenis        TEXT NOT NULL,  -- "Top Up" | "Tarik Tunai"
  kategori     TEXT,           -- "Jajan Harian" | "Kebutuhan Khusus" (hanya utk Tarik Tunai)
  subKategori  TEXT,           -- hanya utk kategori "Kebutuhan Khusus"
  jumlah       INTEGER NOT NULL,
  keterangan   TEXT,
  saldoSetelah INTEGER NOT NULL,
  tanggalISO   TEXT NOT NULL,  -- YYYY-MM-DD, dipakai utk hitung limit harian
  tanggalLabel TEXT NOT NULL,  -- format tampilan ala frontend, mis. "16 Sep 2026"
  bulan        TEXT NOT NULL,
  createdAt    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_transaksi_santri_tanggal ON TransaksiCashless (santriId, tanggalISO);

CREATE TABLE IF NOT EXISTS PermintaanBMT (
  id              TEXT PRIMARY KEY,
  santriId        TEXT NOT NULL REFERENCES Santri(id),
  waliId          TEXT NOT NULL REFERENCES Wali(id),
  jenis           TEXT NOT NULL, -- Ubah Limit Jajan Harian | Ubah Durasi Blokir | Buka Blokir Sekarang
  nilaiDiminta    INTEGER,
  alasan          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'Menunggu', -- Menunggu | Disetujui | Ditolak
  tanggalAjukan   TEXT NOT NULL,
  tanggalDiproses TEXT,
  diprosesOleh    TEXT,
  catatanBMT      TEXT,
  createdAt       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---- Modul Pengasuhan ----
CREATE TABLE IF NOT EXISTS Absensi (
  id          TEXT PRIMARY KEY,
  santriId    TEXT NOT NULL REFERENCES Santri(id),
  tanggalISO  TEXT NOT NULL,
  status      TEXT NOT NULL, -- Hadir | Sakit | Izin | Alpa
  keterangan  TEXT,
  dicatatOleh TEXT,
  createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_absensi_santri_tanggal ON Absensi (santriId, tanggalISO);

CREATE TABLE IF NOT EXISTS Perizinan (
  id             TEXT PRIMARY KEY,
  santriId       TEXT NOT NULL REFERENCES Santri(id),
  jenis          TEXT NOT NULL, -- Pulang | Sakit | Keperluan Keluarga | Lainnya
  tanggalKeluar  TEXT NOT NULL,
  tanggalKembali TEXT,
  alasan         TEXT,
  status         TEXT NOT NULL DEFAULT 'Menunggu', -- Menunggu | Disetujui | Ditolak | Selesai
  diajukanOleh   TEXT,
  disetujuiOleh  TEXT,
  tanggalProses  TEXT,
  createdAt      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_perizinan_santri ON Perizinan (santriId);

CREATE TABLE IF NOT EXISTS Pelanggaran (
  id          TEXT PRIMARY KEY,
  santriId    TEXT NOT NULL REFERENCES Santri(id),
  jenis       TEXT NOT NULL,
  poin        INTEGER NOT NULL DEFAULT 0,
  tanggalISO  TEXT NOT NULL,
  keterangan  TEXT,
  dicatatOleh TEXT,
  createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pelanggaran_santri ON Pelanggaran (santriId);

-- ---- Modul Pengajaran ----
CREATE TABLE IF NOT EXISTS Nilai (
  id          TEXT PRIMARY KEY,
  santriId    TEXT NOT NULL REFERENCES Santri(id),
  mapel       TEXT NOT NULL,
  nilai       INTEGER NOT NULL,
  tanggalISO  TEXT NOT NULL,
  dicatatOleh TEXT,
  createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_nilai_santri ON Nilai (santriId);

CREATE TABLE IF NOT EXISTS Prestasi (
  id          TEXT PRIMARY KEY,
  santriId    TEXT NOT NULL REFERENCES Santri(id),
  judul       TEXT NOT NULL,
  tingkat     TEXT,
  tanggalISO  TEXT NOT NULL,
  dicatatOleh TEXT,
  createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_prestasi_santri ON Prestasi (santriId);

-- ---- Modul LPTQ ----
CREATE TABLE IF NOT EXISTS Hafalan (
  id          TEXT PRIMARY KEY,
  santriId    TEXT NOT NULL REFERENCES Santri(id),
  juz         TEXT NOT NULL,
  tanggalISO  TEXT NOT NULL,
  dicatatOleh TEXT,
  createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hafalan_santri ON Hafalan (santriId);

CREATE TABLE IF NOT EXISTS PenilaianUbudiyah (
  id          TEXT PRIMARY KEY,
  santriId    TEXT NOT NULL REFERENCES Santri(id),
  jenis       TEXT NOT NULL,
  materi      TEXT,
  predikat    TEXT NOT NULL,
  catatan     TEXT,
  tanggalISO  TEXT NOT NULL,
  dicatatOleh TEXT,
  createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ubudiyah_santri ON PenilaianUbudiyah (santriId);

-- ---- Modul Keuangan/Administrasi ----
-- Cakupan sesi ini: Tagihan & Pembayaran, Cashflow (termasuk Infaq, yang di frontend hanyalah
-- entri Cashflow berkategori "Infaq/Donasi"). Pengajuan Anggaran (alur persetujuan bertingkat
-- dengan rincian item) SENGAJA belum dikerjakan — kompleksitasnya setara proyek tersendiri.
CREATE TABLE IF NOT EXISTS Tagihan (
  id              TEXT PRIMARY KEY,
  santriId        TEXT NOT NULL REFERENCES Santri(id),
  jenis           TEXT NOT NULL,
  jumlah          INTEGER NOT NULL,
  bulan           TEXT NOT NULL,
  jumlahDibayar   INTEGER NOT NULL DEFAULT 0,
  tanggalBayarISO TEXT,
  dicatatOleh     TEXT,
  createdAt       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tagihan_santri ON Tagihan (santriId);

CREATE TABLE IF NOT EXISTS Cashflow (
  id          TEXT PRIMARY KEY,
  bulan       TEXT NOT NULL,
  tanggalISO  TEXT NOT NULL,
  jenis       TEXT NOT NULL, -- Masuk | Keluar
  kategori    TEXT NOT NULL,
  jumlah      INTEGER NOT NULL,
  keterangan  TEXT,
  dicatatOleh TEXT,
  createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cashflow_bulan ON Cashflow (bulan);

CREATE TABLE IF NOT EXISTS PengajuanAnggaran (
  id                  TEXT PRIMARY KEY,
  namaKegiatan        TEXT NOT NULL,
  unitPengaju         TEXT,
  ketuaBagianNama     TEXT,
  kategori            TEXT NOT NULL,
  bulanRencana        TEXT NOT NULL,
  catatan             TEXT,
  totalAnggaran       INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'Diajukan', -- Diajukan | Disetujui | Ditolak | Direalisasikan
  tanggalPengajuanISO TEXT NOT NULL,
  diajukanOleh        TEXT,
  tanggalKeputusanISO TEXT,
  disetujuiOleh       TEXT,
  pimpinanId          TEXT, -- referensi opaque ke data.pimpinanList lokal frontend, tidak divalidasi backend
  realisasiJumlah     INTEGER,
  realisasiTanggalISO TEXT,
  createdAt           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS RincianAnggaran (
  id          TEXT PRIMARY KEY,
  pengajuanId TEXT NOT NULL REFERENCES PengajuanAnggaran(id),
  uraian      TEXT NOT NULL,
  qty         INTEGER NOT NULL,
  hargaSatuan INTEGER NOT NULL,
  subtotal    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rincian_pengajuan ON RincianAnggaran (pengajuanId);

-- ---- Modul Admin/Kewenangan ----
-- Akun Guru/Staf sudah ada di tabel Guru di atas. Tiga tabel berikut menampung sisa data yang
-- sebelumnya hanya ada sebagai state lokal React di KewenanganPanel (Admin): daftar Unit Usaha,
-- daftar Tahun Ajaran, dan pengaturan Tampilan Aplikasi (logo/foto/warna/font).
CREATE TABLE IF NOT EXISTS UnitUsaha (
  id   TEXT PRIMARY KEY,
  nama TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS TahunAjaran (
  id         TEXT PRIMARY KEY,
  tahunMulai INTEGER NOT NULL UNIQUE,
  aktif      INTEGER NOT NULL DEFAULT 0
);

-- Pengaturan generik key-value (JSON di kolom nilai) — dipakai untuk Tampilan Aplikasi, dan bisa
-- dipakai lagi untuk pengaturan Admin lain di masa depan tanpa migrasi skema baru.
CREATE TABLE IF NOT EXISTS Pengaturan (
  kunci TEXT PRIMARY KEY,
  nilai TEXT NOT NULL
);

-- ---- Modul Unit Usaha — Katalog Produk per Bagian ----
-- Setiap bagian Unit Usaha (Kantin | Kopel | Dapur | BMT, lihat UnitUsaha) mengelola daftar item
-- & harganya sendiri lewat dashboard masing-masing. Menggantikan produkList lokal di kasir_mma
-- (app_state.dart) yang sebelumnya hardcoded di app.
CREATE TABLE IF NOT EXISTS ProdukUnitUsaha (
  id         TEXT PRIMARY KEY,
  unit       TEXT NOT NULL,   -- Kantin | Kopel | Dapur | BMT (samakan dengan UnitUsaha.nama)
  nama       TEXT NOT NULL,
  harga      INTEGER NOT NULL,
  kategori   TEXT,
  barcode    TEXT,            -- kode batang, khusus dipakai aktif oleh Kopel; unit lain boleh kosong
  aktif      INTEGER NOT NULL DEFAULT 1, -- 0 = disembunyikan dari kasir tanpa menghapus riwayat
  createdAt  TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_produk_unit ON ProdukUnitUsaha (unit);
-- Barcode wajib unik hanya dalam satu unit yang sama, dan hanya bila diisi (NULL boleh berulang).
CREATE UNIQUE INDEX IF NOT EXISTS idx_produk_unit_barcode ON ProdukUnitUsaha (unit, barcode) WHERE barcode IS NOT NULL;

