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
  semuaMasterGuru, getMasterGuru, tambahMasterGuru, ubahMasterGuru, hapusMasterGuru,
  semuaMasterMapel, getMasterMapel, tambahMasterMapel, ubahMasterMapel, hapusMasterMapel,
  semuaPenugasanGuru, tambahPenugasanGuru, hapusPenugasanGuru,
  semuaJadwalPelajaran, tambahJadwalPelajaran, ubahJadwalPelajaran, hapusJadwalPelajaran,
} = require("../src/guruService");

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

test("GURU PENDIDIK: Service CRUD MasterGuru, MasterMapel, Penugasan & Jadwal Pelajaran", async () => {
  const uid = crypto.randomUUID().slice(0, 8);
  const nipTest = `NIP-${uid}`;
  const kodeMapelTest = `TEST-${uid.toUpperCase()}`;

  // 1. Tambah Guru Pendidik
  const guru = await tambahMasterGuru({
    nip: nipTest,
    nuptk: "1234567890123456",
    nik: "3201010101010001",
    nama: "Ustadz Ahmad Al-Faruq",
    gelarDepan: "Ust.",
    gelarBelakang: "S.Pd.I, M.Ag",
    jenisKelamin: "L",
    tempatLahir: "Jombang",
    tanggalLahir: "1990-05-15",
    noHp: "081234567890",
    email: `ahmad_${uid}@pesantren.id`,
    pendidikanTerakhir: "S2",
    jurusanPendidikan: "Pendidikan Agama Islam",
    almamater: "UIN Sunan Kalijaga",
    statusKepegawaian: "Tetap",
    statusAktif: "Aktif",
  });

  assert.ok(guru.id);
  assert.equal(guru.nama, "Ustadz Ahmad Al-Faruq");
  assert.equal(guru.nip, nipTest);
  assert.equal(guru.jenisKelamin, "L");

  // Cegah duplikat NIP
  await assert.rejects(
    async () => tambahMasterGuru({ nip: nipTest, nama: "Guru Duplikat" }),
    /sudah terdaftar/i
  );

  // 2. Ubah Guru
  const guruUpdated = await ubahMasterGuru(guru.id, {
    nama: "Ustadz Dr. Ahmad Al-Faruq",
    gelarDepan: "Dr.",
    noHp: "089999999999",
  });
  assert.equal(guruUpdated.nama, "Ustadz Dr. Ahmad Al-Faruq");
  assert.equal(guruUpdated.noHp, "089999999999");

  // 3. Tambah Master Mapel
  const mapel = await tambahMasterMapel({
    kodeMapel: kodeMapelTest,
    nama: "Nahwu Wadih Dasar",
    kategori: "Diniyah",
    tingkat: "Tsanawiyah",
    kkm: 75,
  });
  assert.ok(mapel.id);
  assert.equal(mapel.kodeMapel, kodeMapelTest);

  // Cegah duplikat kode mapel
  await assert.rejects(
    async () => tambahMasterMapel({ kodeMapel: kodeMapelTest, nama: "Duplikat Mapel" }),
    /sudah ada/i
  );

  // 4. Penugasan Mengajar Guru ke Kelas
  const penugasan = await tambahPenugasanGuru({
    guruId: guru.id,
    mapelId: mapel.id,
    kelas: "Tahfidz 1A",
    tahunAjaran: "2026/2027",
    semester: "Ganjil",
    bebanJamMingguan: 4,
  });
  assert.ok(penugasan.id);
  assert.equal(penugasan.kelas, "Tahfidz 1A");

  // Cegah duplikat penugasan yang sama
  await assert.rejects(
    async () => tambahPenugasanGuru({
      guruId: guru.id,
      mapelId: mapel.id,
      kelas: "Tahfidz 1A",
      tahunAjaran: "2026/2027",
      semester: "Ganjil",
    }),
    /sudah ada/i
  );

  // 5. Tambah Jadwal Pelajaran
  const jadwal1 = await tambahJadwalPelajaran({
    penugasanId: penugasan.id,
    hari: "Senin",
    jamMulai: "07:30",
    jamSelesai: "09:00",
    ruangan: "Kelas 1A",
  });
  assert.ok(jadwal1.id);
  assert.equal(jadwal1.hari, "Senin");

  // Validasi tabrakan jadwal pada kelas yang sama di jam yang sama
  await assert.rejects(
    async () => tambahJadwalPelajaran({
      penugasanId: penugasan.id,
      hari: "Senin",
      jamMulai: "08:00",
      jamSelesai: "09:30",
    }),
    /Tabrakan jadwal kelas/i
  );

  // 6. Cek Get Detail Guru lengkap dengan penugasan
  const detail = await getMasterGuru(guru.id);
  assert.equal(detail.penugasan.length, 1);
  assert.equal(detail.penugasan[0].namaMapel, "Nahwu Wadih Dasar");

  // 7. Cleanup
  await hapusJadwalPelajaran(jadwal1.id);
  await hapusPenugasanGuru(penugasan.id);
  await hapusMasterMapel(mapel.id);
  await hapusMasterGuru(guru.id);
});

