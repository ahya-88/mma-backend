# Backend Bersama — Ma'had Mudaiyatul Anwar

Backend nyata untuk modul-modul yang datanya terlalu kritis untuk terus hidup di state React sesi lokal. Dimulai dari **Cashless BMT**, sekarang juga mencakup **Pengasuhan** (absensi, perizinan, pelanggaran), **Pengajaran** (nilai, prestasi), **LPTQ** (hafalan, penilaian ubudiyah & doa), dan **Keuangan/Administrasi** (tagihan & pembayaran, cashflow, infaq, **dan sekarang Pengajuan Anggaran** — persetujuan bertingkat dengan rincian item). Logika bisnisnya adalah port 1:1 dari `pesantren-app.jsx` — hasilnya harus identik dengan versi frontend.

Sesuai rekomendasi roadmap sebelumnya (`roadmap-super-app-mma.md`): **satu backend** untuk semua modul, bukan backend terpisah per modul — supaya tidak ada banyak sumber kebenaran yang berbeda-beda.

## Database PostgreSQL
Backend memakai PostgreSQL melalui paket `pg`. Isi `DATABASE_URL` dengan connection string PostgreSQL; koneksi ke host selain localhost memakai SSL. Skema idempoten ada di `src/schema.pg.sql`, dan nama kolom camelCase dipertahankan menggunakan identifier SQL bertanda kutip.

## Struktur
```
backend/
  src/
   schema.sql          # skema sumber SQLite untuk transfer data lama
   schema.pg.sql       # skema PostgreSQL idempoten
   db.js               # pool PostgreSQL + transaksi + inisialisasi saat startup
    auth.js             # login (Guru/Wali) + JWT middleware + pengecekan peran per modul
    cashlessService.js  # logika inti cashless: limit harian, skema blokir otomatis, transaksi, permintaan
    pengasuhanService.js# logika inti Pengasuhan: absensi, perizinan, pelanggaran, profil ringkas
    akademikService.js  # logika inti Pengajaran (nilai, prestasi) & LPTQ (hafalan, ubudiyah)
    keuanganService.js  # logika inti Keuangan/Administrasi: tagihan, pembayaran (+cashflow otomatis), cashflow manual, Pengajuan Anggaran (+realisasi otomatis ke cashflow)
    seed.js             # data demo — sinkron dengan GURU_SEED/WALI_SEED/SANTRI_SEED di frontend
    app.js              # Express app + routing
    routes/
      auth.js
      santri.js          # + endpoint agregator /rapor-ringkas untuk WaliDashboard
      transaksi.js
      permintaan.js
      pengasuhan.js
      pengajaran.js
      lptq.js
      keuangan.js
   scripts/pindah-data.js # transfer SQLite ke PostgreSQL dan verifikasi jumlah/saldo
   .env.example
  package.json
```

## Menjalankan secara lokal
```bash
cd backend
npm install
cp .env.example .env
# isi DATABASE_URL dan JWT_SECRET di .env
npm run seed
npm start                   # jalan di http://localhost:4000
```
Cek: `curl http://localhost:4000/api/health` → `{"ok":true, ...}`. Endpoint ini menjalankan `SELECT 1` dan membalas HTTP 503 bila PostgreSQL tidak dapat dihubungi.

## Akun demo (sama seperti frontend)
| Username | Password | Peran |
|---|---|---|
| admin | admin123 | Admin |
| fahmi | guru123 | Staf Pengasuhan |
| nadia | guru123 | Staf Pengajaran |
| hilmi.lptq | guru123 | Staf LPTQ |
| hendra | uang123 | Staf Administrasi/Keuangan |
| fatimah.bmt | guru123 | Staf BMT |
| slamet.kantin | guru123 | Staf Kantin |
| ahmad.ridwan | wali123 | Wali (anak: Abdul Malik/s1, Umar Faruq/s3) |

## Kontrak API
Semua endpoint berawalan `/api`. Kirim `Authorization: Bearer <token>` dari hasil login, kecuali endpoint kios.

