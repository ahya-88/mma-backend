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
  simpanRaportAkademik, semuaRaportAkademik, hapusRaportAkademik, hitungRankingKelas,
  simpanRaportTahfidz, semuaRaportTahfidz, hapusRaportTahfidz,
  catatNilai, catatHafalan,
} = require("../src/akademikService");
const {
  catatPenilaianKegiatan, semuaPenilaianKegiatan, hapusPenilaianKegiatan,
  simpanRaportMental, semuaRaportMental, hapusRaportMental,
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

test("RAPOR & PENILAIAN: Layanan Akademik, Perangkingan Otomatis, dan Rapor Akademik", async () => {
  const uid = crypto.randomUUID().slice(0, 8);
  const santri1Id = `santri_akd1_${uid}`;
  const santri2Id = `santri_akd2_${uid}`;
  const kelas = `KLS_${uid}`;

  // Insert 2 santri dalam kelas yang sama
  await query(
    'INSERT INTO "Santri" ("id", "nama", "kelas", "saldo", "statusSantri", "is_deleted") VALUES ($1, $2, $3, 0, $4, FALSE)',
    [santri1Id, `Santri Pintar ${uid}`, kelas, "Aktif"]
  );
  await query(
    'INSERT INTO "Santri" ("id", "nama", "kelas", "saldo", "statusSantri", "is_deleted") VALUES ($1, $2, $3, 0, $4, FALSE)',
    [santri2Id, `Santri Rajin ${uid}`, kelas, "Aktif"]
  );

  try {
    // 1. Catat nilai dengan periode tahun ajaran & semester
    await catatNilai({
      santriId: santri1Id,
      mapel: "Matematika",
      nilai: 95,
      tahunAjaran: "2026/2027",
      semester: "Ganjil",
      jenisNilai: "UAS",
      dicatatOleh: "Ustadz Penguji",
    });
    await catatNilai({
      santriId: santri1Id,
      mapel: "Bahasa Arab",
      nilai: 90,
      tahunAjaran: "2026/2027",
      semester: "Ganjil",
      jenisNilai: "UAS",
      dicatatOleh: "Ustadz Penguji",
    });

    await catatNilai({
      santriId: santri2Id,
      mapel: "Matematika",
      nilai: 80,
      tahunAjaran: "2026/2027",
      semester: "Ganjil",
      jenisNilai: "UAS",
      dicatatOleh: "Ustadz Penguji",
    });
    await catatNilai({
      santriId: santri2Id,
      mapel: "Bahasa Arab",
      nilai: 84,
      tahunAjaran: "2026/2027",
      semester: "Ganjil",
      jenisNilai: "UAS",
      dicatatOleh: "Ustadz Penguji",
    });

    // 2. Hitung ranking kelas
    const ranks = await hitungRankingKelas({
      kelas,
      tahunAjaran: "2026/2027",
      semester: "Ganjil",
    });
    assert.equal(ranks.length, 2);
    assert.equal(ranks[0].santriId, santri1Id);
    assert.equal(ranks[0].peringkat, 1);
    assert.equal(ranks[0].rataRata, 92.5);
    assert.equal(ranks[1].santriId, santri2Id);
    assert.equal(ranks[1].peringkat, 2);
    assert.equal(ranks[1].rataRata, 82);

    // 3. Simpan Raport Akademik
    const savedRaport = await simpanRaportAkademik({
      santriId: santri1Id,
      tahunAjaran: "2026/2027",
      semester: "Ganjil",
      peringkat: "1",
      totalSantri: 2,
      rataRata: 92.5,
      catatan: "Sangat berprestasi, pertahankan!",
      ringkasanRows: [{ mapel: "Matematika", kkm: 75, nilai: 95, predikat: "A" }],
      status: "PUBLISHED",
      namaPembina: "Wali Kelas 7A",
      dibuatOleh: "Admin",
    });
    assert.ok(savedRaport.id);
    assert.equal(savedRaport.santriId, santri1Id);
    assert.equal(savedRaport.status, "PUBLISHED");

    // 4. Test Upsert: Simpan kembali dengan perubahan catatan tidak menyebabkan duplikasi
    const updatedRaport = await simpanRaportAkademik({
      santriId: santri1Id,
      tahunAjaran: "2026/2027",
      semester: "Ganjil",
      catatan: "Catatan direvisi: Luar biasa!",
      ringkasanRows: [{ mapel: "Matematika", kkm: 75, nilai: 95, predikat: "A" }],
      status: "PUBLISHED",
      namaPembina: "Wali Kelas 7A",
      dibuatOleh: "Admin",
    });
    assert.equal(updatedRaport.id, savedRaport.id);
    assert.equal(updatedRaport.catatan, "Catatan direvisi: Luar biasa!");

    // 5. Query semua raport akademik
    const listRaport = await semuaRaportAkademik({ santriId: santri1Id });
    assert.equal(listRaport.length, 1);
    assert.equal(listRaport[0].namaSantri, `Santri Pintar ${uid}`);

    // 6. Hapus raport
    const delRes = await hapusRaportAkademik(savedRaport.id);
    assert.equal(delRes.deleted, true);

    const listAfterDel = await semuaRaportAkademik({ santriId: santri1Id });
    assert.equal(listAfterDel.length, 0);
  } finally {
    await query('DELETE FROM "Nilai" WHERE "santriId" IN ($1, $2)', [santri1Id, santri2Id]);
    await query('DELETE FROM "RaportAkademik" WHERE "santriId" IN ($1, $2)', [santri1Id, santri2Id]);
    await query('DELETE FROM "Santri" WHERE "id" IN ($1, $2)', [santri1Id, santri2Id]);
  }
});

test("RAPOR & PENILAIAN: Layanan Pengasuhan (Penilaian Kegiatan & Rapor Mental)", async () => {
  const uid = crypto.randomUUID().slice(0, 8);
  const santriId = `santri_png_${uid}`;

  await query(
    'INSERT INTO "Santri" ("id", "nama", "kelas", "saldo", "statusSantri", "is_deleted") VALUES ($1, $2, $3, 0, $4, FALSE)',
    [santriId, `Santri Pengasuhan ${uid}`, "8B", "Aktif"]
  );

  try {
    // 1. Penilaian Kegiatan
    const pk = await catatPenilaianKegiatan({
      santriId,
      kegiatan: "Pramuka & Kepanduan",
      skor: { kedisiplinan: 90, kepemimpinan: 88, keaktifan: 95 },
      tanggal: "2026-10-10",
      catatan: "Sangat aktif dalam regu",
      dicatatOleh: "Ustadz Pembina",
    });
    assert.ok(pk.id);
    assert.equal(pk.santriId, santriId);
    assert.equal(pk.kegiatan, "Pramuka & Kepanduan");

    const pkList = await semuaPenilaianKegiatan({ santriId });
    assert.equal(pkList.length, 1);
    assert.equal(pkList[0].namaSantri, `Santri Pengasuhan ${uid}`);

    // 2. Rapor Mental
    const rm = await simpanRaportMental({
      santriId,
      tahunAjaran: "2026/2027",
      semester: "Ganjil",
      catatan: "Akhlak dan adab terpuji",
      ringkasanRows: [{ aspek: "Kedisiplinan", predikat: "A", deskripsi: "Tepat waktu" }],
      status: "PUBLISHED",
      namaPembina: "Ustadz Asrama",
      dibuatOleh: "Admin",
    });
    assert.ok(rm.id);
    assert.equal(rm.status, "PUBLISHED");

    const rmList = await semuaRaportMental({ santriId });
    assert.equal(rmList.length, 1);

    // 3. Bersihkan
    await hapusPenilaianKegiatan(pk.id);
    await hapusRaportMental(rm.id);
  } finally {
    await query('DELETE FROM "PenilaianKegiatan" WHERE "santriId" = $1', [santriId]);
    await query('DELETE FROM "RaportMental" WHERE "santriId" = $1', [santriId]);
    await query('DELETE FROM "Santri" WHERE "id" = $1', [santriId]);
  }
});

test("RAPOR & PENILAIAN: Layanan LPTQ (Hafalan Detail & Rapor Tahfidz)", async () => {
  const uid = crypto.randomUUID().slice(0, 8);
  const santriId = `santri_tahfidz_${uid}`;

  await query(
    'INSERT INTO "Santri" ("id", "nama", "kelas", "saldo", "statusSantri", "is_deleted") VALUES ($1, $2, $3, 0, $4, FALSE)',
    [santriId, `Santri Tahfidz ${uid}`, "9A", "Aktif"]
  );

  try {
    // 1. Catat Hafalan detail
    const hafalan = await catatHafalan({
      santriId,
      juz: 30,
      surah: "An-Naba'",
      ayat: "1-40",
      predikat: "Mumtaz",
      nilaiTajwid: 95,
      nilaiFashahah: 92,
      dicatatOleh: "Ustadz Tahfidz",
    });
    assert.ok(hafalan.id);
    assert.equal(hafalan.surah, "An-Naba'");
    assert.equal(hafalan.nilaiTajwid, 95);

    // 2. Simpan Rapor Tahfidz
    const rt = await simpanRaportTahfidz({
      santriId,
      tahunAjaran: "2026/2027",
      semester: "Ganjil",
      catatan: "Hafalan lancar dan tartil",
      ringkasanRows: [{ juz: "30", target: "1 Juz", capaian: "1 Juz", predikat: "Mumtaz" }],
      status: "PUBLISHED",
      namaPembina: "Musyrif Tahfidz",
      dibuatOleh: "Admin",
    });
    assert.ok(rt.id);
    assert.equal(rt.status, "PUBLISHED");

    const rtList = await semuaRaportTahfidz({ santriId });
    assert.equal(rtList.length, 1);

    await hapusRaportTahfidz(rt.id);
  } finally {
    await query('DELETE FROM "Hafalan" WHERE "santriId" = $1', [santriId]);
    await query('DELETE FROM "RaportTahfidz" WHERE "santriId" = $1', [santriId]);
    await query('DELETE FROM "Santri" WHERE "id" = $1', [santriId]);
  }
});

test("RAPOR & PENILAIAN: Portal Wali Santri Isolasi & Keamanan Hak Akses Rapor", async () => {
  const uid = crypto.randomUUID().slice(0, 8);
  const waliAId = `wali_A_${uid}`;
  const waliBId = `wali_B_${uid}`;
  const santriAId = `santri_A_${uid}`;
  const santriBId = `santri_B_${uid}`;

  // Wali A punya Santri A
  await query(
    'INSERT INTO "Wali" ("id", "nama", "username", "password", "hp", "mustChangePassword", "sessionVersion") VALUES ($1, $2, $3, $4, $5, FALSE, 0)',
    [waliAId, `Wali A ${uid}`, `user_wali_a_${uid}`, "hash", "08123456789"]
  );
  await query(
    'INSERT INTO "Santri" ("id", "nama", "kelas", "saldo", "statusSantri", "waliId", "is_deleted") VALUES ($1, $2, $3, 0, $4, $5, FALSE)',
    [santriAId, `Santri A ${uid}`, "7A", "Aktif", waliAId]
  );

  // Wali B punya Santri B
  await query(
    'INSERT INTO "Wali" ("id", "nama", "username", "password", "hp", "mustChangePassword", "sessionVersion") VALUES ($1, $2, $3, $4, $5, FALSE, 0)',
    [waliBId, `Wali B ${uid}`, `user_wali_b_${uid}`, "hash", "08123456780"]
  );
  await query(
    'INSERT INTO "Santri" ("id", "nama", "kelas", "saldo", "statusSantri", "waliId", "is_deleted") VALUES ($1, $2, $3, 0, $4, $5, FALSE)',
    [santriBId, `Santri B ${uid}`, "7B", "Aktif", waliBId]
  );

  const tokenWaliA = buatToken({ id: waliAId, username: `user_wali_a_${uid}`, nama: `Wali A ${uid}`, role: "wali" });
  const tokenWaliB = buatToken({ id: waliBId, username: `user_wali_b_${uid}`, nama: `Wali B ${uid}`, role: "wali" });

  try {
    // Buat rapor resmi (PUBLISHED) untuk Santri A
    await simpanRaportAkademik({
      santriId: santriAId,
      tahunAjaran: "2026/2027",
      semester: "Ganjil",
      peringkat: "1",
      rataRata: 90,
      ringkasanRows: [{ mapel: "Tauhid", kkm: 75, nilai: 90, predikat: "A" }],
      status: "PUBLISHED",
    });

    // Buat rapor draf (DRAFT) untuk Santri A
    await simpanRaportMental({
      santriId: santriAId,
      tahunAjaran: "2026/2027",
      semester: "Ganjil",
      catatan: "Draf catatan pembina",
      ringkasanRows: [],
      status: "DRAFT",
    });

    // 1. Wali A mengakses rapor ringkas Santri A -> Sukses
    const resA = await fetch(`${baseUrl}/api/santri/${santriAId}/rapor-ringkas`, {
      headers: { Authorization: `Bearer ${tokenWaliA}` },
    });
    assert.equal(resA.status, 200);
    const dataA = await resA.json();
    assert.equal(dataA.raportAkademik.length, 1);
    assert.equal(dataA.raportAkademik[0].status, "PUBLISHED");
    // Rapor mental yang masih status DRAFT TIDAK boleh muncul ke wali
    assert.equal(dataA.raportMental.length, 0);

    // 2. Wali A mencoba mengakses data Santri B -> Ditolak 403 Forbidden!
    const resHacking = await fetch(`${baseUrl}/api/santri/${santriBId}/rapor-ringkas`, {
      headers: { Authorization: `Bearer ${tokenWaliA}` },
    });
    assert.equal(resHacking.status, 403);

    // 3. Endpoint GET /api/santri/:id/raport juga harus menolak akses silang
    const resCrossRaport = await fetch(`${baseUrl}/api/santri/${santriBId}/raport`, {
      headers: { Authorization: `Bearer ${tokenWaliA}` },
    });
    assert.equal(resCrossRaport.status, 403);

    // 4. Wali B mengakses Santri B secara sah -> 200 OK
    const resLegitB = await fetch(`${baseUrl}/api/santri/${santriBId}/raport`, {
      headers: { Authorization: `Bearer ${tokenWaliB}` },
    });
    assert.equal(resLegitB.status, 200);
  } finally {
    await query('DELETE FROM "RaportAkademik" WHERE "santriId" IN ($1, $2)', [santriAId, santriBId]);
    await query('DELETE FROM "RaportMental" WHERE "santriId" IN ($1, $2)', [santriAId, santriBId]);
    await query('DELETE FROM "Santri" WHERE "id" IN ($1, $2)', [santriAId, santriBId]);
    await query('DELETE FROM "Wali" WHERE "id" IN ($1, $2)', [waliAId, waliBId]);
  }
});
