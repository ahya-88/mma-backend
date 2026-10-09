CREATE TABLE IF NOT EXISTS "Wali" (
  "id" TEXT PRIMARY KEY,
  "nama" TEXT NOT NULL,
  "hp" TEXT,
  "username" TEXT NOT NULL UNIQUE,
  "password" TEXT NOT NULL,
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT TRUE,
  "loginFailedAttempts" INTEGER NOT NULL DEFAULT 0,
  "loginLockedUntil" TEXT,
  "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  "passwordChangedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
ALTER TABLE "Wali" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "Wali" ADD COLUMN IF NOT EXISTS "loginFailedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Wali" ADD COLUMN IF NOT EXISTS "loginLockedUntil" TEXT;
ALTER TABLE "Wali" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Wali" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TEXT;

CREATE TABLE IF NOT EXISTS "Guru" (
  "id" TEXT PRIMARY KEY,
  "nama" TEXT NOT NULL,
  "username" TEXT NOT NULL UNIQUE,
  "password" TEXT NOT NULL,
  "departemen" TEXT NOT NULL,
  "unit" TEXT,
  "jenisAkun" TEXT NOT NULL DEFAULT 'staf',
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT TRUE,
  "loginFailedAttempts" INTEGER NOT NULL DEFAULT 0,
  "loginLockedUntil" TEXT,
  "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  "passwordChangedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
ALTER TABLE "Guru" ADD COLUMN IF NOT EXISTS "jenisAkun" TEXT NOT NULL DEFAULT 'staf';
ALTER TABLE "Guru" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "Guru" ADD COLUMN IF NOT EXISTS "statusAkun" TEXT NOT NULL DEFAULT 'Aktif';
ALTER TABLE "Guru" ADD COLUMN IF NOT EXISTS "loginFailedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Guru" ADD COLUMN IF NOT EXISTS "loginLockedUntil" TEXT;
ALTER TABLE "Guru" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Guru" ADD COLUMN IF NOT EXISTS "totpSecret" TEXT;
ALTER TABLE "Guru" ADD COLUMN IF NOT EXISTS "totpEnabled" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Guru" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TEXT;
UPDATE "Guru" SET "jenisAkun" = 'superadmin' WHERE "departemen" = 'admin' AND "jenisAkun" = 'staf';

CREATE TABLE IF NOT EXISTS "Santri" (
  "id" TEXT PRIMARY KEY,
  "nama" TEXT NOT NULL,
  "kelas" TEXT,
  "nis" TEXT,
  "nisn" TEXT,
  "waliId" TEXT REFERENCES "Wali"("id"),
  "saldo" BIGINT NOT NULL DEFAULT 0,
  "limitJajanHarian" BIGINT,
  "durasiBlokirHari" INTEGER,
  "blokirAktif" INTEGER NOT NULL DEFAULT 0,
  "blokirSejakISO" TEXT,
  "blokirSampaiISO" TEXT,
  "blokirAlasan" TEXT,
  "jenisKelamin" TEXT,
  "tempatLahir" TEXT,
  "tanggalLahir" TEXT,
  "alamat" TEXT,
  "asrama" TEXT,
  "golDarah" TEXT,
  "noDarurat" TEXT,
  "catatanKesehatan" TEXT,
  "halaqoh" TEXT,
  "foto" TEXT,
  "namaAyah" TEXT,
  "namaIbu" TEXT,
  "asalSekolah" TEXT,
  "programPilihan" TEXT,
  "citaCita" TEXT,
  "pendidikanSD" TEXT,
  "tahunSD" TEXT,
  "pendidikanSMP" TEXT,
  "tahunSMP" TEXT,
  "pendidikanSMA" TEXT,
  "tahunSMA" TEXT,
  "riwayatKelas" TEXT,
  "pinHash" TEXT,
  "pinGagal" INTEGER NOT NULL DEFAULT 0,
  "pinKunciSampai" TEXT,
  "kartuToken" TEXT,
  "kartuTerbit" TEXT,
  "faceEmbedding" TEXT,
  "is_deleted" BOOLEAN DEFAULT FALSE,
  "updatedAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS "FaceTemplate" (
  "id" BIGSERIAL PRIMARY KEY,
  "santriId" TEXT NOT NULL,
  "embedding" TEXT NOT NULL,
  "sumber" TEXT NOT NULL CHECK ("sumber" IN ('foto', 'kamera')),
  "modelVersion" TEXT NOT NULL,
  "dibuatOleh" TEXT,
  "dibuatPada" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_face_template_santri ON "FaceTemplate" ("santriId");

CREATE TABLE IF NOT EXISTS "LogWajah" (
  "id" BIGSERIAL PRIMARY KEY,
  "waktu" TEXT NOT NULL,
  "petugasId" TEXT,
  "unit" TEXT,
  "terbaikId" TEXT,
  "skorTerbaik" REAL,
  "skorKedua" REAL,
  "dikonfirmasiId" TEXT,
  "metode" TEXT,
  "ms" INTEGER,
  "jumlahFrame" INTEGER
);

CREATE TABLE IF NOT EXISTS "TransaksiCashless" (
  "id" TEXT PRIMARY KEY,
  "santriId" TEXT NOT NULL REFERENCES "Santri"("id"),
  "unit" TEXT NOT NULL,
  "jenis" TEXT NOT NULL,
  "kategori" TEXT,
  "subKategori" TEXT,
  "jumlah" BIGINT NOT NULL,
  "keterangan" TEXT,
  "saldoSetelah" BIGINT NOT NULL,
  "saldoSebelum" BIGINT,
  "saldoSesudah" BIGINT,
  "idempotencyKey" TEXT,
  "tanggalISO" TEXT NOT NULL,
  "tanggalLabel" TEXT NOT NULL,
  "bulan" TEXT NOT NULL,
  "metode" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
ALTER TABLE "TransaksiCashless" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "TransaksiCashless" ADD COLUMN IF NOT EXISTS "saldoSebelum" BIGINT;
ALTER TABLE "TransaksiCashless" ADD COLUMN IF NOT EXISTS "saldoSesudah" BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transaksi_idempotency_key ON "TransaksiCashless" ("idempotencyKey");
CREATE INDEX IF NOT EXISTS idx_transaksi_santri_tanggal ON "TransaksiCashless" ("santriId", "tanggalISO");

CREATE TABLE IF NOT EXISTS "TransaksiCashlessIdempotency" (
  "idempotencyKey" TEXT PRIMARY KEY,
  "requestHash" TEXT,
  "statusCode" INTEGER,
  "response" JSONB,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
ALTER TABLE "TransaksiCashlessIdempotency" ADD COLUMN IF NOT EXISTS "requestHash" TEXT;
ALTER TABLE "TransaksiCashlessIdempotency" ADD COLUMN IF NOT EXISTS "statusCode" INTEGER;
CREATE INDEX IF NOT EXISTS idx_transaksi_idempotency_created ON "TransaksiCashlessIdempotency" ("createdAt");

CREATE TABLE IF NOT EXISTS "Ledger" (
  "id" TEXT PRIMARY KEY,
  "santriId" TEXT NOT NULL REFERENCES "Santri"("id"),
  "jenis" TEXT NOT NULL,
  "jumlah" BIGINT NOT NULL,
  "saldoSetelah" BIGINT NOT NULL,
  "referensi" TEXT,
  "pelaku" TEXT,
  "waktu" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_santri ON "Ledger" ("santriId");
CREATE INDEX IF NOT EXISTS idx_ledger_waktu ON "Ledger" ("waktu");

CREATE TABLE IF NOT EXISTS "LogPin" (
  "id" BIGSERIAL PRIMARY KEY,
  "santriId" TEXT NOT NULL REFERENCES "Santri"("id"),
  "unit" TEXT NOT NULL,
  "petugasId" TEXT,
  "hasil" TEXT NOT NULL,
  "waktu" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS "PermintaanBMT" (
  "id" TEXT PRIMARY KEY,
  "santriId" TEXT NOT NULL REFERENCES "Santri"("id"),
  "waliId" TEXT NOT NULL REFERENCES "Wali"("id"),
  "jenis" TEXT NOT NULL,
  "nilaiDiminta" BIGINT,
  "alasan" TEXT NOT NULL,
  "buktiTransfer" TEXT,
  "status" TEXT NOT NULL DEFAULT 'Menunggu',
  "tanggalAjukan" TEXT NOT NULL,
  "tanggalDiproses" TEXT,
  "diprosesOleh" TEXT,
  "catatanBMT" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
ALTER TABLE "PermintaanBMT" ADD COLUMN IF NOT EXISTS "buktiHash" TEXT;
ALTER TABLE "PermintaanBMT" ADD COLUMN IF NOT EXISTS "nominalDisetujui" BIGINT;
ALTER TABLE "PermintaanBMT" ADD COLUMN IF NOT EXISTS "referensiMutasi" TEXT;
ALTER TABLE "PermintaanBMT" ADD COLUMN IF NOT EXISTS "diprosesPada" TEXT;
ALTER TABLE "PermintaanBMT" ADD COLUMN IF NOT EXISTS "perluPersetujuanKedua" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "PermintaanBMT" ADD COLUMN IF NOT EXISTS "diprosesPertamaOleh" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_permintaan_bukti_hash_unique
  ON "PermintaanBMT" ("buktiHash")
  WHERE "jenis" = 'Top Up Saldo' AND "status" <> 'Ditolak' AND "buktiHash" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_permintaan_santri_wali_status
  ON "PermintaanBMT" ("santriId", "waliId", "status");

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT PRIMARY KEY,
  "waktu" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  "aktorId" TEXT,
  "aktorRole" TEXT NOT NULL,
  "aksi" TEXT NOT NULL,
  "targetTipe" TEXT NOT NULL,
  "targetId" TEXT,
  "ip" TEXT,
  "detail" JSONB NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "ip" TEXT;
CREATE INDEX IF NOT EXISTS idx_audit_waktu ON "AuditLog" ("waktu");
CREATE INDEX IF NOT EXISTS idx_audit_aksi_waktu ON "AuditLog" ("aksi", "waktu");

CREATE TABLE IF NOT EXISTS "Absensi" (
  "id" TEXT PRIMARY KEY,
  "santriId" TEXT NOT NULL REFERENCES "Santri"("id"),
  "tanggalISO" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "keterangan" TEXT,
  "dicatatOleh" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX IF NOT EXISTS idx_absensi_santri_tanggal ON "Absensi" ("santriId", "tanggalISO");

CREATE TABLE IF NOT EXISTS "Perizinan" (
  "id" TEXT PRIMARY KEY,
  "santriId" TEXT NOT NULL REFERENCES "Santri"("id"),
  "jenis" TEXT NOT NULL,
  "tanggalKeluar" TEXT NOT NULL,
  "tanggalKembali" TEXT,
  "alasan" TEXT,
  "status" TEXT NOT NULL DEFAULT 'Menunggu',
  "diajukanOleh" TEXT,
  "disetujuiOleh" TEXT,
  "tanggalProses" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX IF NOT EXISTS idx_perizinan_santri ON "Perizinan" ("santriId");

CREATE TABLE IF NOT EXISTS "Pelanggaran" (
  "id" TEXT PRIMARY KEY,
  "santriId" TEXT NOT NULL REFERENCES "Santri"("id"),
  "jenis" TEXT NOT NULL,
  "poin" INTEGER NOT NULL DEFAULT 0,
  "tanggalISO" TEXT NOT NULL,
  "keterangan" TEXT,
  "dicatatOleh" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX IF NOT EXISTS idx_pelanggaran_santri ON "Pelanggaran" ("santriId");

CREATE TABLE IF NOT EXISTS "Nilai" (
  "id" TEXT PRIMARY KEY,
  "santriId" TEXT NOT NULL REFERENCES "Santri"("id"),
  "mapel" TEXT NOT NULL,
  "nilai" INTEGER NOT NULL,
  "tanggalISO" TEXT NOT NULL,
  "dicatatOleh" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX IF NOT EXISTS idx_nilai_santri ON "Nilai" ("santriId");

CREATE TABLE IF NOT EXISTS "Prestasi" (
  "id" TEXT PRIMARY KEY,
  "santriId" TEXT NOT NULL REFERENCES "Santri"("id"),
  "judul" TEXT NOT NULL,
  "tingkat" TEXT,
  "tanggalISO" TEXT NOT NULL,
  "dicatatOleh" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX IF NOT EXISTS idx_prestasi_santri ON "Prestasi" ("santriId");

CREATE TABLE IF NOT EXISTS "Hafalan" (
  "id" TEXT PRIMARY KEY,
  "santriId" TEXT NOT NULL REFERENCES "Santri"("id"),
  "juz" TEXT NOT NULL,
  "tanggalISO" TEXT NOT NULL,
  "dicatatOleh" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX IF NOT EXISTS idx_hafalan_santri ON "Hafalan" ("santriId");

CREATE TABLE IF NOT EXISTS "PenilaianUbudiyah" (
  "id" TEXT PRIMARY KEY,
  "santriId" TEXT NOT NULL REFERENCES "Santri"("id"),
  "jenis" TEXT NOT NULL,
  "materi" TEXT,
  "predikat" TEXT NOT NULL,
  "catatan" TEXT,
  "tanggalISO" TEXT NOT NULL,
  "dicatatOleh" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX IF NOT EXISTS idx_ubudiyah_santri ON "PenilaianUbudiyah" ("santriId");

CREATE TABLE IF NOT EXISTS "Tagihan" (
  "id" TEXT PRIMARY KEY,
  "santriId" TEXT NOT NULL REFERENCES "Santri"("id"),
  "jenis" TEXT NOT NULL,
  "jumlah" BIGINT NOT NULL,
  "bulan" TEXT NOT NULL,
  "jumlahDibayar" BIGINT NOT NULL DEFAULT 0,
  "tanggalBayarISO" TEXT,
  "dicatatOleh" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX IF NOT EXISTS idx_tagihan_santri ON "Tagihan" ("santriId");

CREATE TABLE IF NOT EXISTS "Cashflow" (
  "id" TEXT PRIMARY KEY,
  "bulan" TEXT NOT NULL,
  "tanggalISO" TEXT NOT NULL,
  "jenis" TEXT NOT NULL,
  "kategori" TEXT NOT NULL,
  "unit" TEXT,
  "jumlah" BIGINT NOT NULL,
  "keterangan" TEXT,
  "dicatatOleh" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
ALTER TABLE "Cashflow" ADD COLUMN IF NOT EXISTS "unit" TEXT;
CREATE INDEX IF NOT EXISTS idx_cashflow_bulan ON "Cashflow" ("bulan");
CREATE INDEX IF NOT EXISTS idx_cashflow_unit ON "Cashflow" ("unit");

CREATE TABLE IF NOT EXISTS "TransaksiUnitUsaha" (
  "id" TEXT PRIMARY KEY,
  "jenis" TEXT NOT NULL,
  "unitAsal" TEXT,
  "unitTujuan" TEXT,
  "jumlah" BIGINT NOT NULL,
  "keterangan" TEXT,
  "dicatatOleh" TEXT,
  "tanggalISO" TEXT NOT NULL,
  "bulan" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX IF NOT EXISTS idx_transaksi_unit_asal ON "TransaksiUnitUsaha" ("unitAsal");
CREATE INDEX IF NOT EXISTS idx_transaksi_unit_tujuan ON "TransaksiUnitUsaha" ("unitTujuan");

CREATE TABLE IF NOT EXISTS "PengajuanAnggaran" (
  "id" TEXT PRIMARY KEY,
  "namaKegiatan" TEXT NOT NULL,
  "unitPengaju" TEXT,
  "ketuaBagianNama" TEXT,
  "kategori" TEXT NOT NULL,
  "bulanRencana" TEXT NOT NULL,
  "catatan" TEXT,
  "totalAnggaran" BIGINT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Diajukan',
  "tanggalPengajuanISO" TEXT NOT NULL,
  "diajukanOleh" TEXT,
  "tanggalKeputusanISO" TEXT,
  "disetujuiOleh" TEXT,
  "pimpinanId" TEXT,
  "realisasiJumlah" BIGINT,
  "realisasiTanggalISO" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS "RincianAnggaran" (
  "id" TEXT PRIMARY KEY,
  "pengajuanId" TEXT NOT NULL REFERENCES "PengajuanAnggaran"("id"),
  "uraian" TEXT NOT NULL,
  "qty" INTEGER NOT NULL,
  "hargaSatuan" BIGINT NOT NULL,
  "subtotal" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rincian_pengajuan ON "RincianAnggaran" ("pengajuanId");

CREATE TABLE IF NOT EXISTS "UnitUsaha" (
  "id" TEXT PRIMARY KEY,
  "nama" TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS "TahunAjaran" (
  "id" TEXT PRIMARY KEY,
  "tahunMulai" INTEGER NOT NULL UNIQUE,
  "aktif" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "Pengaturan" (
  "kunci" TEXT PRIMARY KEY,
  "nilai" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "AdminConfig" (
  "kunci" TEXT PRIMARY KEY,
  "nilai" TEXT NOT NULL,
  "updatedAt" TEXT
);

CREATE TABLE IF NOT EXISTS "ProdukUnitUsaha" (
  "id" TEXT PRIMARY KEY,
  "unit" TEXT NOT NULL,
  "nama" TEXT NOT NULL,
  "harga" BIGINT NOT NULL,
  "kategori" TEXT,
  "barcode" TEXT,
  "stok" INTEGER NOT NULL DEFAULT 0,
  "aktif" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  "updatedAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
ALTER TABLE "ProdukUnitUsaha" ADD COLUMN IF NOT EXISTS "stok" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "RiwayatStokOpname" (
  "id" TEXT PRIMARY KEY,
  "produkId" TEXT NOT NULL REFERENCES "ProdukUnitUsaha"("id") ON DELETE CASCADE,
  "unit" TEXT NOT NULL,
  "stokSebelum" INTEGER NOT NULL,
  "stokFisik" INTEGER NOT NULL,
  "selisih" INTEGER NOT NULL,
  "alasan" TEXT NOT NULL,
  "catatan" TEXT,
  "petugasNama" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX IF NOT EXISTS idx_stok_opname_unit ON "RiwayatStokOpname" ("unit");
CREATE INDEX IF NOT EXISTS idx_stok_opname_produk ON "RiwayatStokOpname" ("produkId");

CREATE INDEX IF NOT EXISTS idx_produk_unit ON "ProdukUnitUsaha" ("unit");
CREATE UNIQUE INDEX IF NOT EXISTS idx_produk_unit_barcode ON "ProdukUnitUsaha" ("unit", "barcode") WHERE "barcode" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_santri_kartu_token ON "Santri" ("kartuToken") WHERE "kartuToken" IS NOT NULL;
DROP INDEX IF EXISTS idx_santri_face_embed;
DROP INDEX IF EXISTS idx_santri_foto;
CREATE INDEX IF NOT EXISTS idx_santri_face_embed_present ON "Santri" ("id") WHERE "faceEmbedding" IS NOT NULL AND "faceEmbedding" != '';
CREATE INDEX IF NOT EXISTS idx_santri_foto_present ON "Santri" ("id") WHERE "foto" IS NOT NULL AND "foto" != '';
CREATE INDEX IF NOT EXISTS idx_santri_nama ON "Santri" ("nama");
CREATE INDEX IF NOT EXISTS idx_santri_nis ON "Santri" ("nis");
CREATE INDEX IF NOT EXISTS idx_santri_wali ON "Santri" ("waliId");
CREATE INDEX IF NOT EXISTS idx_santri_kelas ON "Santri" ("kelas");
CREATE INDEX IF NOT EXISTS idx_permintaan_status ON "PermintaanBMT" ("status");
CREATE INDEX IF NOT EXISTS idx_permintaan_created ON "PermintaanBMT" ("createdAt");
CREATE INDEX IF NOT EXISTS idx_tagihan_bulan ON "Tagihan" ("bulan");
CREATE INDEX IF NOT EXISTS idx_cashflow_jenis_kategori ON "Cashflow" ("jenis", "kategori");
CREATE INDEX IF NOT EXISTS idx_anggaran_status ON "PengajuanAnggaran" ("status");

-- ---- Modul Impor Data Bertahap & Provisioning (FASE 2) ----
CREATE TABLE IF NOT EXISTS "BatchImpor" (
  "id" TEXT PRIMARY KEY,
  "namaBatch" TEXT NOT NULL,
  "sumber" TEXT NOT NULL DEFAULT 'excel',
  "jumlahSantri" INTEGER NOT NULL DEFAULT 0,
  "jumlahWali" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'Berhasil',
  "dibuatOleh" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS "RekonsiliasiImpor" (
  "id" TEXT PRIMARY KEY,
  "batchId" TEXT NOT NULL REFERENCES "BatchImpor"("id"),
  "tipe" TEXT NOT NULL,
  "totalNominalInput" BIGINT NOT NULL,
  "totalNominalTerproses" BIGINT NOT NULL,
  "jumlahRecord" INTEGER NOT NULL,
  "selisih" BIGINT NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL,
  "catatan" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

-- ---- Antrian Kasir Offline (FASE 4) ----
CREATE TABLE IF NOT EXISTS "QueueOfflineKasir" (
  "id" TEXT PRIMARY KEY,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "unit" TEXT NOT NULL,
  "santriId" TEXT NOT NULL REFERENCES "Santri"("id"),
  "jenis" TEXT NOT NULL,
  "jumlah" BIGINT NOT NULL,
  "keterangan" TEXT,
  "kasirId" TEXT,
  "statusSync" TEXT NOT NULL DEFAULT 'Menunggu',
  "pesanError" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  "syncedAt" TEXT
);
CREATE INDEX IF NOT EXISTS idx_offline_queue_status ON "QueueOfflineKasir" ("statusSync");

ALTER TABLE "Wali" ADD COLUMN IF NOT EXISTS "statusAkun" TEXT NOT NULL DEFAULT 'Belum Aktivasi';
ALTER TABLE "Wali" ADD COLUMN IF NOT EXISTS "importBatchId" TEXT REFERENCES "BatchImpor"("id");
ALTER TABLE "Santri" ADD COLUMN IF NOT EXISTS "importBatchId" TEXT REFERENCES "BatchImpor"("id");
ALTER TABLE "Santri" ADD COLUMN IF NOT EXISTS "statusSantri" TEXT NOT NULL DEFAULT 'Aktif';
ALTER TABLE "Santri" ADD COLUMN IF NOT EXISTS "alumniTahunLulus" TEXT;
ALTER TABLE "Santri" ADD COLUMN IF NOT EXISTS "alumniStatusSaatIni" TEXT;
ALTER TABLE "Santri" ADD COLUMN IF NOT EXISTS "alumniInstansiTujuan" TEXT;
ALTER TABLE "Santri" ADD COLUMN IF NOT EXISTS "alumniNoHp" TEXT;

CREATE TABLE IF NOT EXISTS "PendaftaranUlang" (
  "id" TEXT PRIMARY KEY,
  "santriId" TEXT NOT NULL REFERENCES "Santri"("id") ON DELETE CASCADE,
  "tahunAjaranId" TEXT NOT NULL REFERENCES "TahunAjaran"("id") ON DELETE CASCADE,
  "kelasBaru" TEXT NOT NULL,
  "kelasSebelumnya" TEXT,
  "asramaBaru" TEXT,
  "asramaSebelumnya" TEXT,
  "halaqohBaru" TEXT,
  "status" TEXT NOT NULL DEFAULT 'Terdaftar',
  "keterangan" TEXT,
  "diprosesOleh" TEXT,
  "tanggalDaftarUlang" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  CONSTRAINT "uq_pendaftaran_santri_tahun" UNIQUE ("santriId", "tahunAjaranId")
);
CREATE INDEX IF NOT EXISTS idx_daftarulang_tahun ON "PendaftaranUlang" ("tahunAjaranId");
CREATE INDEX IF NOT EXISTS idx_daftarulang_santri ON "PendaftaranUlang" ("santriId");

-- Admin dilebur ke Superadmin (keputusan 4 Okt 2026): akun lama berjenis 'admin' menjadi 'superadmin'.
-- Idempotent: setelah dijalankan sekali, tidak ada baris 'admin' tersisa. Setiap akun yang dimigrasikan dicatat di AuditLog.
INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
SELECT gen_random_uuid()::text, NULL, 'system', 'admin.role_merged_to_superadmin', 'Guru', "id",
  jsonb_build_object('jenisAkunSebelum', 'admin', 'jenisAkunSesudah', 'superadmin')
FROM "Guru" WHERE "jenisAkun" = 'admin';
UPDATE "Guru" SET "jenisAkun" = 'superadmin' WHERE "jenisAkun" = 'admin';