| Method | Endpoint | Peran | Keterangan |
|---|---|---|---|
| POST | `/auth/login` | publik | `{ username, password }` → `{ token, user }` |
| GET | `/santri/me-anak` | wali | daftar anak sendiri + saldo/limit/blokir |
| GET | `/santri/:id` | BMT atau wali pemilik | detail 1 santri |
| GET | `/santri/:id/riwayat` | BMT atau wali pemilik | riwayat transaksi lintas unit |
| GET | `/santri/:id/saldo-publik` | **publik, tanpa token** | untuk kios cek saldo mandiri — info minimal saja |
| GET | `/santri/:id/rapor-ringkas` | staf mana pun, atau wali pemilik | absensi + perizinan + pelanggaran + nilai + prestasi + hafalan + ubudiyah dalam satu panggilan; **field `tagihan`** juga disertakan tapi **hanya** terisi untuk wali pemilik anak atau staf Administrasi — untuk staf lain, `tagihan` selalu `[]` — sedangkan saldo cashless tetap lewat `/santri/:id` (BMT-atau-wali-pemilik saja) |
| POST | `/santri/upsert` | staf mana pun (guru) | sinkronkan identitas dasar santri (dipanggil otomatis sebelum transaksi/perizinan/pelanggaran/nilai/dst diproses) |
| POST | `/transaksi` | staf Unit Usaha | `{ santriId, jenis?, kategori?, subKategori?, jumlah, keterangan?, pin?, metode? }`; PIN opsional khusus transaksi QR bagi santri yang belum mengatur PIN. Jika PIN sudah diatur, transaksi debit QR tetap wajib memakainya; metode manual/wajah tetap memerlukan PIN. |
| POST | `/kartu/resolve` | staf Unit Usaha | `{ token: "MMA1:<kartuToken>" }` → identitas/saldo santri tanpa field rahasia |
| GET | `/kartu/kelola` | BMT | daftar santri dan QR aktif (PNG data URL) serta status `punyaPin`; tidak mengirim token kartu mentah atau hash PIN |
| GET | `/kartu/cetak` | BMT | HTML siap cetak; gunakan header Authorization, kartu tanpa PIN |
| POST | `/santri/pin/awal` | BMT | Buat PIN acak untuk semua santri yang belum punya PIN; respons PIN hanya sekali |
| POST | `/santri/:id/pin` | BMT | `{ pin }` — atur/reset PIN 4–6 digit |
| POST | `/santri/:id/kartu/terbitkan` | BMT | Terbitkan/rotasi token kartu QR |
| GET | `/permintaan?status=` | BMT | daftar semua permintaan wali |
| GET | `/permintaan/mine?santriId=` | wali | riwayat permintaan yang diajukan sendiri |
| POST | `/permintaan` | wali | ajukan perubahan untuk anak sendiri |
| POST | `/permintaan/:id/proses` | BMT | `{ disetujui: true/false, catatan? }` |

Semua error dikembalikan sebagai `{ "error": "..." }` dengan status HTTP yang sesuai (400/401/403/404/409). Error PIN debit menggunakan `kode`: `PIN_SALAH` (422, dengan `sisaPercobaan`), `PIN_TERKUNCI` (423, dengan `sampai`), atau `PIN_BELUM_DIATUR` (409).

#### PIN awal dan cetak kartu
Login sebagai staf BMT, lalu kirim `POST /api/santri/pin/awal` dengan header `Authorization: Bearer <token>`. Simpan respons PIN secara aman karena hanya dikembalikan sekali; PIN tidak dicetak pada kartu. Untuk mencetak semua kartu, unduh `GET /api/kartu/cetak` menggunakan header Authorization (token tidak pernah diletakkan di URL), buka HTML hasilnya di browser, lalu gunakan Print. Santri yang belum memiliki token akan otomatis mendapat kartu saat halaman cetak dibuat; rotasi melalui `/api/santri/:id/kartu/terbitkan` langsung menonaktifkan QR lama.

