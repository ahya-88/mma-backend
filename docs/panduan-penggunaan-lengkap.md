# 📄 Panduan Lengkap & Praktis Penggunaan Aplikasi Cashless BMT, Keuangan, & Operasional Pesantren
**Ma'had Mudaiyatul Anwar (MMA)**

---

## 🎯 1. Pendahuluan & Konsep Utama

Aplikasi Sistem Terpadu **Ma'had Mudaiyatul Anwar (MMA)** menghubungkan seluruh aspek operasional pesantren secara digital, transparan, dan terintegrasi real-time. Aplikasi ini mencakup transaksi cashless santri, pengelolaan keuangan unit usaha, pengasuhan, akademik, hingga pelaporan superadmin.

### 💡 3 Prinsip Utama Cashless MMA:
1. **Bebas Uang Tunai Fisik**: Santri tidak menggunakan uang kertas/fisik di pesantren. Belanja di Kantin, Kopel, maupun BMT menggunakan Saldo Debit Santri.
2. **Batas Jajan Harian (Limit)**: Setiap santri dibatasi jumlah belanja harian agar hemat, disiplin, dan teratur.
3. **Arus Kas Otomatis**: Setiap transaksi penerimaan kasir, modal masuk, dan pencairan saldo otomatis tersinkronisasi dengan **Laporan Arus Kas (Cashflow)**.

---

## 👥 2. Struktur Peran & Hak Akses (Role Access)

| Peran (Role) | Hak Akses & Tugas Utama |
| :--- | :--- |
| 👑 **Superadmin** | Pemegang kewenangan tertinggi. Mengelola akun staf, unit usaha, tahun ajaran, pengaturan tampilan, serta audit rekonsiliasi saldo cashless. |
| 💼 **Staf Keuangan** | **Admin Unit Usaha & Keuangan Pesantren**. Mengelola tagihan santri, penerimaan pembayaran, pengajuan anggaran, serta transaksi & arus kas seluruh unit usaha. |
| 🏧 **Staf BMT** | **Admin Unit Usaha & Operator BMT**. Memproses permohonan top-up wali, penerbitan kartu/PIN santri, audit saldo, serta transaksi unit usaha. |
| 🛒 **Staf Kasir Unit** | **Kasir Kantin, Kopel, Dapur, dll**. Memproses transaksi belanja debit santri (QR, Wajah, Manual), mengelola katalog produk, dan sinkronisasi offline. |
| 👨‍🏫 **Pengasuhan** | Mengelola absensi harian santri, perizinan keluar/pulang, serta catatan pelanggaran & poin pembinaan santri. |
| 🎓 **Pengajaran / LPTQ** | Menginput nilai akademik, catatan prestasi, setoran hafalan Al-Qur'an, dan penilaian ubudiyah santri. |
| 📁 **Sekretariat** | Mengelola Master Data Santri, biodata lengkap, kelengkapan berkas, impor data Excel/CSV, serta penautan akun wali santri. |
| 👨‍👩‍👧 **Wali Santri** | Memantau saldo anak, mengajukan permohonan top-up saldo & batas jajan harian, serta melihat riwayat belanja anak secara real-time. |

---

## 💼 3. Transaksi Keuangan & Saldo Unit Usaha

Bagian Keuangan, BMT, dan Superadmin (Admin Unit Usaha) dapat mengelola arus kas unit usaha pada tab **"Keuangan Unit"** melalui 3 jenis transaksi yang otomatis tersinkronisasi:

1. 📥 **Dana Masuk (Injeksi Modal / Penambahan Saldo)**
   - **Tujuan**: Penambahan modal awal kasir atau injeksi dana ke unit usaha tujuan (contoh: *Injeksi Modal Kasir Kantin Rp 100.000*).
   - **Efek**: Otomatis mencatat Cashflow **MASUK** pada unit tujuan.

2. 📤 **Dana Keluar (Pencairan Saldo Kasir / Operasional)**
   - **Tujuan**: Pencairan saldo hasil penjualan kasir atau pembayaran biaya operasional unit usaha asal (contoh: *Pencairan Saldo Kasir Kantin Rp 400.000 ke BMT*).
   - **Efek**: Otomatis mencatat Cashflow **KELUAR** pada unit asal.

