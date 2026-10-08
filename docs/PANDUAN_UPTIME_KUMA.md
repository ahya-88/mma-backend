# PANDUAN PENGATURAN MONITORING DENGAN UPTIME KUMA / UPTIMEROBOT / BETTER STACK
**Ma'had Mudaiyatul Anwar (MMA) - Infrastructure Monitoring Guide**

Dokumen ini berisi panduan untuk mengonfigurasi layanan monitoring eksternal (seperti Uptime Kuma, UptimeRobot, Better Stack, atau Healthchecks.io) guna memantau ketersediaan aplikasi, database, dan kesehatan sistem MMA secara *real-time*.

---

## 1. Opsi Layanan Monitoring
1. **Uptime Kuma** (Self-hosted via Railway / Docker / VPS - Gratis & Open Source).
2. **Better Stack / UptimeRobot / Healthchecks.io** (Cloud-hosted SaaS - Tersedia Tier Gratis).

---

## 2. Daftar Endpoint & Monitor yang Wajib Didaftarkan Manual

Berikut adalah daftar monitor yang **harus didaftarkan secara manual** di dashboard Uptime Kuma / UptimeRobot:

### Monitor 1: Public Health Check (Aplikasi & PostgreSQL Status)
- **Nama Monitor**: `MMA Backend - Basic Health`
- **Tipe Monitor**: `HTTP(s)` / `Keyword`
- **URL**: `https://mma.up.railway.app/api/health` (sesuaikan dengan domain live Railway Anda)
- **Interval Check**: `60 Detik` (1 Menit)
- **Expected Status Code**: `200`
- **Keyword / Search Pattern**: `"ok":true`

### Monitor 2: Readiness & Latency Check
- **Nama Monitor**: `MMA Backend - Readiness & DB Latency`
- **Tipe Monitor**: `HTTP(s)` / `Keyword`
- **URL**: `https://mma.up.railway.app/api/readiness`
- **Interval Check**: `60 Detik`
- **Expected Status Code**: `200`
- **Keyword / Search Pattern**: `"status":"ready"`

### Monitor 3: App Branding Endpoint (Tampilan Login)
- **Nama Monitor**: `MMA Backend - App Tampilan`
- **Tipe Monitor**: `HTTP(s)`
- **URL**: `https://mma.up.railway.app/api/public/tampilan`
- **Interval Check**: `180 Detik` (3 Menit)
- **Expected Status Code**: `200`

### Monitor 4: Push Monitor untuk Scheduled Backup S3 (Heartbeat / Healthchecks.io)
- **Nama Monitor**: `MMA Backup - S3 Scheduled Heartbeat`
- **Tipe Monitor**: `Push` / `Passive Heartbeat`
- **Cara Kerja**: Skrip `scripts/backup-s3.js` dipanggil via cron job harian. Di akhir eksekusi sukses, skrip memanggil URL Push Uptime Kuma/Healthchecks.io. Jika tidak menerima ping dalam 25 jam, Uptime Kuma mengirimkan notifikasi alert bahwa backup terhenti.

---

## 3. Langkah-demi-Langkah Pengaturan di Uptime Kuma

### Langkah 1: Menambahkan Monitor `HTTP(s)`
1. Masuk ke Dashboard Uptime Kuma Anda.
2. Klik tombol **"+ Add New Monitor"** di kiri atas.
3. Pilih **Monitor Type**: `HTTP(s) - Keyword`.
4. Isi **Friendly Name**: `MMA Backend - Basic Health`.
5. Isi **URL**: `https://mma.up.railway.app/api/health`.
6. Di bagian **Keyword**, isi: `"ok":true`.
7. Set **Heartbeat Interval**: `60` detik.
8. Set **Retries**: `3` kali (sebelum mengirim notifikasi down).
9. Pilih **Notification Channel** (misal: Telegram / Email / Discord).
10. Klik **Save**.

### Langkah 2: Menghubungkan Channel Notifikasi Telegram / WhatsApp
1. Di Uptime Kuma, buka menu **Settings** -> **Notifications**.
2. Klik **Setup Notification**.
3. Pilih **Notification Type**: `Telegram`.
4. Masukkan `Bot Token` dan `Chat ID`.
5. Klik **Test** untuk memastikan notifikasi teruji masuk ke grup Telegram pengelola.
6. Klik **Save**.

---

## 4. Checklist Pendaftaran Manual untuk Operator
- [ ] Daftarkan Monitor 1 (`/api/health`) di Uptime Kuma / UptimeRobot.
- [ ] Daftarkan Monitor 2 (`/api/readiness`) di Uptime Kuma / UptimeRobot.
- [ ] Daftarkan Monitor 3 (`/api/public/tampilan`) di Uptime Kuma / UptimeRobot.
- [ ] Tes kirim notifikasi uji dari Uptime Kuma ke Telegram/WhatsApp operator.