test("GURU PENDIDIK: HTTP Endpoints Auth & Role Guard", async () => {
  const uid = crypto.randomUUID().slice(0, 8);
  const stafId = `staf_pj_${uid}`;
  const nonPengajaranId = `staf_keu_${uid}`;

  // Staf Pengajaran
  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "mustChangePassword", "sessionVersion") VALUES ($1, $2, $3, $4, $5, FALSE, 0)',
    [stafId, "Ustadz Kurikulum", `pj_${uid}`, "pass123", "pengajaran"]
  );

  // Staf Administrasi / Keuangan (Bukan pengajaran)
  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "mustChangePassword", "sessionVersion") VALUES ($1, $2, $3, $4, $5, FALSE, 0)',
    [nonPengajaranId, "Ustadz Keuangan", `keu_${uid}`, "pass123", "administrasi"]
  );

  const tokenPengajaran = buatToken({ id: stafId, role: "guru", departemen: "pengajaran", nama: "Ustadz Kurikulum" });
  const tokenKeuangan = buatToken({ id: nonPengajaranId, role: "guru", departemen: "administrasi", nama: "Ustadz Keuangan" });

  // 1. Get guru-pendidik (bisa diakses staf keuangan karena requireAnyStaff)
  const resGet = await fetch(`${baseUrl}/api/pengajaran/guru-pendidik`, {
    headers: { Authorization: `Bearer ${tokenKeuangan}` },
  });
  assert.equal(resGet.status, 200);

  // 2. Post guru-pendidik ditolak jika bukan pengajaran/admin
  const resForbidden = await fetch(`${baseUrl}/api/pengajaran/guru-pendidik`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenKeuangan}` },
    body: JSON.stringify({ nama: "Guru Ilegal" }),
  });
  assert.equal(resForbidden.status, 403);

  // 3. Post guru-pendidik diterima jika staf pengajaran
  const resPost = await fetch(`${baseUrl}/api/pengajaran/guru-pendidik`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenPengajaran}` },
    body: JSON.stringify({
      nama: "Ustadzah Fatimah Zahra",
      nip: `NIP-UST-${uid}`,
      jenisKelamin: "P",
      noHp: "081298765432",
      statusKepegawaian: "Tetap",
    }),
  });
  assert.equal(resPost.status, 201);
  const dataGuru = await resPost.json();
  assert.ok(dataGuru.id);
  assert.equal(dataGuru.jenisKelamin, "P");

  // 4. Delete guru-pendidik
  const resDel = await fetch(`${baseUrl}/api/pengajaran/guru-pendidik/${dataGuru.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${tokenPengajaran}` },
  });
  assert.equal(resDel.status, 200);
});