3. 🔄 **Transfer Antar Bagian (Pemindahan Dana)**
   - **Tujuan**: Pemindahan dana langsung antar unit usaha (contoh: *Transfer dari Kantin ke Kopel Rp 50.000*).
   - **Efek**: Otomatis mencatat 2 entri Cashflow sinkron (**Keluar** dari unit asal & **Masuk** ke unit tujuan).

> 📊 **Rumus Saldo Kas Unit Usaha:**  
> $$\text{Saldo Kas Unit} = (\text{Penerimaan Belanja Santri} + \text{Total Dana Masuk}) - \text{Total Dana Keluar}$$

---

## 🚀 4. Petunjuk Operasional Langkah demi Langkah (Step-by-Step)

### A. Mengoperasikan Kasir Cashless (Kantin / Kopel / BMT)
1. **Langkah 1**: Buka halaman Kasir. Pilih metode identifikasi santri: Scan QR Kartu, Kamera Deteksi Wajah, atau Cari Nama/NIS secara manual.
2. **Langkah 2**: Pilih produk dari katalog atau masukan nominal belanja secara manual.
3. **Langkah 3**: Verifikasi PIN santri (khusus penarikan tunai atau transaksi sensitif). Sistem memeriksa sisa limit jajan harian.
4. **Langkah 4**: Klik 'Proses Transaksi'. Saldo dipotong secara instant. Jika internet terputus, transaksi tersimpan offline dan otomatis tersinkron saat terhubung kembali.

### B. Mencatat Transaksi Unit Usaha (Keuangan & BMT)
1. **Langkah 1**: Buka tab/menu **"Keuangan Unit"**.
2. **Langkah 2**: Pilih jenis transaksi: **Dana Masuk**, **Dana Keluar**, atau **Transfer Antar Bagian**.
3. **Langkah 3**: Pilih Unit Asal / Unit Tujuan, masukkan Nominal (Rp), dan berikan Catatan Keterangan.
4. **Langkah 4**: Klik **"Simpan Transaksi Unit"**. Saldo kas unit dan laporan arus kas langsung terbarui secara otomatis.

### C. Memproses Top-Up Saldo dari Wali Santri (BMT / Keuangan)
1. **Langkah 1**: Buka menu **"Permintaan BMT"**, pilih permohonan berstatus 'Menunggu'.
2. **Langkah 2**: Periksa foto resi/bukti transfer yang dikirimkan oleh wali santri.
3. **Langkah 3**: Klik tombol **"Setujui"**. Saldo santri otomatis bertambah dan riwayat dicatat.

### D. Impor Data Santri Baru dari Excel (Sekretariat)
1. **Langkah 1**: Buka menu **"Data Santri"**, klik tombol **"Unduh Template"** untuk mengunduh berkas CSV/Excel standar.
2. **Langkah 2**: Isi data santri (Nama, NIS, NISN, Kelas, Nama Wali, No HP Wali).
3. **Langkah 3**: Klik tombol **"Impor Excel"**, periksa laporan simulasi (*dry-run*). Jika valid, klik **"Konfirmasi Eksekusi"**. Akun wali santri akan dibuatkan otomatis.

---

## 💡 5. Rumus Cepat & Rujukan Singkat (Gampang Diingat)

| Kode/Fitur | Fungsi & Rumus Singkat |
| :--- | :--- |
| 🪪 **QR / Wajah / PIN** | Belanja Santri Cepat, Aman, & Bebas Uang Tunai |
| 📥 **Dana Masuk** | Tambah Modal / Injeksi Saldo Kasir Unit Usaha |
| 📤 **Dana Keluar** | Pencairan Saldo Hasil Penjualan Kasir / Operasional Unit |
| 🔄 **Transfer Unit** | Pindah Dana Langsung Antar Bagian (*e.g. Kantin ➔ BMT*) |
| 📥 **Impor Excel** | Auto-generate Data Santri & Akun Wali Otomatis |
| ⚖️ **Rekonsiliasi** | Audit Saldo Ledger vs Saldo Tersimpan Santri |
