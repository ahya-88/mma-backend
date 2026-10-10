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
const {
  catatAbsensi,
  catatAbsensiMassal,
  absensiPadaTanggal,
  ajukanPerizinan,
  prosesPerizinan,
  daftarPerizinan,
  catatPelanggaran,
  pelanggaranSantri,
} = require("../src/pengasuhanService");

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

test("MODUL PENGASUHAN: Presensi Idempoten, Presensi Massal, dan Filter Asrama", async () => {
  const uid = crypto.randomUUID().slice(0, 8);
  const guruId = `guru_p_${uid}`;
  const santri1Id = `santri_p1_${uid}`;
  const santri2Id = `santri_p2_${uid}`;
  const kelas = `Kelas_Pengasuhan_${uid}`;
  const asrama = `Asrama_Ali_${uid}`;
  const tanggalHariIni = new Date().toISOString().slice(0, 10);

  // Setup staff guru pengasuhan
  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "mustChangePassword", "sessionVersion") VALUES ($1, $2, $3, $4, $5, FALSE, 0)',
    [guruId, "Ustadz Pembina", `pembina_${uid}`, "pass123", "pengasuhan"]
  );

  // Setup data santri
  await query(
    'INSERT INTO "Santri" ("id", "nama", "kelas", "asrama", "saldo", "statusSantri", "is_deleted") VALUES ($1, $2, $3, $4, 0, $5, FALSE)',
    [santri1Id, `Ahmad Pengasuhan 1 ${uid}`, kelas, asrama, "Aktif"]
  );
  await query(
    'INSERT INTO "Santri" ("id", "nama", "kelas", "asrama", "saldo", "statusSantri", "is_deleted") VALUES ($1, $2, $3, $4, 0, $5, FALSE)',
    [santri2Id, `Budi Pengasuhan 2 ${uid}`, kelas, asrama, "Aktif"]
  );

  const tokenPengasuhan = buatToken({
    id: guruId,
    role: "guru",
    departemen: "pengasuhan",
    nama: "Ustadz Pembina",
  });

  try {
    // 1. Presensi Tunggal pertama (Hadir)
    const absen1 = await catatAbsensi({
      santriId: santri1Id,
      tanggalISO: tanggalHariIni,
      status: "Hadir",
      dicatatOleh: "Ustadz Pembina",
    });
    assert.equal(absen1.status, "Hadir");

    // 2. Presensi Ulang di tanggal yang sama (Ganti status jadi Izin) -> Wajib Idempoten (UPSERT), bukan duplicate
    const absenUpdate = await catatAbsensi({
      santriId: santri1Id,
      tanggalISO: tanggalHariIni,
      status: "Izin",
      keterangan: "Izin ke klinik",
      dicatatOleh: "Ustadz Pembina",
    });
    assert.equal(absenUpdate.status, "Izin");

    // Verifikasi di database hanya ada 1 baris untuk santri1 di tanggal tersebut
    const hitungBaris = await queryOne(
      'SELECT COUNT(*) as "cnt" FROM "Absensi" WHERE "santriId" = $1 AND "tanggalISO" = $2',
      [santri1Id, tanggalHariIni]
    );
    assert.equal(Number(hitungBaris.cnt), 1, "Harus tepat 1 baris presensi per santri per tanggal (UPSERT)");

    // 3. Presensi Massal via HTTP Endpoint (POST /api/pengasuhan/absensi/massal)
    const resMassal = await fetch(`${baseUrl}/api/pengasuhan/absensi/massal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenPengasuhan}`,
      },
      body: JSON.stringify({
        santriIds: [santri1Id, santri2Id],
        tanggalISO: tanggalHariIni,
        status: "Hadir",
        keterangan: "Presensi apel pagi massal",
      }),
    });
    assert.ok(resMassal.status === 200 || resMassal.status === 201, `Status harus 200 atau 201, didapat ${resMassal.status}`);
    const hasilMassal = await resMassal.json();
    assert.equal(hasilMassal.sukses, true);
    assert.equal(hasilMassal.total, 2);

    // 4. Query Absensi dengan filter asrama
    const listAbsenAsrama = await absensiPadaTanggal(tanggalHariIni, { asrama });
    const santriIdsDiabsen = listAbsenAsrama.map((a) => a.santriId);
    assert.ok(santriIdsDiabsen.includes(santri1Id));
    assert.ok(santriIdsDiabsen.includes(santri2Id));

  } finally {
    await query('DELETE FROM "Absensi" WHERE "santriId" IN ($1, $2)', [santri1Id, santri2Id]);
    await query('DELETE FROM "Santri" WHERE "id" IN ($1, $2)', [santri1Id, santri2Id]);
    await query('DELETE FROM "Guru" WHERE "id" = $1', [guruId]);
  }
});

