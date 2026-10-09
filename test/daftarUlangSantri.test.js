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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
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

test("DAFTAR ULANG & KENAIKAN KELAS: promosi massal, statistik, dan kelulusan", async () => {
  const guruId = `guru_adm_${crypto.randomUUID().slice(0, 8)}`;
  await query(
    `INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "jenisAkun", "mustChangePassword", "sessionVersion")
     VALUES ($1, 'Admin Test', $2, 'dummy', 'sekretariat', 'superadmin', false, 0)`,
    [guruId, `admin_${guruId}`]
  );

  const adminToken = buatToken({
    id: guruId,
    username: `admin_${guruId}`,
    nama: "Admin Test",
    role: "guru",
    departemen: "sekretariat",
    jenisAkun: "superadmin",
    sv: 0,
  });

  // 1. Siapkan Tahun Ajaran
  const tahunId = `ta_test_${crypto.randomUUID().slice(0, 8)}`;
  await query(
    'INSERT INTO "TahunAjaran" ("id", "tahunMulai", "aktif") VALUES ($1, $2, 1) ON CONFLICT ("tahunMulai") DO UPDATE SET "aktif" = 1',
    [tahunId, 2028]
  );
  const taRow = await queryOne('SELECT "id" FROM "TahunAjaran" WHERE "tahunMulai" = 2028');

  // 2. Siapkan 2 Santri dummy
  const s1Id = `s1_test_${crypto.randomUUID().slice(0, 8)}`;
  const s2Id = `s2_test_${crypto.randomUUID().slice(0, 8)}`;
  await query(
    `INSERT INTO "Santri" ("id", "nama", "kelas", "asrama", "statusSantri", "nis")
     VALUES ($1, 'Santri Uji 1', '7A', 'Giri 1', 'Aktif', 'NIS001'),
            ($2, 'Santri Uji 2', '7A', 'Giri 1', 'Aktif', 'NIS002')`,
    [s1Id, s2Id]
  );

  try {
    // 3. Test GET /api/santri/statistik
    const statsRes = await fetch(`${baseUrl}/api/santri/statistik`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(statsRes.status, 200);
    const statsData = await statsRes.json();
    assert.ok(statsData.aktif >= 2);

    // 4. Test POST /api/daftar-ulang/promosi-massal
    const promoRes = await fetch(`${baseUrl}/api/daftar-ulang/promosi-massal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        tahunAjaranId: taRow.id,
        items: [
          { santriId: s1Id, kelasBaru: "8A", asramaBaru: "Ampel 2", status: "Aktif" },
          { santriId: s2Id, kelasBaru: "8A", asramaBaru: "Ampel 2", status: "Aktif" },
        ],
      }),
    });
    assert.equal(promoRes.status, 200);
    const promoData = await promoRes.json();
    assert.equal(promoData.totalDiproses, 2);

    // Verifikasi data santri terupdate di database
    const s1Updated = await queryOne('SELECT * FROM "Santri" WHERE "id" = $1', [s1Id]);
    assert.equal(s1Updated.kelas, "8A");
    assert.equal(s1Updated.asrama, "Ampel 2");
    assert.ok(s1Updated.riwayatKelas.includes("8A"));

    // 5. Test GET /api/daftar-ulang/riwayat/:santriId
    const riwayatRes = await fetch(`${baseUrl}/api/daftar-ulang/riwayat/${s1Id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(riwayatRes.status, 200);
    const riwayatData = await riwayatRes.json();
    assert.ok(riwayatData.length >= 1);
    assert.equal(riwayatData[0].kelasBaru, "8A");

    // 6. Test POST /api/daftar-ulang/luluskan-massal
    const lulusRes = await fetch(`${baseUrl}/api/daftar-ulang/luluskan-massal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        tahunLulus: "2028",
        santriIds: [s1Id],
        statusSaatIni: "Melanjutkan ke PTN",
      }),
    });
    assert.equal(lulusRes.status, 200);
    const lulusData = await lulusRes.json();
    assert.equal(lulusData.totalDiluluskan, 1);

    const s1Alumni = await queryOne('SELECT * FROM "Santri" WHERE "id" = $1', [s1Id]);
    assert.equal(s1Alumni.statusSantri, "Alumni");

    // Filter santri aktif vs alumni
    const filterAktif = await fetch(`${baseUrl}/api/santri?status=Aktif&kelas=8A`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const aktifJson = await filterAktif.json();
    assert.ok(aktifJson.some((s) => s.id === s2Id));
    assert.ok(!aktifJson.some((s) => s.id === s1Id)); // s1Id is now Alumni!

  } finally {
    // Cleanup
    await query('DELETE FROM "PendaftaranUlang" WHERE "santriId" IN ($1, $2)', [s1Id, s2Id]);
    await query('DELETE FROM "Santri" WHERE "id" IN ($1, $2)', [s1Id, s2Id]);
    await query('DELETE FROM "TahunAjaran" WHERE "tahunMulai" = 2028');
    await query('DELETE FROM "Guru" WHERE "id" = $1', [guruId]);
  }
});
