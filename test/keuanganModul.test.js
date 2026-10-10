require("dotenv").config({ quiet: true });
if (process.env.NEON_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.NEON_DATABASE_URL;
}

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const { pool, query, queryOne, initializeDatabase } = require("../src/db");

const JWT_SECRET = (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 32)
  ? process.env.JWT_SECRET.trim()
  : "mma-cashless-secure-production-jwt-secret-96-bytes-fallback-key";

function buatToken(payload) {
  return jwt.sign({ sv: 0, ...payload }, JWT_SECRET, { expiresIn: "1h" });
}

let server;
let baseUrl;

test.before(async () => {
  await initializeDatabase();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test("MODUL KEUANGAN: Penagihan Massal, Koreksi, Pembayaran, dan Otomatisasi Cashflow", async () => {
  const uid = crypto.randomUUID().slice(0, 8);
  const guruId = `guru_k_${uid}`;
  const santri1Id = `santri_k1_${uid}`;
  const santri2Id = `santri_k2_${uid}`;

  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "mustChangePassword", "sessionVersion") VALUES ($1, $2, $3, $4, $5, FALSE, 0)',
    [guruId, "Staf Administrasi", `admin_keu_${uid}`, "pass123", "administrasi"]
  );

  await query(
    'INSERT INTO "Santri" ("id", "nama", "kelas", "saldo", "is_deleted") VALUES ($1, $2, $3, 0, FALSE)',
    [santri1Id, `Santri Keuangan 1 ${uid}`, "7A"]
  );
  await query(
    'INSERT INTO "Santri" ("id", "nama", "kelas", "saldo", "is_deleted") VALUES ($1, $2, $3, 0, FALSE)',
    [santri2Id, `Santri Keuangan 2 ${uid}`, "7A"]
  );

  const tokenAdmin = buatToken({
    id: guruId,
    role: "guru",
    departemen: "administrasi",
    nama: "Staf Administrasi",
  });

  try {
    // 1. Penagihan Massal (POST /api/keuangan/tagihan dengan santriIds array)
    const resBatch = await fetch(`${baseUrl}/api/keuangan/tagihan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({
        santriIds: [santri1Id, santri2Id],
        jenis: "Syahriyah",
        jumlah: 500000,
        bulan: "Oktober 2026",
      }),
    });
    assert.equal(resBatch.status, 201);
    const dataBatch = await resBatch.json();
    assert.equal(dataBatch.createdCount, 2);
    assert.equal(dataBatch.ids.length, 2);

    const tagihan1Id = dataBatch.ids[0];

    // 2. Koreksi Tagihan (PUT /api/keuangan/tagihan/:id)
    const resKoreksi = await fetch(`${baseUrl}/api/keuangan/tagihan/${tagihan1Id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({
        jumlah: 450000,
        jumlahDibayar: 50000,
      }),
    });
    assert.equal(resKoreksi.status, 200);
    const dataKoreksi = await resKoreksi.json();
    assert.equal(dataKoreksi.jumlah, 450000);
    assert.equal(dataKoreksi.jumlahDibayar, 50000);

    // 3. Pembayaran Tagihan via POST & Sinkronisasi Otomatis ke Cashflow
    const resBayar = await fetch(`${baseUrl}/api/keuangan/tagihan/${tagihan1Id}/bayar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({
        jumlahBayar: 200000,
      }),
    });
    assert.equal(resBayar.status, 200);
    const dataBayar = await resBayar.json();
    assert.equal(dataBayar.jumlahDibayar, 250000);

    // Verifikasi arus kas masuk otomatis tercatat di Cashflow
    const cashflowBayar = await queryOne(
      'SELECT * FROM "Cashflow" WHERE "kategori" = $1 AND "jumlah" = $2 AND "jenis" = $3',
      ["Pembayaran Santri", 200000, "Masuk"]
    );
    assert.ok(cashflowBayar, "Cashflow masuk pembayaran santri harus otomatis tercatat");
    assert.match(cashflowBayar.keterangan, /Pembayaran tagihan Syahriyah/);

    // 4. Hapus Tagihan (DELETE /api/keuangan/tagihan/:id)
    const tagihan2Id = dataBatch.ids[1];
    const resDel = await fetch(`${baseUrl}/api/keuangan/tagihan/${tagihan2Id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.equal(resDel.status, 200);
    const checkDel = await queryOne('SELECT * FROM "Tagihan" WHERE "id" = $1', [tagihan2Id]);
    assert.equal(checkDel, null);

  } finally {
    await query('DELETE FROM "Cashflow" WHERE "kategori" = $1 AND "dicatatOleh" = $2', ["Pembayaran Santri", "Staf Administrasi"]);
    await query('DELETE FROM "Tagihan" WHERE "santriId" IN ($1, $2)', [santri1Id, santri2Id]);
    await query('DELETE FROM "Santri" WHERE "id" IN ($1, $2)', [santri1Id, santri2Id]);
    await query('DELETE FROM "Guru" WHERE "id" = $1', [guruId]);
  }
});

test("MODUL KEUANGAN: Pengajuan Anggaran, Persetujuan, dan Realisasi Otomatis ke Cashflow", async () => {
  const uid = crypto.randomUUID().slice(0, 8);
  const guruId = `guru_ang_${uid}`;

  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "mustChangePassword", "sessionVersion") VALUES ($1, $2, $3, $4, $5, FALSE, 0)',
    [guruId, "Staf Keuangan Anggaran", `keu_ang_${uid}`, "pass123", "administrasi"]
  );

  const tokenAdmin = buatToken({
    id: guruId,
    role: "guru",
    departemen: "administrasi",
    nama: "Staf Keuangan Anggaran",
  });

  let pengajuanId;

  try {
    // 1. Buat Pengajuan Anggaran dengan Rincian
    const resAjukan = await fetch(`${baseUrl}/api/keuangan/anggaran`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({
        namaKegiatan: `Lomba Tahfidz & Kaligrafi ${uid}`,
        unitPengaju: "Pendidikan",
        kategori: "Operasional",
        bulanRencana: "November 2026",
        rincian: [
          { uraian: "Piala & Sertifikat", qty: 3, hargaSatuan: 100000 },
          { uraian: "Konsumsi Panitia", qty: 10, hargaSatuan: 20000 },
        ],
        catatan: "Anggaran kegiatan semester ganjil",
      }),
    });
    assert.equal(resAjukan.status, 201);
    const dataAjukan = await resAjukan.json();
    pengajuanId = dataAjukan.id;
    assert.equal(dataAjukan.totalAnggaran, 500000);
    assert.equal(dataAjukan.rincian.length, 2);

    // 2. Ambil Daftar Anggaran (Wajib memuat rincian)
    const resGet = await fetch(`${baseUrl}/api/keuangan/anggaran`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.equal(resGet.status, 200);
    const listAnggaran = await resGet.json();
    const item = listAnggaran.find((a) => a.id === pengajuanId);
    assert.ok(item, "Pengajuan yang dibuat harus ada di list");
    assert.equal(item.rincian.length, 2);

    // 3. Setujui Anggaran (POST /api/keuangan/anggaran/:id/setujui)
    const resSetujui = await fetch(`${baseUrl}/api/keuangan/anggaran/${pengajuanId}/setujui`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({
        pimpinanId: "pimpinan_utama",
        catatan: "Disetujui untuk dilaksanakan",
      }),
    });
    assert.equal(resSetujui.status, 200);
    const dataSetujui = await resSetujui.json();
    assert.equal(dataSetujui.status, "Disetujui");
    assert.equal(dataSetujui.pimpinanId, "pimpinan_utama");

    // 4. Realisasikan Anggaran (POST /api/keuangan/anggaran/:id/realisasi) -> Otomatis tercatat di Cashflow Keluar
    const resRealisasi = await fetch(`${baseUrl}/api/keuangan/anggaran/${pengajuanId}/realisasi`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({
        jumlahRealisasi: 480000,
      }),
    });
    assert.equal(resRealisasi.status, 200);
    const dataRealisasi = await resRealisasi.json();
    assert.equal(dataRealisasi.status, "Direalisasikan");
    assert.equal(dataRealisasi.realisasiJumlah, 480000);

    // Verifikasi arus kas keluar tercatat di Cashflow
    const cashflowRealisasi = await queryOne(
      'SELECT * FROM "Cashflow" WHERE "jenis" = $1 AND "jumlah" = $2 AND "kategori" = $3',
      ["Keluar", 480000, "Operasional"]
    );
    assert.ok(cashflowRealisasi, "Cashflow pengeluaran realisasi anggaran harus otomatis tercatat");
    assert.match(cashflowRealisasi.keterangan, new RegExp(uid));

    // 5. Hapus Pengajuan Anggaran (DELETE /api/keuangan/anggaran/:id)
    const resDel = await fetch(`${baseUrl}/api/keuangan/anggaran/${pengajuanId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.equal(resDel.status, 200);
    const checkPengajuan = await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1', [pengajuanId]);
    assert.equal(checkPengajuan, null);
    const checkRincian = await queryOne('SELECT * FROM "RincianAnggaran" WHERE "pengajuanId" = $1', [pengajuanId]);
    assert.equal(checkRincian, null);

  } finally {
    if (pengajuanId) {
      await query('DELETE FROM "Cashflow" WHERE "keterangan" LIKE $1', [`%${uid}%`]);
      await query('DELETE FROM "RincianAnggaran" WHERE "pengajuanId" = $1', [pengajuanId]);
      await query('DELETE FROM "PengajuanAnggaran" WHERE "id" = $1', [pengajuanId]);
    }
    await query('DELETE FROM "Guru" WHERE "id" = $1', [guruId]);
  }
});

test("MODUL KEUANGAN: Persistensi Penuh Inventaris Pesantren (CRUD)", async () => {
  const uid = crypto.randomUUID().slice(0, 8);
  const guruId = `guru_inv_${uid}`;

  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "mustChangePassword", "sessionVersion") VALUES ($1, $2, $3, $4, $5, FALSE, 0)',
    [guruId, "Staf Sarpras", `sarpras_${uid}`, "pass123", "administrasi"]
  );

  const tokenAdmin = buatToken({
    id: guruId,
    role: "guru",
    departemen: "administrasi",
    nama: "Staf Sarpras",
  });

  let inventarisId;

  try {
    // 1. Tambah Barang Inventaris (POST /api/keuangan/inventaris)
    const resPost = await fetch(`${baseUrl}/api/keuangan/inventaris`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({
        nama: `Proyektor Epson HD ${uid}`,
        kategori: "Elektronik",
        jumlah: 2,
        kondisi: "Baik",
        lokasi: "Lab Komputer",
        tanggal: "2026-10-10",
        keterangan: "Pengadaan baru sarana mengajar",
      }),
    });
    assert.equal(resPost.status, 201);
    const dataPost = await resPost.json();
    inventarisId = dataPost.id;
    assert.equal(dataPost.nama, `Proyektor Epson HD ${uid}`);
    assert.equal(dataPost.jumlah, 2);

    // 2. Ambil Daftar Inventaris (GET /api/keuangan/inventaris)
    const resGet = await fetch(`${baseUrl}/api/keuangan/inventaris`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.equal(resGet.status, 200);
    const listInv = await resGet.json();
    const item = listInv.find((i) => i.id === inventarisId);
    assert.ok(item, "Item inventaris harus ditemukan dalam daftar");
    assert.equal(item.lokasi, "Lab Komputer");

    // 3. Ubah Kondisi Inventaris (PUT /api/keuangan/inventaris/:id)
    const resPut = await fetch(`${baseUrl}/api/keuangan/inventaris/${inventarisId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({
        kondisi: "Dalam Perbaikan",
        keterangan: "Lensa proyektor sedang diganti teknisi",
      }),
    });
    assert.equal(resPut.status, 200);
    const dataPut = await resPut.json();
    assert.equal(dataPut.kondisi, "Dalam Perbaikan");
    assert.equal(dataPut.keterangan, "Lensa proyektor sedang diganti teknisi");

    // 4. Hapus Inventaris (DELETE /api/keuangan/inventaris/:id)
    const resDel = await fetch(`${baseUrl}/api/keuangan/inventaris/${inventarisId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.equal(resDel.status, 200);
    const check = await queryOne('SELECT * FROM "Inventaris" WHERE "id" = $1', [inventarisId]);
    assert.equal(check, null);

  } finally {
    if (inventarisId) {
      await query('DELETE FROM "Inventaris" WHERE "id" = $1', [inventarisId]);
    }
    await query('DELETE FROM "Guru" WHERE "id" = $1', [guruId]);
  }
});
