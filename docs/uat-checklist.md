# CHECKLIST USER ACCEPTANCE TESTING (UAT) - SISTEM TERPADU MMA

Panduan pengujian penerimaan pengguna (*User Acceptance Testing*) per departemen/peran sebelum peluncuran bertahap (*phased rollout*).

---

## 1. SEKRETARIAT & ADMIN
- [ ] **Impor Batch Excel**: Menjalankan *dry-run* impor file Excel kelas 7A, memastikan tidak ada error validasi atau duplikat NIS/NISN.
- [ ] **Provisioning Akun Wali**: Menjalankan pembutan akun wali bertahap per batch, mencetak lembar kredensial awal (username `wali.<nis>` & password sekali pakai).
- [ ] **Penautan Anak Kedua (Kakak-Adik)**: Menautkan santri adik ke akun wali kakak yang sudah terdaftar melalui pencarian nama/HP wali di Sekretariat.
- [ ] **Dashboard Kelengkapan Data**: Memeriksa kelengkapan data santri (wali, foto, NISN, biodata) per kelas di dashboard Sekretariat.
- [ ] **Pembersihan Data Demo**: Menjalankan prosedur hapus data demo pra-go-live dengan konfirmasi eksplisit.

---

## 2. PENGASUHAN
- [ ] **Absensi Harian**: Mengisi rekap absensi per kelas (Hadir, Izin, Sakit, Alpa) dan menguji pembaruan status harian.
- [ ] **Perizinan Santri**: Menginput dan memproses permohonan izin keluar/pulang santri (Disetujui / Ditolak).
- [ ] **Pelanggaran & Poin**: Catat poin pelanggaran santri dan pastikan rekap total poin terakumulasi dengan benar.

---

## 3. PENGAJARAN (AKADEMIK)
- [ ] **Input Nilai Mata Pelajaran**: Input nilai pelajaran per santri dan per kelas.
- [ ] **Prestasi Santri**: Pencatatan prestasi akademik/non-akademik santri beserta tingkat kejuaraan.
- [ ] **Cetak Rapor Ringkas**: Menguji pembukaan rapor ringkas santri (pembacaan cepat < 800 ms) tanpa memuat data santri lain secara tidak efisien.

---

## 4. LPTQ (AL-QUR'AN & UBUDIYAH)
- [ ] **Setoran Hafalan Al-Qur'an**: Menginput capaian hafalan juz/surah santri.
- [ ] **Penilaian Ubudiyah**: Mengisi penilaian bacaan shalat, wudhu, dan ibadah harian santri.

---

## 5. KEUANGAN & ADMINISTRASI
- [ ] **Pembuatan Tagihan**: Membuat tagihan bulanan (Syahriyah, Kegiatan, dll.) untuk satu kelas secara massal.
- [ ] **Pencatatan Pembayaran**: Menginput pembayaran tagihan santri dan memastikan penerbitan kuitansi/bukti bayar.
- [ ] **Pengajuan & Realisasi Anggaran**: Memproses alur pengajuan anggaran kegiatan hingga realisasi dan pencatatan cashflow.
- [ ] **Rekonsiliasi Impor Tagihan Awal**: Menguji impor saldo/tagihan awal bertahap dan memastikan sistem menolak jika terjadi selisih nominal dengan kas/bank.

---

## 6. UNIT USAHA & BMT (CASHLESS)
- [ ] **Transaksi Kasir Cashless (QR & Manual)**: Menerima transaksi debit santri di Kantin/Kopel menggunakan kartu QR atau pencarian manual.
- [ ] **Proteksi Limit Jajan & Blokir Otomatis**: Memastikan santri yang melebihi limit jajan harian diblokir otomatis dan tidak dapat bertransaksi.
- [ ] **Antrian Kasir Offline**: Menguji transaksi saat internet terputus dan memverifikasi sinkronisasi ulang saat terhubung kembali tanpa duplikasi debit (*idempotent*).
- [ ] **Top Up Saldo & Verifikasi Bukti**: Menguji pengajuan top up oleh wali, pemeriksaan bukti transfer unik (`buktiHash`), dan persetujuan staf BMT.
- [ ] **Audit Ledger Saldo**: Menguji endpoint `/audit-saldo` dan memastikan total saldo tersimpan di tabel santri cocok 100% dengan akumulasi ledger transaksi.

---

## 7. WALI SANTRI
- [ ] **Login Pertama & Ganti Password**: Login menggunakan kredensial sekali pakai dari lembar akun dan melakukan penggantian password awal wajib.
- [ ] **Dashboard Wali**: Melihat saldo cashless anak, riwayat transaksi jajan, rekap absensi, dan nilai rapor.
- [ ] **Pengajuan Top Up**: Mengunggah foto bukti transfer top up saldo BMT untuk anaknya.
- [ ] **Akses Multi-Anak (Kakak-Adik)**: Wali yang memiliki lebih dari satu anak dapat beralih tampilan antar anak tanpa perlu keluar akun.
- [ ] **Uji Isolasi Akses**: Memastikan Wali tidak dapat melihat data santri milik orang lain (Akses ditolak `403 Forbidden`).
