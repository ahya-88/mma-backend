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
const { pool, query, initializeDatabase } = require("../src/db");
const {
  ambilSemuaJadwalKBM, simpanSlotJadwalKBM, hapusSlotJadwalKBM,
} = require("../src/jadwalKbmService");

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

test("JADWAL KBM: Ambil data, simpan slot, dan deteksi bentrok real-time", async () => {
  const uid = crypto.randomUUID().slice(0, 6);
  const testTahun = `2099/2100_${uid}`;

  // 1. Simpan slot di Kelas 1: Guru A pada Senin Jam 1
  await simpanSlotJadwalKBM({
    hari: "Senin",
    jamKe: 1,
    kelas: "1",
    kodeMapel: "M01",
    namaMapel: "MAHFUDZOT",
    kodeGuru: "G12",
    namaGuru: "Usth.Apriliani",
    tahunAjaran: testTahun,
    semester: "Ganjil",
  });

  let kbm = await ambilSemuaJadwalKBM({ tahunAjaran: testTahun, semester: "Ganjil" });
  assert.equal(kbm.totalSlot, 1);
  assert.equal(kbm.totalBentrok, 0);

  // 2. Simpan slot di Kelas 2 pada hari & jam yang sama dengan GURU YANG SAMA (Harus Bentrok!)
  await simpanSlotJadwalKBM({
    hari: "Senin",
    jamKe: 1,
    kelas: "2",
    kodeMapel: "M04",
    namaMapel: "MEMBACA",
    kodeGuru: "G12",
    namaGuru: "Usth.Apriliani",
    tahunAjaran: testTahun,
    semester: "Ganjil",
  });

  kbm = await ambilSemuaJadwalKBM({ tahunAjaran: testTahun, semester: "Ganjil" });
  assert.equal(kbm.totalSlot, 2);
  assert.equal(kbm.totalBentrok, 1);
  assert.equal(kbm.bentrokList[0].guru, "Usth.Apriliani");
  assert.ok(kbm.errorMap["Senin_1_1"].includes("Bentrok"));
  assert.ok(kbm.errorMap["Senin_1_2"].includes("Bentrok"));

  // 3. Ubah Kelas 2 ke guru lain -> bentrok harus hilang (0 bentrok)
  await simpanSlotJadwalKBM({
    hari: "Senin",
    jamKe: 1,
    kelas: "2",
    kodeMapel: "M04",
    namaMapel: "MEMBACA",
    kodeGuru: "G04",
    namaGuru: "Usth.Aliyah fatiyah",
    tahunAjaran: testTahun,
    semester: "Ganjil",
  });

  kbm = await ambilSemuaJadwalKBM({ tahunAjaran: testTahun, semester: "Ganjil" });
  assert.equal(kbm.totalBentrok, 0);

  // 4. Cleanup
  await query('DELETE FROM "JadwalKBM" WHERE "tahunAjaran" = $1', [testTahun]);
});

test("JADWAL KBM: HTTP Endpoint Pengajaran", async () => {
  const uid = crypto.randomUUID().slice(0, 8);
  const stafId = `staf_pj_${uid}`;

  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "mustChangePassword", "sessionVersion") VALUES ($1, $2, $3, $4, $5, FALSE, 0)',
    [stafId, "Ustadz Kurikulum", `pj_${uid}`, "pass123", "pengajaran"]
  );

  const tokenPengajaran = buatToken({ id: stafId, role: "guru", departemen: "pengajaran", nama: "Ustadz Kurikulum" });

  const resGet = await fetch(`${baseUrl}/api/pengajaran/jadwal-kbm`, {
    headers: { Authorization: `Bearer ${tokenPengajaran}` },
  });
  assert.equal(resGet.status, 200);
  const data = await resGet.json();
  assert.ok(Array.isArray(data.slots));
  assert.ok(data.pengaturanJam);
  assert.ok(Array.isArray(data.jamPelajaran));
});

test("JADWAL KBM: Pengaturan Jumlah Jam & Durasi KBM", async () => {
  const stafId = `staf_pj_${crypto.randomUUID().slice(0, 8)}`;
  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "mustChangePassword", "sessionVersion") VALUES ($1, $2, $3, $4, $5, FALSE, 0)',
    [stafId, "Ustadz Kurikulum Jam", `pj_jam_${Date.now()}`, "pass123", "pengajaran"]
  );
  const token = buatToken({ id: stafId, role: "guru", departemen: "pengajaran", nama: "Ustadz Kurikulum Jam" });

  // 1. Ambil pengaturan jam default
  const resGet = await fetch(`${baseUrl}/api/pengajaran/jadwal-kbm/pengaturan-jam`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(resGet.status, 200);
  const getBody = await resGet.json();
  assert.equal(typeof getBody.jumlahJam, "number");

  // 2. Simpan pengaturan jam baru (misal 5 jam pelajaran @ 40 menit)
  const resPut = await fetch(`${baseUrl}/api/pengajaran/jadwal-kbm/pengaturan-jam`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jumlahJam: 5,
      durasiMenit: 40,
      jamMulai: "07:30",
      adaIstirahat: true,
      setelahJamKe: 2,
      durasiIstirahatMenit: 30,
    }),
  });
  assert.equal(resPut.status, 200);
  const putBody = await resPut.json();
  assert.equal(putBody.jumlahJam, 5);
  assert.equal(putBody.durasiMenit, 40);
  assert.equal(putBody.daftarJam.filter((j) => typeof j.jamKe === "number").length, 5);

  // 3. Simpan slot pada Jam Ke-5 (sebelumnya error 400 jika dibatasi jam 1-4)
  const resSlot = await fetch(`${baseUrl}/api/pengajaran/jadwal-kbm/slot`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      hari: "Senin",
      jamKe: 5,
      kelas: "7A",
      kodeMapel: "M01",
      namaMapel: "TAFSIR",
      kodeGuru: "G01",
      namaGuru: "Ust. Ahmad",
      tahunAjaran: "2026/2027",
      semester: "Ganjil",
    }),
  });
  assert.equal(resSlot.status, 200);
  const slotBody = await resSlot.json();
  const slot5 = slotBody.slots.find((s) => s.hari === "Senin" && Number(s.jamKe) === 5 && s.kelas === "7A");
  assert.ok(slot5);
  assert.equal(slot5.namaMapel, "TAFSIR");

  // Cleanup slot Jam 5
  await fetch(`${baseUrl}/api/pengajaran/jadwal-kbm/hapus-slot`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      hari: "Senin",
      jamKe: 5,
      kelas: "7A",
      tahunAjaran: "2026/2027",
      semester: "Ganjil",
    }),
  });
});