Untuk pengelolaan visual QR per santri, pilih tab **QR Santri** pada navigasi BMT. Panel di aplikasi utama meneruskan sesi BMT yang sedang aktif, jadi tidak perlu login ulang. Halaman mandiri juga bisa dibuka di `/bmt/qr`; pada halaman mandiri, sesi login hanya disimpan di `sessionStorage` selama tab terbuka.

### Kontrak API — Pengasuhan
Semua endpoint di bawah khusus staf Pengasuhan (`departemen: "pengasuhan"`).

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/pengasuhan/santri/:id` | profil ringkas: rekap absensi, total poin pelanggaran, izin aktif |
| POST | `/pengasuhan/absensi` | `{ santriId, status, tanggalISO?, keterangan? }` — satu santri satu catatan per tanggal (menimpa jika sudah ada, untuk koreksi) |
| GET | `/pengasuhan/absensi?tanggalISO=` | snapshot absensi seluruh santri pada satu tanggal (default hari ini) — untuk UI ambil-absen harian |
| GET | `/pengasuhan/absensi/:santriId` | riwayat + rekap jumlah per status untuk satu santri |
| POST | `/pengasuhan/perizinan` | `{ santriId, jenis, tanggalKeluar, tanggalKembali?, alasan? }` |
| GET | `/pengasuhan/perizinan?santriId=&status=` | daftar perizinan |
| POST | `/pengasuhan/perizinan/:id/proses` | `{ status: "Disetujui"\|"Ditolak"\|"Selesai" }` |
| POST | `/pengasuhan/pelanggaran` | `{ santriId, jenis, poin, tanggalISO?, keterangan? }` |
| GET | `/pengasuhan/pelanggaran/:santriId` | riwayat + total poin |

### Kontrak API — Pengajaran
Khusus staf Pengajaran (`departemen: "pengajaran"`).

| Method | Endpoint | Keterangan |
|---|---|---|
| GET / POST | `/pengajaran/nilai` | list semua / `{ santriId, mapel, nilai }` |
| DELETE | `/pengajaran/nilai/:id` | hapus satu catatan nilai |
| GET / POST | `/pengajaran/prestasi` | list semua / `{ santriId, judul, tingkat }` |
| DELETE | `/pengajaran/prestasi/:id` | hapus satu catatan prestasi |

### Kontrak API — LPTQ
Khusus staf LPTQ (`departemen: "lptq"`).

| Method | Endpoint | Keterangan |
|---|---|---|
| GET / POST | `/lptq/hafalan` | list semua / `{ santriId, juz }` |
| DELETE | `/lptq/hafalan/:id` | hapus satu catatan setoran |
| GET / POST | `/lptq/ubudiyah` | list semua / `{ santriId, jenis, materi?, predikat, catatan? }` — predikat harus salah satu dari "Sangat Baik", "Baik", "Cukup", "Perlu Bimbingan" |
| DELETE | `/lptq/ubudiyah/:id` | hapus satu catatan penilaian |

### Kontrak API — Keuangan/Administrasi
Khusus staf Administrasi (`departemen: "administrasi"`).

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/keuangan/tagihan` | list semua tagihan lintas santri |
| POST | `/keuangan/tagihan` | `{ santriIds: [...], jenis, jumlah, bulan }` — bisa banyak santri sekaligus (target "satu"/"kelas"/"semua" dihitung di frontend dari data.santri, backend hanya menerima daftar id akhir) |
| PUT | `/keuangan/tagihan/:id` | `{ jumlah, jumlahDibayar }` — koreksi nominal manual |
| DELETE | `/keuangan/tagihan/:id` | hapus satu tagihan |
| POST | `/keuangan/tagihan/:id/bayar` | `{ jumlahBayar }` — menaikkan jumlahDibayar (dibatasi maksimal jumlah tagihan) **dan** otomatis membuat satu baris Cashflow masuk kategori "Pembayaran Santri" dalam transaksi yang sama |
| GET | `/keuangan/cashflow` | list semua entri cashflow — juga dipakai untuk menampilkan Infaq (kategori "Infaq/Donasi" adalah entri Cashflow biasa, bukan tabel terpisah) |
| POST | `/keuangan/cashflow` | `{ bulan, jenis: "Masuk"\|"Keluar", kategori, jumlah, keterangan? }` |
| DELETE | `/keuangan/cashflow/:id` | hapus satu entri cashflow |
| GET | `/keuangan/anggaran` | list semua pengajuan anggaran, masing-masing sudah menyertakan array `rincian` |
| POST | `/keuangan/anggaran` | `{ namaKegiatan, unitPengaju?, ketuaBagianNama?, kategori, bulanRencana, catatan?, rincian: [{ uraian, qty, hargaSatuan }] }` — `totalAnggaran` **dihitung ulang di server** dari rincian, tidak dipercaya mentah-mentah dari frontend |
| DELETE | `/keuangan/anggaran/:id` | hapus — hanya boleh untuk status Diajukan atau Ditolak (409 kalau sudah Disetujui/Direalisasikan) |
| POST | `/keuangan/anggaran/:id/setujui` | `{ pimpinanId? }` — hanya boleh dari status Diajukan (409 kalau bukan) |
| POST | `/keuangan/anggaran/:id/tolak` | hanya boleh dari status Diajukan |
| POST | `/keuangan/anggaran/:id/realisasi` | `{ jumlahRealisasi? }` (default ke totalAnggaran kalau kosong) — hanya boleh dari status Disetujui; otomatis membuat satu baris Cashflow keluar berkategori sama seperti pengajuannya, dalam transaksi yang sama |

