# PANDUAN PENGATURAN BACKUP TERJADWAL & PITR DI DASHBOARD RAILWAY
**Ma'had Mudaiyatul Anwar (MMA) - Infrastructure Guide**

Dokumen ini berisi panduan instruksi langkah-demi-langkah (petunjuk UI yang harus diklik) untuk mengaktifkan fitur Backup Terjadwal, Volume Backups, dan Point-in-Time Recovery (PITR) di Dashboard Railway.

---

## Langkah 1: Mengakses Service Database PostgreSQL di Railway
1. Buka browser dan masuk ke Dashboard Railway: **[https://railway.app](https://railway.app)**.
2. Login menggunakan akun Railway institusi/administrator.
3. Di halaman **Projects**, klik pada project **MMA Backend** (atau nama project Railway backend MMA Anda).
4. Pada tampilan diagram/canvas project, cari dan **klik pada card Service Database PostgreSQL** (biasanya bernama `PostgreSQL` atau `postgres`).

---

## Langkah 2: Mengaktifkan Volume Backups & Backup Automatic
1. Setelah card service `PostgreSQL` diklik, panel pengaturan service akan terbuka di sisi kanan.
2. Klik tab **"Settings"** (Ikon Roda Gigi di menu atas service).
3. Gulir halaman ke bawah (scroll down) sampai Anda menemukan bagian **"Volumes"** atau **"Backups"**.
4. Jika PostgreSQL menggunakan Railway Managed Volume:
   - Klik tab **"Volumes"**.
   - Klik tombol **"Enable Backups"** atau **"Configure Backups"**.
   - Pilih frekuensi retensi snapshot volume yang diinginkan (misal: **Daily / Every 24 Hours**).
   - Klik tombol **"Save Changes"**.

---

## Langkah 3: Mengaktifkan Point-In-Time Recovery (PITR) & Retention
1. Pada halaman **Settings** service PostgreSQL yang sama:
2. Cari bagian **"Point-in-Time Recovery (PITR)"** atau **"Database Backups"**.
3. Geser toggle switch menjadi **ON** (Enabled).
4. Tentukan **Retention Period** (misalnya **7 Days**).
5. Klik tombol **"Save"** atau **"Update Settings"**.

---

## Langkah 4: Cara Melakukan Point-In-Time Restore dari Dashboard Railway (Jika Diperlukan)
Apabila terjadi kesalahan data berat dan Anda ingin mengembalikan kondisi database persis ke jam/menit tertentu:
1. Buka Service **PostgreSQL** di Dashboard Railway.
2. Klik tab **"Backups"** atau **"Data"**.
3. Pilih opsi **"Restore to Point in Time"**.
4. Pilih tanggal & jam spesifik (Timestamp ISO/WIB) yang ingin dipulihkan.
5. Klik **"Create Restored Database"** atau **"Restore"**.
6. Railway akan otomatis membuatkan service PostgreSQL baru berisi data pada timestamp tersebut.
7. Ambil connection URL dari service baru tersebut, lalu perbarui variabel `DATABASE_URL` pada service aplikasi Node.js Anda.

---

## Langkah 5: Memeriksa Pengaturan Variabel SSL
Pastikan service PostgreSQL di Railway mengizinkan koneksi TLS/SSL:
1. Buka tab **"Variables"** pada service PostgreSQL.
2. Pastikan variabel `PGSSLMODE` bernilai `require` atau `verify-full`.
