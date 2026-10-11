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

test("MODUL PENGAJARAN: Master Kelas CRUD, Wali Kelas, dan Rename Cascade", async () => {
  const uid = crypto.randomUUID().slice(0, 8);
  const guruId = `guru_pj_${uid}`;
  const waliId = `guru_wali_${uid}`;
  const santriId = `santri_pj_${uid}`;
  const namaKelasAwal = `Kelas_Test_${uid}`;
  const namaKelasBaru = `Kelas_Renamed_${uid}`;

  // 1. Setup staff pengajaran
  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "mustChangePassword", "sessionVersion") VALUES ($1, $2, $3, $4, $5, FALSE, 0)',
    [guruId, "Guru Pengajaran", `pengajaran_${uid}`, "pass123", "pengajaran"]
  );
  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "mustChangePassword", "sessionVersion") VALUES ($1, $2, $3, $4, $5, FALSE, 0)',
    [waliId, "Wali Kelas 1A", `wali_${uid}`, "pass123", "pengajaran"]
  );

  const tokenPengajaran = buatToken({ id: guruId, role: "guru", departemen: "pengajaran", nama: "Guru Pengajaran" });

  // 2. Tambah Master Kelas
  const resCreate = await fetch(`${baseUrl}/api/pengajaran/kelas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenPengajaran}` },
    body: JSON.stringify({ nama: namaKelasAwal, waliKelasId: waliId, tingkat: "1" }),
  });
  assert.equal(resCreate.status, 201);
  const dataCreate = await resCreate.json();
  assert.equal(dataCreate.nama, namaKelasAwal);
  assert.equal(dataCreate.waliKelasId, waliId);

  // 3. Tambah santri dengan kelas tersebut
  await query(
    'INSERT INTO "Santri" ("id", "nama", "nis", "kelas", "saldo") VALUES ($1, $2, $3, $4, $5)',
    [santriId, `Santri Test ${uid}`, `NIS_${uid}`, namaKelasAwal, 0]
  );

  // 4. Ubah nama kelas (cascade update ke Santri)
  const resUpdate = await fetch(`${baseUrl}/api/pengajaran/kelas/${encodeURIComponent(namaKelasAwal)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenPengajaran}` },
    body: JSON.stringify({ nama: namaKelasBaru, waliKelasId: waliId }),
  });
  assert.equal(resUpdate.status, 200);
  const dataUpdate = await resUpdate.json();
  assert.equal(dataUpdate.nama, namaKelasBaru);

  // Verifikasi santri.kelas ikut berubah
  const santriCheck = await queryOne('SELECT * FROM "Santri" WHERE "id" = $1', [santriId]);
  assert.equal(santriCheck.kelas, namaKelasBaru);

  // 5. Ubah wali kelas via dedicated endpoint
  const resWali = await fetch(`${baseUrl}/api/pengajaran/kelas/${encodeURIComponent(namaKelasBaru)}/wali`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenPengajaran}` },
    body: JSON.stringify({ waliKelasId: null }),
  });
  assert.equal(resWali.status, 200);
  const dataWali = await resWali.json();
  assert.equal(dataWali.waliKelasId, null);

  // 6. Hapus Kelas
  const resDel = await fetch(`${baseUrl}/api/pengajaran/kelas/${encodeURIComponent(namaKelasBaru)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${tokenPengajaran}` },
  });
  assert.equal(resDel.status, 200);

  // Cleanup
  await query('DELETE FROM "Santri" WHERE "id" = $1', [santriId]);
  await query('DELETE FROM "Guru" WHERE "id" IN ($1, $2)', [guruId, waliId]);
});

test("MODUL LPTQ: Master Halaqoh CRUD, Pembimbing, dan Master Materi Ubudiyah", async () => {
  const uid = crypto.randomUUID().slice(0, 8);
  const guruId = `guru_lptq_${uid}`;
  const pembimbingId = `pembimbing_${uid}`;
  const santriId = `santri_lptq_${uid}`;
  const namaHalaqohAwal = `Halaqoh_Test_${uid}`;
  const namaHalaqohBaru = `Halaqoh_Renamed_${uid}`;

  // 1. Setup staff LPTQ
  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "mustChangePassword", "sessionVersion") VALUES ($1, $2, $3, $4, $5, FALSE, 0)',
    [guruId, "Guru LPTQ", `lptq_${uid}`, "pass123", "lptq"]
  );
  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "mustChangePassword", "sessionVersion") VALUES ($1, $2, $3, $4, $5, FALSE, 0)',
    [pembimbingId, "Ustadz Pembimbing", `pemb_${uid}`, "pass123", "lptq"]
  );

  const tokenLptq = buatToken({ id: guruId, role: "guru", departemen: "lptq", nama: "Guru LPTQ" });

  // 2. Tambah Master Halaqoh
  const resCreate = await fetch(`${baseUrl}/api/lptq/halaqoh`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenLptq}` },
    body: JSON.stringify({ nama: namaHalaqohAwal, pembimbingId }),
  });
  assert.equal(resCreate.status, 201);
  const dataCreate = await resCreate.json();
  assert.equal(dataCreate.nama, namaHalaqohAwal);
  assert.equal(dataCreate.pembimbingId, pembimbingId);

  // 3. Tambah santri dengan halaqoh tersebut
  await query(
    'INSERT INTO "Santri" ("id", "nama", "nis", "halaqoh", "saldo") VALUES ($1, $2, $3, $4, $5)',
    [santriId, `Santri Halaqoh ${uid}`, `NIS_H_${uid}`, namaHalaqohAwal, 0]
  );

  // 4. Ubah nama halaqoh (cascade update ke Santri)
  const resUpdate = await fetch(`${baseUrl}/api/lptq/halaqoh/${encodeURIComponent(namaHalaqohAwal)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenLptq}` },
    body: JSON.stringify({ nama: namaHalaqohBaru, pembimbingId }),
  });
  assert.equal(resUpdate.status, 200);

  // Verifikasi santri.halaqoh ikut berubah
  const santriCheck = await queryOne('SELECT * FROM "Santri" WHERE "id" = $1', [santriId]);
  assert.equal(santriCheck.halaqoh, namaHalaqohBaru);

  // 5. Ubah pembimbing via dedicated endpoint
  const resPemb = await fetch(`${baseUrl}/api/lptq/halaqoh/${encodeURIComponent(namaHalaqohBaru)}/pembimbing`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenLptq}` },
    body: JSON.stringify({ pembimbingId: null }),
  });
  assert.equal(resPemb.status, 200);

  // 6. Hapus Halaqoh
  const resDel = await fetch(`${baseUrl}/api/lptq/halaqoh/${encodeURIComponent(namaHalaqohBaru)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${tokenLptq}` },
  });
  assert.equal(resDel.status, 200);

  // 7. Test Master Materi Ubudiyah & Doa CRUD
  const materiNama = `Doa Masuk Masjid ${uid}`;
  const resMateri = await fetch(`${baseUrl}/api/lptq/materi-ubudiyah`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenLptq}` },
    body: JSON.stringify({ jenis: "Doa", nama: materiNama }),
  });
  assert.equal(resMateri.status, 201);
  const dataMateri = await resMateri.json();
  assert.equal(dataMateri.nama, materiNama);

  // Read materi list
  const resMateriList = await fetch(`${baseUrl}/api/lptq/materi-ubudiyah?jenis=Doa`, {
    headers: { Authorization: `Bearer ${tokenLptq}` },
  });
  assert.equal(resMateriList.status, 200);
  const listMateri = await resMateriList.json();
  assert.ok(listMateri.some((m) => m.nama === materiNama));

  // Delete materi by nama and jenis
  const resDelMateri = await fetch(`${baseUrl}/api/lptq/materi-ubudiyah/${encodeURIComponent(materiNama)}?jenis=Doa`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${tokenLptq}` },
  });
  assert.equal(resDelMateri.status, 200);

  // Cleanup
  await query('DELETE FROM "Santri" WHERE "id" = $1', [santriId]);
  await query('DELETE FROM "Guru" WHERE "id" IN ($1, $2)', [guruId, pembimbingId]);
});

test("MODUL PENGAJARAN: Nilai Akademik, Edit Nilai, Prestasi, dan Hitung Ranking", async () => {
  const uid = crypto.randomUUID().slice(0, 8);
  const guruId = `guru_nilai_${uid}`;
  const santri1Id = `santri_n1_${uid}`;
  const santri2Id = `santri_n2_${uid}`;
  const kelas = `Kelas_Nilai_${uid}`;
  const tahunAjaran = "2026/2027";
  const semester = "Ganjil";

  // Setup staff
  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "mustChangePassword", "sessionVersion") VALUES ($1, $2, $3, $4, $5, FALSE, 0)',
    [guruId, "Guru Penilai", `penilai_${uid}`, "pass123", "pengajaran"]
  );
  // Setup santri
  await query(
    'INSERT INTO "Santri" ("id", "nama", "nis", "kelas", "saldo") VALUES ($1, $2, $3, $4, $5)',
    [santri1Id, `Santri Ranking 1 ${uid}`, `NIS_R1_${uid}`, kelas, 0]
  );
  await query(
    'INSERT INTO "Santri" ("id", "nama", "nis", "kelas", "saldo") VALUES ($1, $2, $3, $4, $5)',
    [santri2Id, `Santri Ranking 2 ${uid}`, `NIS_R2_${uid}`, kelas, 0]
  );

  const tokenPengajaran = buatToken({ id: guruId, role: "guru", departemen: "pengajaran", nama: "Guru Penilai" });

  // 1. Input Nilai Santri 1
  const resNilai1 = await fetch(`${baseUrl}/api/pengajaran/nilai`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenPengajaran}` },
    body: JSON.stringify({
      santriId: santri1Id,
      mapel: "Matematika",
      nilai: 95,
      tahunAjaran,
      semester,
      jenisNilai: "UAS",
    }),
  });
  assert.equal(resNilai1.status, 201);
  const dataNilai1 = await resNilai1.json();
  assert.equal(dataNilai1.nilai, 95);
  assert.equal(dataNilai1.jenisNilai, "UAS");

  // 2. Input Nilai Santri 2
  await fetch(`${baseUrl}/api/pengajaran/nilai`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenPengajaran}` },
    body: JSON.stringify({
      santriId: santri2Id,
      mapel: "Matematika",
      nilai: 75,
      tahunAjaran,
      semester,
      jenisNilai: "UAS",
    }),
  });

  // 3. Edit Nilai Santri 1 (PUT)
  const resEditNilai = await fetch(`${baseUrl}/api/pengajaran/nilai/${dataNilai1.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenPengajaran}` },
    body: JSON.stringify({
      mapel: "Matematika",
      nilai: 98,
      tahunAjaran,
      semester,
      jenisNilai: "UAS",
    }),
  });
  assert.equal(resEditNilai.status, 200);
  const dataEditNilai = await resEditNilai.json();
  assert.equal(dataEditNilai.nilai, 98);

  // 4. Hitung Ranking Kelas Otomatis
  const resRanking = await fetch(`${baseUrl}/api/pengajaran/raport/hitung-ranking`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenPengajaran}` },
    body: JSON.stringify({ kelas, tahunAjaran, semester }),
  });
  assert.equal(resRanking.status, 200);
  const rankingList = await resRanking.json();
  assert.equal(rankingList.length, 2);
  const rank1 = rankingList.find((r) => r.santriId === santri1Id);
  assert.equal(rank1.peringkat, 1);
  assert.equal(rank1.totalSantri, 2);

  // 5. Simpan Rapor Akademik dengan parsing totalSantri
  const resRaport = await fetch(`${baseUrl}/api/pengajaran/raport`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenPengajaran}` },
    body: JSON.stringify({
      santriId: santri1Id,
      tahunAjaran,
      semester,
      peringkat: "1 dari 2",
      catatan: "Sangat berprestasi.",
    }),
  });
  assert.equal(resRaport.status, 201);
  const dataRaport = await resRaport.json();
  assert.equal(dataRaport.peringkat, "1 dari 2");
  assert.equal(dataRaport.totalSantri, 2);

  // 6. Test Prestasi Create & Edit
  const resPres = await fetch(`${baseUrl}/api/pengajaran/prestasi`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenPengajaran}` },
    body: JSON.stringify({
      santriId: santri1Id,
      judul: "Juara 1 Sains",
      tingkat: "Kabupaten",
    }),
  });
  assert.equal(resPres.status, 201);
  const dataPres = await resPres.json();

  const resEditPres = await fetch(`${baseUrl}/api/pengajaran/prestasi/${dataPres.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenPengajaran}` },
    body: JSON.stringify({
      judul: "Juara 1 Sains Terbuka",
      tingkat: "Provinsi",
    }),
  });
  assert.equal(resEditPres.status, 200);
  const dataEditPres = await resEditPres.json();
  assert.equal(dataEditPres.judul, "Juara 1 Sains Terbuka");
  assert.equal(dataEditPres.tingkat, "Provinsi");

  // Cleanup
  await query('DELETE FROM "RaportAkademik" WHERE "santriId" IN ($1, $2)', [santri1Id, santri2Id]);
  await query('DELETE FROM "Prestasi" WHERE "santriId" IN ($1, $2)', [santri1Id, santri2Id]);
  await query('DELETE FROM "Nilai" WHERE "santriId" IN ($1, $2)', [santri1Id, santri2Id]);
  await query('DELETE FROM "Santri" WHERE "id" IN ($1, $2)', [santri1Id, santri2Id]);
  await query('DELETE FROM "Guru" WHERE "id" = $1', [guruId]);
});