test("MODUL PENGASUHAN: Siklus Lengkap Perizinan (Pengajuan, Persetujuan, dan Kembali)", async () => {
  const uid = crypto.randomUUID().slice(0, 8);
  const guruId = `guru_izin_${uid}`;
  const santriId = `santri_izin_${uid}`;
  const tanggalHariIni = new Date().toISOString().slice(0, 10);
  const tanggalKembaliRencana = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);

  // Setup staff guru pengasuhan
  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "mustChangePassword", "sessionVersion") VALUES ($1, $2, $3, $4, $5, FALSE, 0)',
    [guruId, "Ustadz Izin", `izin_${uid}`, "pass123", "pengasuhan"]
  );

  await query(
    'INSERT INTO "Santri" ("id", "nama", "kelas", "saldo", "statusSantri", "is_deleted") VALUES ($1, $2, $3, 0, $4, FALSE)',
    [santriId, `Santri Izin ${uid}`, "Kelas 2A", "Aktif"]
  );

  const tokenPengasuhan = buatToken({
    id: guruId,
    role: "guru",
    departemen: "pengasuhan",
    nama: "Ustadz Izin",
  });

  try {
    // 1. Ajukan Perizinan dengan tanggal rencana kembali
    const resAjukan = await fetch(`${baseUrl}/api/pengasuhan/perizinan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenPengasuhan}`,
      },
      body: JSON.stringify({
        santriId,
        jenis: "Pulang",
        tanggalKeluar: tanggalHariIni,
        tanggalKembali: tanggalKembaliRencana,
        alasan: "Keperluan keluarga di luar kota",
      }),
    });
    assert.equal(resAjukan.status, 201);
    const izinBaru = await resAjukan.json();
    assert.equal(izinBaru.status, "Menunggu");
    assert.equal(izinBaru.tanggalKembali, tanggalKembaliRencana);

    // 2. Pembina menyetujui izin
    const resSetujui = await fetch(`${baseUrl}/api/pengasuhan/perizinan/${izinBaru.id}/proses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenPengasuhan}`,
      },
      body: JSON.stringify({
        status: "Disetujui",
      }),
    });
    assert.equal(resSetujui.status, 200);
    const izinDisetujui = await resSetujui.json();
    assert.equal(izinDisetujui.status, "Disetujui");
    assert.equal(izinDisetujui.disetujuiOleh, "Ustadz Izin");

    // 3. Santri kembali ke pesantren (Check-in kembali)
    const waktuKembali = new Date().toISOString();
    const resKembali = await fetch(`${baseUrl}/api/pengasuhan/perizinan/${izinBaru.id}/proses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenPengasuhan}`,
      },
      body: JSON.stringify({
        status: "Kembali",
        tanggalKembaliAktual: waktuKembali,
        catatanKembali: "Tiba di gerbang pesantren dalam kondisi sehat",
      }),
    });
    assert.equal(resKembali.status, 200);
    const izinKembali = await resKembali.json();
    assert.equal(izinKembali.status, "Kembali");
    assert.ok(izinKembali.tanggalKembaliAktual);
    assert.equal(izinKembali.catatanKembali, "Tiba di gerbang pesantren dalam kondisi sehat");

  } finally {
    await query('DELETE FROM "Perizinan" WHERE "santriId" = $1', [santriId]);
    await query('DELETE FROM "Santri" WHERE "id" = $1', [santriId]);
    await query('DELETE FROM "Guru" WHERE "id" = $1', [guruId]);
  }
});

