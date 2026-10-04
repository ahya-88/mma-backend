# PANDUAN OPERATOR SEKRETARIAT - IMPOR DATA BERTAHAP & PROVISIONING AKUN

Dokumentasi alur kerja operator Sekretariat / Admin untuk pengelolaan data santri bertahap dan provisioning akun wali.

---

## 1. IMPOR DATA SANTRI DARI EXCEL BERTAHAP

1. **Persiapan Berkas Excel**:
   - Gunakan format template resmi `Database_Pondok_Mudaiyatul_Anwar.xlsx`.
   - Pastikan kolom wajib terisi: `nama`, `nis`, `kelas`.
   - Kolom opsional: `nisn`, `jenisKelamin` (L/P), `tanggalLahir` (YYYY-MM-DD), `namaWali`, `hpWali`.

2. **Jalankan Uji Coba (*Dry-Run*)**:
   - Kirim berkas ke endpoint `POST /api/admin/impor/dry-run`.
   - Periksa laporan pra-impor:
     - `jumlahValid`: Jumlah baris yang siap diimpor.
     - `jumlahGagal`: Baris bermasalah (misal NIS duplikat atau format tanggal salah).
     - `jumlahBaru` vs `jumlahUpdate`: Berapa data baru vs data yang memperbarui santri lama.
   - **Atasi semua baris gagal pada Excel sebelum melanjutkan!**

3. **Eksekusi Batch Impor**:
   - Kirim data ke `POST /api/admin/impor/eksekusi` dengan `namaBatch` (misal: "Kelas 7A Angkatan 2026").
   - Sistem akan menyimpan data santri, membuat akun Wali baru yang belum ada, dan mencatat `batchId`.

4. **Rollback Batch (Jika Terjadi Kesalahan)**:
   - Jika batch baru saja diimpor dan terdeteksi kesalahan data, Superadmin dapat melakukan rollback via `POST /api/admin/impor/rollback/:batchId`.
   - *Catatan*: Batch tidak dapat di-rollback jika santri di dalamnya sudah pernah melakukan transaksi cashless.

---

## 2. PROVISIONING AKUN WALI & CETAK LEMBAR KREDENSIAL

1. **Pembuatan Akun Wali Bertahap**:
   - Eksekusi `POST /api/admin/wali/provision-batch` dengan memasukkan `batchId` atau daftar `santriIds`.
   - Sistem membuat akun Wali dengan username `wali.<nis>` dan password sekali pakai 8 karakter acak.

2. **Cetak Lembar Akun Wali**:
   - Kredensial awal (username + password sekali pakai) hanya ditampilkan **satu kali** saat pembuatan.
   - Cetak lembar akun per kelas dan bagikan secara fisik/terbatas kepada wali santri yang bersangkutan.

---

## 3. PENAUTAN ANAK KEDUA (KAKAK-ADIK)

1. Ketika ada santri baru yang merupakan adik dari santri lama yang sudah memiliki Wali:
2. Operator mencari ID/nama Wali lama melalui menu pencarian Wali di Sekretariat.
3. Jalankan `POST /api/admin/wali/tautkan-anak` dengan payload `{ santriId: "ID_ADIK", waliId: "ID_WALI_LAMA" }`.
4. Sistem akan menautkan santri adik ke akun Wali yang sama tanpa membuat akun Wali ganda.

---

## 4. REKONSILIASI SALDO AWAL CASHLESS & TAGIHAN

1. Saat mengimpor saldo awal BMT atau tagihan awal santri per batch:
2. Hitung total uang fisik/rekening kas BMT yang diterima.
3. Kirim data ke `POST /api/admin/impor/rekonsiliasi` dengan parameter `totalKasTarget`.
4. **Proteksi Rekonsiliasi**:
   - Jika total nominal input Excel == target kas (`selisih === 0`), saldo berhasil diaplikaskan.
   - Jika terjadi selisih (`selisih !== 0`), sistem secara otomatis **menolak dan membatalkan** seluruh transaksi impor tersebut.

---

## 5. DASHBOARD KELENGKAPAN DATA

1. Buka menu **Dashboard Kelengkapan Data** (`GET /api/admin/kelengkapan-data`).
2. Tinjau persentase kelengkapan per kelas:
   - % Memiliki Wali
   - % Akun Wali Aktif (sudah ganti password)
   - % Memiliki Foto Biometrik
   - % Memiliki NISN
3. Tindak lanjuti daftar santri/wali yang belum lengkap dari tabel rincian.