test("MODUL LPTQ: Hafalan Tahfidz Detail, Evaluasi Ubudiyah, dan Edit Endpoints", async () => {
  const uid = crypto.randomUUID().slice(0, 8);
  const guruId = `guru_lptq2_${uid}`;
  const santriId = `santri_hafalan_${uid}`;

  // Setup staff & santri
  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "mustChangePassword", "sessionVersion") VALUES ($1, $2, $3, $4, $5, FALSE, 0)',
    [guruId, "Guru Tahfidz", `tahfidz_${uid}`, "pass123", "lptq"]
  );
  await query(
    'INSERT INTO "Santri" ("id", "nama", "nis", "saldo") VALUES ($1, $2, $3, $4)',
    [santriId, `Santri Tahfidz ${uid}`, `NIS_T_${uid}`, 0]
  );

  const tokenLptq = buatToken({ id: guruId, role: "guru", departemen: "lptq", nama: "Guru Tahfidz" });

  // 1. Catat Hafalan dengan detail
  const resHafalan = await fetch(`${baseUrl}/api/lptq/hafalan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenLptq}` },
    body: JSON.stringify({
      santriId,
      juz: "30",
      surah: "An-Naba",
      ayat: "1-20",
      predikat: "Mumtaz",
      nilaiTajwid: 90,
      nilaiFashahah: 92,
    }),
  });
  assert.equal(resHafalan.status, 201);
  const dataHafalan = await resHafalan.json();
  assert.equal(dataHafalan.surah, "An-Naba");
  assert.equal(dataHafalan.predikat, "Mumtaz");
  assert.equal(dataHafalan.nilaiTajwid, 90);

  // 2. Ubah Hafalan (PUT)
  const resEditHafalan = await fetch(`${baseUrl}/api/lptq/hafalan/${dataHafalan.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenLptq}` },
    body: JSON.stringify({
      juz: "30",
      surah: "An-Naba",
      ayat: "1-40",
      predikat: "Mumtaz",
      nilaiTajwid: 95,
      nilaiFashahah: 95,
    }),
  });
  assert.equal(resEditHafalan.status, 200);
  const dataEditHafalan = await resEditHafalan.json();
  assert.equal(dataEditHafalan.ayat, "1-40");
  assert.equal(dataEditHafalan.nilaiTajwid, 95);

  // 3. Catat Penilaian Ubudiyah
  const resUb = await fetch(`${baseUrl}/api/lptq/ubudiyah`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenLptq}` },
    body: JSON.stringify({
      santriId,
      jenis: "Ubudiyah",
      materi: "Wudhu dan Sholat Jenazah",
      predikat: "Jayyid Jiddan",
      catatan: "Gerakan sudah tertib.",
    }),
  });
  assert.equal(resUb.status, 201);
  const dataUb = await resUb.json();
  assert.equal(dataUb.predikat, "Jayyid Jiddan");

  // 4. Ubah Penilaian Ubudiyah (PUT)
  const resEditUb = await fetch(`${baseUrl}/api/lptq/ubudiyah/${dataUb.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenLptq}` },
    body: JSON.stringify({
      jenis: "Ubudiyah",
      materi: "Wudhu dan Sholat Jenazah",
      predikat: "Mumtaz",
      catatan: "Sempurna tanpa catatan.",
    }),
  });
  assert.equal(resEditUb.status, 200);
  const dataEditUb = await resEditUb.json();
  assert.equal(dataEditUb.predikat, "Mumtaz");

  // Cleanup
  await query('DELETE FROM "Hafalan" WHERE "santriId" = $1', [santriId]);
  await query('DELETE FROM "PenilaianUbudiyah" WHERE "santriId" = $1', [santriId]);
  await query('DELETE FROM "Santri" WHERE "id" = $1', [santriId]);
  await query('DELETE FROM "Guru" WHERE "id" = $1', [guruId]);
});
