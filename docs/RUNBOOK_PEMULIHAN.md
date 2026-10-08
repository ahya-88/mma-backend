# RUNBOOK PEMULIHAN BENCANA DATABASE (DISASTER RECOVERY RUNBOOK)
**Ma'had Mudaiyatul Anwar (MMA) - Backend Cashless & Super-App**

Dokumen ini berisi prosedur operasional standar (SOP) langkah-demi-langkah untuk memulihkan database PostgreSQL apabila terjadi kegagalan sistem, insiden kegagalan hardware/cloud, atau korupsi data.

---

## 1. Ringkasan Parameter Pemulihan (RTO & RPO)
- **Target RTO (Recovery Time Objective)**: Maksimal **3 Jam** (Target Drill internal < **60 Menit**).
- **Target RPO (Recovery Point Objective)**: Maksimal **24 Jam** (Backup otomatis S3 harian) atau **5 Menit** jika fitur Railway PITR aktif.
- **Strategi Backup**: PostgreSQL Custom Format (`pg_dump -Fc`), terenkripsi AES-256-GCM, tersimpan di S3-kompatibel di luar Railway.
- **Skema Retensi**: 7 Harian, 4 Mingguan, 6 Bulanan.

---

## 2. Estimasi Durasi Pemulihan per Tahap

| Tahap | Aktivitas | Estimasi Durasi |
|---|---|---|
| **Tahap 1** | Identifikasi Insiden & Deklarasi Bencana | 5 - 10 Menit |
| **Tahap 2** | Provisioning Database PostgreSQL Baru di Railway | 3 - 5 Menit |
| **Tahap 3** | Mengunduh & Mendekripsi Backup Dump dari S3 | 2 - 5 Menit |
| **Tahap 4** | Eksekusi `pg_restore` ke Database Baru | 5 - 15 Menit |
| **Tahap 5** | Pembaruan Variabel `DATABASE_URL` di Dashboard Railway | 2 - 3 Menit |
| **Tahap 6** | Pengecekan Kesehatan API (`/api/health`) & Audit Saldo | 3 - 5 Menit |
| **TOTAL** | **Target Selesai Lintas Seluruh Tahap** | **18 - 43 Menit** (< 60 Menit) |

---

## 3. Prosedur Pemulihan Langkah-demi-Langkah

### Tahap 1: Pengambilan File Backup Dump Terakhir dari S3
1. Buka konsol storage S3 / Cloudflare R2 / Wasabi yang digunakan.
2. Unduh file dump terenkripsi terbaru (`mma-postgres-YYYYMMDD-HHMMSS.dump.enc`).
3. Atau jalankan skrip bantu jika S3 terhubung pada mesin operator:
   ```bash
   node scripts/restore-database.js
   ```

### Tahap 2: Mendekripsi File Dump
Jika dilakukan secara manual di mesin lokal/operator:
```bash
# Set passphrase enkripsi pada environment
export ENCRYPTION_PASSPHRASE="<passphrase-anda>"

# Jalankan skrip restore/dekripsi
node scripts/restore-database.js ./backups/mma-postgres-LATEST.dump.enc
```

### Tahap 3: Membuat Database PostgreSQL Baru di Dashboard Railway
1. Masuk ke Dashboard Railway: `https://railway.app`.
2. Buka Project **MMA Backend**.
3. Klik tombol **"+ New"** di kanan atas canvas service -> Pilih **Database** -> **PostgreSQL**.
4. Setelah service PostgreSQL baru terbuat, masuk ke tab **Connect**.
5. Salin **Postgres Connection URL** (`postgresql://postgres:...@...railway.app:port/railway`).

### Tahap 4: Mengisi Data dari Dump (`pg_restore`)
Jalankan perintah `pg_restore` ke connection string database PostgreSQL yang baru terbuat:
```bash
pg_restore --no-owner --no-acl --clean --if-exists --dbname="<POSTGRES_URL_BARU>" ./backups/temp-decrypted.dump
```

### Tahap 5: Mengubah `DATABASE_URL` pada Application Service
1. Buka service Node.js Application (**mma-backend**) di Dashboard Railway.
2. Buka tab **Variables**.
3. Cari variabel `DATABASE_URL` dan ubah nilainya menjadi URL PostgreSQL yang baru.
4. Klik **Deploy** / **Redeploy** untuk mengaplikasikan variabel lingkungan baru.
5. Service akan otomatis *restart* dan mengeksekusi `initializeDatabase()` serta migrasi idempoten `schema.pg.sql`.

### Tahap 6: Verifikasi Kesehatan & Audit Saldo
1. **Health Check Endpoint**:
   Buka URL health check API:
   ```bash
   curl -i https://mma-backend-production.up.railway.app/api/health
   ```
   *Respons Wajib*: HTTP 200 OK `{"ok":true, "db":true}`.

2. **Audit Saldo & Ledger**:
   Panggil endpoint audit saldo melalui akun Superadmin/BMT:
   ```bash
   curl -H "Authorization: Bearer <TOKEN_SUPERADMIN>" https://mma-backend-production.up.railway.app/api/transaksi/audit-saldo
   ```
   *Hasil Wajib*: `jumlahTidakCocok: 0` dan `tidakCocok: []`.

3. **Uji Transaksi Sampel**:
   Lakukan 1 sampel verifikasi baca data santri via `/api/santri/me-anak` atau login wali untuk memastikan relasi data utuh.

---

## 4. Kontak Darurat Bencana
- **Superadmin / Tim IT MMA**: IT / Sekretariat MMA
- **Database Administrator**: Tim Backend MMA
