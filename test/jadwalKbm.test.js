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
});