### Kontrak API — Master Data Santri (Sekretariat)
`POST /santri/upsert` bisa dipanggil oleh **siapa saja** yang login sebagai guru (`requireAnyStaff`) — dipakai juga oleh modul lain (Pengasuhan dkk.) untuk sinkronisasi identitas dasar. Field biodata (lihat `SANTRI_BIODATA_FIELDS` di `cashlessService.js`) hanya ditimpa kalau memang dikirim di body, supaya panggilan sinkronisasi dari modul lain (yang cuma kirim `id/nama/kelas/nis/nisn/waliId`) tidak menghapus biodata yang sudah tersimpan.

| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/santri` | staf mana pun | Daftar seluruh santri + biodata lengkap. Field finansial (`saldo`, `limitJajanHarian`, `durasiBlokirHari`, `sisaLimitHariIni`, `blokir`) **disembunyikan** kecuali untuk staf BMT. |
| POST | `/santri/upsert` | staf mana pun | Insert/update. Respons ikut disaring seperti di atas untuk non-BMT. |
| DELETE | `/santri/:id` | hanya Sekretariat (`departemen: "sekretariat"`) | Menolak dengan 409 kalau santri masih punya riwayat data terkait (FK constraint — transaksi, nilai, absensi, dsb.) |

Biodata lengkap (tempat/tanggal lahir, alamat, orang tua, riwayat pendidikan, `riwayatKelas`, dst.) disimpan sebagai kolom tambahan pada tabel `Santri` — ditambahkan lewat migrasi `ALTER TABLE` idempoten di `db.js`, jadi database lama otomatis ter-upgrade saat server dijalankan ulang.

## Yang sudah diuji (lihat riwayat sesi ini)
- Login Guru & Wali, termasuk token invalid/kosong → 401.
- Wali mengajukan Ubah Limit Jajan Harian → BMT menyetujui → limit benar-benar berubah.
- Transaksi Tarik Tunai kategori Jajan Harian yang melebihi limit: tetap tercatat, saldo terpotong, santri otomatis diblokir sampai H+1.
- Transaksi berikutnya ditolak (409) selama blokir aktif.
- Kategori Kebutuhan Khusus **tidak** dihitung ke limit harian (nominal besar tidak memicu blokir).
- Wali mengajukan Buka Blokir Sekarang → BMT menyetujui → blokir langsung nonaktif, transaksi lanjut normal.
- Riwayat lintas unit & endpoint saldo publik (kios) mengembalikan data yang benar.
- Batasan akses: wali lain tidak bisa lihat anak orang lain (403), staf non-BMT tidak bisa akses endpoint Permintaan (403), request tanpa token ditolak (401).

### Modul Pengasuhan — sudah diuji
- Catat absensi dua kali di tanggal yang sama untuk santri yang sama → menimpa (bukan duplikat), sesuai maksud "koreksi data hari ini".
- Ajukan izin → setujui → status berubah jadi Disetujui.
- Catat pelanggaran dengan poin → muncul di riwayat & total poin terakumulasi benar.
- Profil ringkas mengembalikan rekap absensi, total poin, dan izin aktif dalam satu panggilan.
- Edge case: santri tidak ada → 404; status tidak valid → 400; field wajib kosong → 400; santri tanpa catatan apa pun → rekap nol (bukan error).
- Keamanan: staf BMT & Wali sama-sama ditolak (403) dari endpoint Pengasuhan; tanpa token → 401.

### Modul Pengajaran & LPTQ — sudah diuji
- Catat nilai & prestasi (Pengajaran), hafalan & penilaian ubudiyah (LPTQ) — semua lewat klik UI sungguhan terhadap backend nyata, bukan panggilan API langsung.
- Hapus penilaian ubudiyah → hilang dari backend & UI.
- Keamanan: staf Pengajaran ditolak (403) dari endpoint LPTQ dan sebaliknya; predikat ubudiyah di luar daftar yang sah → 400.

### Modul Keuangan/Administrasi — sudah diuji
- Terbitkan tagihan untuk satu santri → catat pembayaran sebagian → status berubah jadi "Sebagian" dan satu baris Cashflow masuk kategori "Pembayaran Santri" otomatis muncul di tab Cashflow.
- Catat entri Cashflow manual (Keluar, kategori Operasional) dan Infaq (kategori Infaq/Donasi lewat endpoint Cashflow yang sama) — keduanya lewat klik UI sungguhan.
- Keamanan: field `tagihan` pada `/rapor-ringkas` kosong untuk staf non-Administrasi/non-wali-pemilik, tapi terisi benar untuk wali pemilik anak; staf non-Administrasi ditolak (403) dari endpoint `/keuangan/*` secara langsung.
- **Belum dikerjakan**: Pengajuan Anggaran (alur persetujuan bertingkat dengan rincian item dan realisasi) — kompleksitasnya setara proyek tersendiri.

### Modul Pengajuan Anggaran — sudah diuji
- Ajukan anggaran dengan rincian item (uraian × qty × harga satuan) → `totalAnggaran` dihitung ulang di server dari rincian (tidak dipercaya mentah dari frontend) → hasilnya benar.
- Alur status penuh: Diajukan → Setujui → Realisasikan, masing-masing lewat klik UI sungguhan terhadap backend nyata.
- Realisasi otomatis membuat satu baris Cashflow keluar berkategori sama seperti pengajuannya — muncul benar di tab Cashflow.
- Keamanan alur: hapus hanya boleh untuk status Diajukan/Ditolak (409 kalau sudah Disetujui/Direalisasikan); setujui/tolak hanya boleh dari status Diajukan; realisasi hanya boleh dari status Disetujui — semua dites lewat percobaan langsung ke API.

## ⚠️ Bug serius yang ditemukan & diperbaiki: WaliDashboard tidak independen
Saat menguji modul Pengajaran, ditemukan bug arsitektur nyata: dashboard Wali (Perizinan, Pelanggaran, Absensi, Nilai, Prestasi, Hafalan, Ubudiyah, dan belakangan Tagihan) awalnya **hanya** menampilkan data yang sudah dimuat ke `data.*` lokal oleh komponen `DepartmentContent`/`KeuanganPanel` — komponen itu hanya mount ketika seorang **staf** membuka departemen terkait. Konsekuensinya: seorang wali yang login **langsung** (tanpa ada staf yang kebetulan membuka modul terkait di tab/sesi yang sama) akan melihat dashboard yang **kosong**, padahal datanya sudah ada di backend. Ini baru ketahuan karena pengujian sebelumnya *kebetulan* selalu login sebagai staf dulu sebelum beralih ke akun wali dalam satu sesi browser yang sama, sehingga bug ini tersembunyi.

**Perbaikan:** endpoint `GET /santri/:id/rapor-ringkas` (lihat tabel di atas) menggabungkan absensi + perizinan + pelanggaran + nilai + prestasi + hafalan + ubudiyah + tagihan dalam satu panggilan, bisa diakses staf departemen mana pun atau wali pemilik anak — kecuali field `tagihan` yang tetap dibatasi hanya untuk wali pemilik atau staf Administrasi karena sifatnya finansial (saldo cashless sendiri tetap lewat endpoint cashless yang sudah ada, BMT-atau-wali-pemilik saja). `WaliDashboard` sekarang fetch endpoint ini sendiri, independen dari sesi staf mana pun. Sudah diverifikasi ulang beberapa kali (termasuk untuk tagihan Keuangan): akun wali yang login dari kondisi benar-benar bersih (belum pernah ada staf login di sesi itu) tetap melihat data anaknya dengan benar.

## Integrasi dengan frontend (`pesantren-app.jsx`) — SUDAH TERHUBUNG (Cashless, Pengasuhan, Pengajaran, LPTQ, Keuangan)
Frontend sekarang benar-benar memanggil API ini (bukan lagi `setData` lokal murni untuk data modul-modul ini):
- Login (peran Wali, staf Unit Usaha, Pengasuhan, Pengajaran, LPTQ, dan Administrasi) otomatis juga login ke backend ini di belakang layar, menyimpan token JWT (`backendToken`/`backendOnline` — nama generik karena backend kini menaungi banyak modul).
- `catatTransaksi` (BMT), `ajukanPermintaan` (Wali), `prosesPermintaan` (BMT) — cashless.
- `addIzin`/`setIzinStatus`, `addPel`/`delPel`, `setStatusAbsensi` — Pengasuhan.
- `addNilai`/`delNilai`, `addPrestasi`/`delPrestasi` — Pengajaran.
- `addHafalan`/`delHafalan`, `addUbudiyah`/`delUbudiyah` — LPTQ.
- `buatTagihan`/`delTagihan`/`simpanEditNominal`/`catatPembayaran`, `addCashflow`/`delCashflow`, `catatInfaq` (memakai endpoint Cashflow yang sama), `ajukanAnggaran`/`hapusPengajuan`/`setujuiAnggaran`/`tolakAnggaran`/`realisasikanAnggaran` — Keuangan/Administrasi.
- Tab "Riwayat Semua Unit" (BMT) dan kartu "Saldo Cashless" (Wali) mengambil saldo/limit/status blokir langsung dari backend lewat `GET /santri/:id` & `GET /santri/:id/riwayat`.
- Data hasil fetch tiap modul staf juga dicerminkan ke `data.*` lokal yang sesuai (shape lama dipertahankan), supaya Master Data Santri — yang belum dikonversi ke fetch sendiri — tetap menampilkan data terbaru tanpa perlu ditulis ulang.
- **WaliDashboard fetch independen** lewat `GET /santri/:id/rapor-ringkas` (termasuk tagihan) — lihat bagian bug di atas.
- Sebelum data modul apa pun diproses, frontend memanggil `POST /santri/upsert` otomatis untuk memastikan identitas santri sudah dikenal backend. Endpoint ini bisa dipanggil staf departemen mana pun.
- Ada indikator koneksi ("Menghubungkan...", "Tidak terhubung") di setiap panel yang tersambung backend — tombol aksi dinonaktifkan sampai koneksi benar-benar terkonfirmasi, mencegah aksi "hilang" akibat race condition saat login baru saja terjadi.

Sudah diuji dengan tujuh test integrasi penuh (server backend nyata + frontend jsdom berjalan bersamaan):
1. **Cashless**: limit → blokir otomatis → tolak transaksi saat diblokir → ajukan buka blokir → BMT setujui → transaksi lanjut lagi.
2. **Pengasuhan (Perizinan & Pelanggaran)**: ajukan izin → setujui → catat pelanggaran → hapus pelanggaran — diverifikasi lintas peran.
3. **Absensi**: tandai Hadir/Sakit, rekap harian benar, koreksi di hari yang sama menimpa.
4. **Pengajaran & LPTQ**: catat nilai, prestasi, hafalan, ubudiyah, lalu hapus — semua lewat klik UI sungguhan.
5. **WaliDashboard independen**: wali login dari kondisi bersih (tanpa staf login duluan di sesi yang sama) tetap melihat data anaknya dari Pengajaran maupun Pengasuhan — mengonfirmasi perbaikan bug di atas.
6. **Keuangan**: terbitkan tagihan → catat pembayaran sebagian → cashflow otomatis muncul → catat cashflow manual & infaq → wali (sesi bersih) melihat status tagihan yang benar.
7. **Pengajuan Anggaran**: ajukan dengan rincian → total dihitung ulang di server dengan benar → setujui → realisasikan → cashflow otomatis muncul — semua lewat klik UI sungguhan.

**Catatan keterbatasan yang masih ada:**
- Akun Guru/Wali baru yang dibuat lewat UI frontend (kalau ada fitur tambah-akun) tidak otomatis muncul di backend ini — perlu proses provisioning akun terpisah (di luar cakupan sesi ini).
- Tidak ada sinkronisasi real-time antar perangkat/tab (mis. kalau staf mencatat dari device lain, tab lain perlu refresh/re-login untuk lihat perubahan terbaru) — cukup untuk pilot skala kecil, tapi perlu polling/websocket kalau mau real-time penuh.

## Deployment
Gunakan hosting Node.js dan PostgreSQL terkelola atau server PostgreSQL yang dapat diakses dari aplikasi. Set `DATABASE_URL`, `JWT_SECRET`, dan `PORT` pada environment hosting; tidak diperlukan volume berkas database.

### Frontend disajikan dari service backend yang sama (satu URL untuk semuanya)
Folder `public/index.html` di repo ini **adalah** `pesantren-app.html` — `src/app.js` sudah diatur untuk menyajikannya langsung di path `/` (lihat blok `express.static` + fallback di `app.js`). Artinya **tidak perlu hosting frontend terpisah** (Netlify/Vercel/dst.): begitu backend ini live di Railway, buka saja domain Railway-nya langsung (tanpa `/api`) dan aplikasinya sudah tampil, sudah otomatis tersambung ke API di domain yang sama. Ini sengaja dipilih ketimbang hosting terpisah karena aplikasi tambahan di masa depan (kasir, kiosk saldo, dst.) akan lebih mudah dikelola kalau semuanya berada dalam satu project Railway — tinggal tambah service baru per aplikasi, dan kalau nanti pakai domain sendiri, tiap aplikasi tinggal jadi subdomain (`app.domain.id`, `kasir.domain.id`, dst.) dari domain yang sama, tanpa perlu urus CORS/domain terpisah sama sekali (CORS backend ini sudah dibuka untuk semua origin).

Setiap kali `pesantren-app.jsx` diubah dan di-build ulang jadi `pesantren-app.html`, cukup timpa `public/index.html` dengan hasil build barunya, commit, push — Railway redeploy otomatis.

### Langkah deploy ke Railway (paling sederhana)

1. **Push folder `backend/` ini ke repo GitHub baru** (bisa privat). Dari folder hasil ekstrak `backend-cashless-mma.zip`:
   ```
   cd backend
   git init
   git add .
   git commit -m "Backend awal MMA"
   git branch -M main
   git remote add origin https://github.com/<akun-anda>/mma-backend.git
   git push -u origin main
   ```
   (`.gitignore` sudah menyingkirkan `node_modules/`, `.env`, dan file `*.db` — aman untuk di-push.)
2. Buat akun di **railway.app** (bisa login pakai GitHub), lalu **New Project → Deploy from GitHub repo** → pilih repo `mma-backend` tadi.
3. Railway akan otomatis mendeteksi Node.js dan menjalankan `npm install` lalu `npm start` (script ini sudah ditambahkan di `package.json`).
4. **Set Environment Variables** (tab **Variables**):
   - `DATABASE_URL` = connection string PostgreSQL/Neon dengan SSL, misalnya format `postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require`
   - `JWT_SECRET` = string acak yang panjang (generate lewat `openssl rand -hex 32` di terminal/Mac/Linux, atau di PowerShell Windows: `-join ((48..57)+(97..122)|Get-Random -Count 40 |%{[char]$_})`)
   - `PORT` boleh dikosongkan — Railway mengisinya otomatis.
5. Saat deploy, aplikasi menjalankan skema dan seed default `UnitUsaha`, `TahunAjaran`, serta `Pengaturan` secara idempoten. Jalankan `npm run seed` hanya bila akun demo dibutuhkan.
6. Railway memberi domain publik otomatis di tab **Settings → Networking → Generate Domain**, bentuknya seperti `https://mma-backend-production.up.railway.app`. Karena frontend disajikan dari service yang sama, domain ini langsung membuka aplikasinya; API-nya ada di domain yang sama + `/api`.
7. Tes `https://<domain-railway-anda>/api/health`; harus mengembalikan HTTP 200 dan `{"ok":true,"waktu":"..."}` ketika database sehat.

### Kalau tetap ingin frontend di hosting terpisah (opsional, tidak direkomendasikan lagi)
Cara ini masih bisa dipakai kalau karena alasan tertentu (mis. sudah terlanjur di Netlify) ingin frontend tetap terpisah dari backend:
Buka `pesantren-app.html` dengan text editor, cari komentar ini di bagian `<head>` (masih teks biasa, belum di-minify):
```html
<!-- Untuk terhubung ke backend yang sudah dideploy, isi baris di bawah SEBELUM tag <script> bundle:
<script>window.BACKEND_API_BASE = "https://domain-backend-anda.com/api";</script>
Default tanpa ini: http://localhost:4000/api (untuk pengembangan lokal). -->
```
Hapus tanda komentar `<!--`/`-->`, lalu isi URL sesuai domain Railway di langkah 8, contoh:
```html
<script>window.BACKEND_API_BASE = "https://mma-backend-production.up.railway.app/api";</script>
```
Simpan, lalu `pesantren-app.html` ini sudah bisa langsung dipakai — tinggal di-hosting statis di mana saja (Google Drive share-link tidak akan berfungsi karena browser memblokirnya sebagai HTML aktif; gunakan hosting statis seperti Netlify/Vercel/GitHub Pages, atau upload ke VPS/Railway static, atau untuk pilot internal cukup dibuka langsung dari file lokal di tiap laptop admin). **Kirimkan URL Railway-nya ke Claude di sesi berikutnya kalau ingin Claude yang langsung menyuntikkan baris ini dan membuild ulang `pesantren-app.html` untuk Anda** — lebih aman daripada mengedit file besar secara manual.

### Migrasi data asli (setelah deploy, sebelum dipakai sungguhan)
- Jangan jalankan `npm run seed` jika tidak menginginkan akun dan data contoh (`s1`–`s6`, dst.).
- Untuk menyalin database SQLite lama, pasang dependency dev lalu set `SQLITE_PATH` ke file sumber dan `DATABASE_URL` ke target PostgreSQL. Jalankan `npm run migrate:sqlite`; tambahkan `-- --reset` bila tabel target harus dikosongkan terlebih dahulu. Skrip membaca SQLite dalam mode read-only, menyalin batch 500 baris, mempertahankan ID, lalu membandingkan jumlah baris dan total saldo Santri.
- Pastikan backup SQLite dan target PostgreSQL tersedia sebelum memakai opsi `--reset`.

Untuk verifikasi setelah migrasi, gunakan endpoint `/api/health` dan uji login, transaksi kasir, serta saldo hasil migrasi.

## Keamanan sebelum dipakai sungguhan
- Ganti `JWT_SECRET` di `.env` produksi (bukan nilai default `dev-secret...`).
- Aktifkan HTTPS di depan server (lewat platform hosting atau reverse proxy).
- Endpoint `/santri/:id/saldo-publik` sengaja tanpa autentikasi (untuk kios) — sudah dibatasi hanya mengembalikan info minimal, tapi pertimbangkan rate-limiting per IP kalau dipasang publik, sesuai catatan di `konsep-kasir-pembayaran-cekSaldo.md`.
