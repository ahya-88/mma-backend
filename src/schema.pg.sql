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
ALTER TABLE "Guru" ADD COLUMN IF NOT EXISTS "loginFailedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Guru" ADD COLUMN IF NOT EXISTS "loginLockedUntil" TEXT;
ALTER TABLE "Guru" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;
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
  "response" JSONB,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

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
  "detail" JSONB NOT NULL DEFAULT '{}'::jsonb
);
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
  "jumlah" BIGINT NOT NULL,
  "keterangan" TEXT,
  "dicatatOleh" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX IF NOT EXISTS idx_cashflow_bulan ON "Cashflow" ("bulan");

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
  "aktif" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  "updatedAt" TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX IF NOT EXISTS idx_produk_unit ON "ProdukUnitUsaha" ("unit");
CREATE UNIQUE INDEX IF NOT EXISTS idx_produk_unit_barcode ON "ProdukUnitUsaha" ("unit", "barcode") WHERE "barcode" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_santri_kartu_token ON "Santri" ("kartuToken") WHERE "kartuToken" IS NOT NULL;
DROP INDEX IF EXISTS idx_santri_face_embed;
DROP INDEX IF EXISTS idx_santri_foto;
CREATE INDEX IF NOT EXISTS idx_santri_face_embed_present ON "Santri" ("id") WHERE "faceEmbedding" IS NOT NULL AND "faceEmbedding" != '';
CREATE INDEX IF NOT EXISTS idx_santri_foto_present ON "Santri" ("id") WHERE "foto" IS NOT NULL AND "foto" != '';
CREATE INDEX IF NOT EXISTS idx_santri_nama ON "Santri" ("nama");
CREATE INDEX IF NOT EXISTS idx_santri_nis ON "Santri" ("nis");