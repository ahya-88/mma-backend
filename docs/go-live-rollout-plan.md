# RENCANA PELUNCURAN BERGELOMBANG (PHASED GO-LIVE ROLLOUT PLAN)

Sistem Informasi Terpadu MMA dirancang untuk diluncurkan secara bertahap dalam 3 gelombang (*waves*) guna meminimalkan risiko operasional, memastikan stabilitas server, dan menjaga akurasi data.

---

## 1. STRATEGI GELOMBANG GO-LIVE

### 🌊 GELOMBANG 1: PILOT (1 KELAS / ANGKATAN PERTAMA)
- **Cakupan**: 1 Kelas Pilot (misal Kelas 7A, ~30–40 santri, 30–40 wali, 10 staf terkait).
- **Aktivitas**:
  1. Jalankan pembersihan data demo (`POST /api/admin/bersihkan-demo`).
  2. Impor data Excel Kelas 7A via *dry-run* lalu *eksekusi batch*.
  3. Cetak lembar akun wali pertama dan bagikan kredensial awal.
  4. Aktifkan transaksi cashless di 1 Kantin pilot.
- **Kriteria Lolos (*Exit Criteria*)**:
  - Error rate < 0,5% selama 3 hari berturut-turut.
  - 100% Wali Pilot berhasil melakukan login pertama dan ganti password.
  - 0 insiden selisih saldo cashless.

---

### 🌊 GELOMBANG 2: EXPANSION PER ANGKATAN (JENJANG SMP/MTS & SMA/MA)
- **Cakupan**: Penambahan angkatan bertahap (Kelas 7B–9B, lalu Kelas 10A–12B; ~300–600 santri).
- **Aktivitas**:
  1. Impor Excel per angkatan dengan laporan dry-run.
  2. Provisioning akun wali per batch.
  3. Penautan manual anak kedua (kakak-adik) jika wali sudah terdaftar di Gelombang 1.
  4. Rekonsiliasi saldo & tagihan awal per batch.
  5. Perluasan cashless ke seluruh unit usaha (Kantin, Kopel, BMT).
- **Kriteria Lolos (*Exit Criteria*)**:
  - Latency p95 endpoint baca < 800 ms pada puncak login wali.
  - Puncak transaksi cashless paralel di kasir berjalan lancar tanpa *double-debit*.
  - Pemulihan *offline queue* kasir terverifikasi 100% sukses.

---

### 🌊 GELOMBANG 3: SKALA PENUH (2.000 SANTRI, 2.000 WALI, 50 STAF)
- **Cakupan**: Seluruh santri pesantren (2.000 santri, 2.000 wali, 50 staf semua departemen).
- **Aktivitas**:
  1. Impor data kelas tersisa.
  2. Pengikatan penuh modul Rapor, Absensi, Perizinan, Pelanggaran, LPTQ, Keuangan, dan BMT.
  3. Pengawasan dashboard kelengkapan data harian oleh Sekretariat.
- **Kriteria Lolos (*Exit Criteria*)**:
  - p95 respons < 800 ms saat pengumuman rapor massal.
  - Ketersediaan sistem (*uptime*) >= 99,9%.

---

## 2. AMBANG BATAS KAPASITAS & REKOMENDASI NAİK PAKET (HOSTING THRESHOLDS)

### 🐘 NEON POSTGRESQL (DATABASE)
- **Paket Awal (Free / Starter)**:
  - *Kapasitas*: Storage 0.5 GB, Compute 0.25 CU (autosuspend 5 menit).
  - *Ambang Naik Paket*:
    - Storage mencapai **800 MB** (> 80% limit).
    - Koneksi aktif mencapai **> 15 koneksi** simultan.
    - Sering terjadi *cold-start delay* > 2 detik saat login wali massal.
- **Rekomendasi Paket Scale Up (Neon Launch / Scale)**:
  - *Kapasitas*: Storage 10 GB+, Compute 1–2 CU, *Autosuspend* diatur ke **15–30 menit** atau dinonaktifkan saat jam operasional pesantren (06.00–21.00 WIB).

### 🚀 RAILWAY APPLICATION SERVICE (NODE.JS SERVER)
- **Paket Awal (Hobby / Standard)**:
  - *Kapasitas*: 512 MB RAM, 1 vCPU.
  - *Ambang Naik Paket*:
    - Penggunaan RAM mencapai **> 400 MB** (> 80% limit).
    - CPU Usage mencapai **> 80%** selama lebih dari 3 menit berturut-turut.
- **Rekomendasi Paket Scale Up (Railway Pro)**:
  - *Kapasitas*: 2 GB RAM, 2 vCPU, `PG_POOL_MAX = 20`.

---

## 3. PROSEDUR ROLLBACK BATCH & RUNBOOK INSIDEN

1. **Rollback Batch Impor**:
   - Jika terjadi kesalahan impor data pada suatu kelas, jalankan `POST /api/admin/impor/rollback/:batchId`.
   - Sistem akan menghapus data santri/wali yang diimpor pada batch tersebut selama belum memiliki transaksi cashless aktif.

2. **Insiden Putus Jaringan Kasir**:
   - Terminal kasir beralih otomatis ke *Mode Offline*.
   - Transaksi disimpan sementara di penyimpanan lokal terminal (*IndexedDB*).
   - Setelah internet terhubung kembali, kasir menekan tombol "Sinkronkan Transaksi Offline" (`POST /api/transaksi/sync-offline`). Idempotency Key menjamin pemotongan saldo tidak terulang.

3. **Insiden Kegagalan Server / Database**:
   - Jalankan pemulihan berbasis *PITR (Point-In-Time Recovery)* pada dashboard Neon ke waktu 5 menit sebelum insiden.
   - Atau restore dump terakhir menggunakan `pg_restore` ke instance staging/produksi baru dengan target RTO < 3 jam sesuai `docs/security-operations.md`.