test("MODUL PENGASUHAN & WALI: Visibilitas Rapor Ringkas dan Isolasi Data", async () => {
  const uid = crypto.randomUUID().slice(0, 8);
  const waliAId = `wali_A_${uid}`;
  const waliBId = `wali_B_${uid}`;
  const santriAId = `santri_A_${uid}`;
  const tanggalHariIni = new Date().toISOString().slice(0, 10);

  // Buat akun wali A dan B
  await query(
    'INSERT INTO "Wali" ("id", "nama", "username", "password", "hp", "mustChangePassword", "sessionVersion") VALUES ($1, $2, $3, $4, $5, FALSE, 0)',
    [waliAId, "Wali Santri Ahmad", `wali_a_${uid}`, "hash", "08123456789"]
  );
  await query(
    'INSERT INTO "Wali" ("id", "nama", "username", "password", "hp", "mustChangePassword", "sessionVersion") VALUES ($1, $2, $3, $4, $5, FALSE, 0)',
    [waliBId, "Wali Santri Budi", `wali_b_${uid}`, "hash", "08123456780"]
  );

  // Santri A milik Wali A
  await query(
    'INSERT INTO "Santri" ("id", "nama", "kelas", "waliId", "saldo", "statusSantri", "is_deleted") VALUES ($1, $2, $3, $4, 0, $5, FALSE)',
    [santriAId, `Ahmad Junior ${uid}`, "Tahfidz 1A", waliAId, "Aktif"]
  );

  // Masukkan data presensi, izin, dan pelanggaran untuk Santri A
  await catatAbsensi({
    santriId: santriAId,
    tanggalISO: tanggalHariIni,
    status: "Hadir",
    dicatatOleh: "Sistem Pengasuhan",
  });
  await ajukanPerizinan({
    santriId: santriAId,
    jenis: "Pulang",
    tanggalKeluar: tanggalHariIni,
    alasan: "Izin akhir pekan",
  });
  await catatPelanggaran({
    santriId: santriAId,
    jenis: "Terlambat Shalat Berjamaah",
    poin: 5,
    dicatatOleh: "Musyrif Asrama",
  });

  const tokenWaliA = buatToken({ id: waliAId, role: "wali", nama: "Wali Santri Ahmad" });
  const tokenWaliB = buatToken({ id: waliBId, role: "wali", nama: "Wali Santri Budi" });

  try {
    // 1. Wali A mengakses rapor ringkas Santri A (harus sukses & memuat data pengasuhan)
    const resA = await fetch(`${baseUrl}/api/santri/${santriAId}/rapor-ringkas`, {
      headers: { Authorization: `Bearer ${tokenWaliA}` },
    });
    assert.equal(resA.status, 200);
    const dataRapor = await resA.json();

    assert.ok(Array.isArray(dataRapor.absensi), "Rapor ringkas harus menyertakan array absensi");
    assert.equal(dataRapor.absensi.length, 1);
    assert.equal(dataRapor.absensi[0].status, "Hadir");

    assert.ok(Array.isArray(dataRapor.perizinan), "Rapor ringkas harus menyertakan array perizinan");
    assert.equal(dataRapor.perizinan.length, 1);
    assert.equal(dataRapor.perizinan[0].jenis, "Pulang");

    assert.ok(dataRapor.rekapAbsensi, "Rapor ringkas harus memuat rekap absensi");
    assert.equal(dataRapor.rekapAbsensi.Hadir, 1);
    assert.equal(dataRapor.totalPoinPelanggaran, 5, "Total poin pelanggaran harus terhitung otomatis");

    // 2. Wali B mencoba mengakses santri A (harus 403 Forbidden - Isolasi data)
    const resHacking = await fetch(`${baseUrl}/api/santri/${santriAId}/rapor-ringkas`, {
      headers: { Authorization: `Bearer ${tokenWaliB}` },
    });
    assert.equal(resHacking.status, 403, "Wali lain tidak boleh mengakses rapor santri yang bukan anaknya");

  } finally {
    await query('DELETE FROM "Absensi" WHERE "santriId" = $1', [santriAId]);
    await query('DELETE FROM "Perizinan" WHERE "santriId" = $1', [santriAId]);
    await query('DELETE FROM "Pelanggaran" WHERE "santriId" = $1', [santriAId]);
    await query('DELETE FROM "Santri" WHERE "id" = $1', [santriAId]);
    await query('DELETE FROM "Wali" WHERE "id" IN ($1, $2)', [waliAId, waliBId]);
  }
});
