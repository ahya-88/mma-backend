const assert = require("node:assert/strict");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const sharp = require("sharp");

const testDatabaseUrl = process.env.TOPUP_TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("TOPUP_TEST_DATABASE_URL harus menunjuk ke database test/staging terisolasi.");
}
process.env.DATABASE_URL = testDatabaseUrl;

const { pool, initializeDatabase } = require("../src/db");
const app = require("../src/app");

const uid = () => crypto.randomUUID();
const prefix = `it-topup-${uid()}`;
const waliA = `${prefix}-wali-a`;
const waliB = `${prefix}-wali-b`;
const bmt1 = `${prefix}-bmt-1`;
const bmt2 = `${prefix}-bmt-2`;
const admin = `${prefix}-admin`;
const guruKasir = `${prefix}-kasir`;
const students = ["a-main", "a-amount", "a-second", "a-pending", "a-cashier", "b-child"]
  .map((suffix) => `${prefix}-${suffix}`);
const requestIds = [];
const idempotencyKeys = [];
const actorIds = [waliA, waliB, bmt1, bmt2, admin, guruKasir];
const password = "Integration-test-only-9!";
let originalTopupSetting;
let server;
let baseUrl;

async function api(path, { token, method = "GET", body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, data };
}

async function login(username) {
  const response = await api("/auth/login", { method: "POST", body: { username, password } });
  assert.equal(response.status, 200, `login ${username}`);
  return response.data.token;
}

async function imageData(color) {
  const [r, g, b] = color;
  const bytes = await sharp({
    create: { width: 12, height: 12, channels: 3, background: { r, g, b } },
  }).png().toBuffer();
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function submitTopup(token, santriId, proof, amount = 10000) {
  const response = await api("/permintaan", {
    token,
    method: "POST",
    body: {
      santriId, jenis: "Top Up Saldo", nilaiDiminta: amount,
      alasan: "Pengujian integrasi", buktiTransfer: proof,
    },
  });
  if (response.status === 201 && response.data.id) requestIds.push(response.data.id);
  return response;
}

async function approve(token, id, body = { disetujui: true }) {
  return api(`/permintaan/${id}/proses`, { token, method: "POST", body });
}

async function saldo(santriId) {
  const result = await pool.query('SELECT "saldo" FROM "Santri" WHERE "id" = $1', [santriId]);
  return Number(result.rows[0].saldo);
}

async function setSettings(token, patch) {
  const result = await api("/permintaan/pengaturan", { token, method: "PUT", body: patch });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data;
}

async function prepareFixtures() {
  await initializeDatabase();
  const setting = await pool.query('SELECT "nilai" FROM "Pengaturan" WHERE "kunci" = $1', ["topup"]);
  originalTopupSetting = setting.rows[0].nilai;

  const hashedPassword = bcrypt.hashSync(password, 4);
  await pool.query(`
    INSERT INTO "Wali" ("id", "nama", "username", "password")
    VALUES ($1, 'Integration Wali A', $2, $3), ($4, 'Integration Wali B', $5, $3)
  `, [waliA, `${prefix}-wali-a`, hashedPassword, waliB, `${prefix}-wali-b`]);
  await pool.query(`
    INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "unit")
    VALUES
      ($1, 'Integration BMT 1', $2, $3, 'unitusaha', 'BMT'),
      ($4, 'Integration BMT 2', $5, $3, 'unitusaha', 'BMT'),
      ($6, 'Integration Admin', $7, $3, 'admin', NULL),
      ($8, 'Integration Kasir', $9, $3, 'unitusaha', 'Kantin')
  `, [bmt1, `${prefix}-bmt1`, hashedPassword, bmt2, `${prefix}-bmt2`,
    admin, `${prefix}-admin`, guruKasir, `${prefix}-kasir`]);
  const studentValues = [
    [students[0], waliA, 0],
    [students[1], waliA, 0],
    [students[2], waliA, 0],
    [students[3], waliA, 0],
    [students[4], waliA, 50000],
    [students[5], waliB, 0],
  ];
  for (const [studentId, ownerId, initialBalance] of studentValues) {
    await pool.query('INSERT INTO "Santri" ("id", "nama", "kelas", "waliId", "saldo") VALUES ($1, $2, $3, $4, $5)',
      [studentId, `Integration ${studentId}`, "Test", ownerId, initialBalance]);
  }
  const legacyId = `${prefix}-legacy-topup`;
  const legacyProof = await imageData([15, 16, 17]);
  await pool.query(`
    INSERT INTO "PermintaanBMT" ("id", "santriId", "waliId", "jenis", "nilaiDiminta", "alasan", "buktiTransfer", "status", "tanggalAjukan")
    VALUES ($1, $2, $3, 'Top Up Saldo', 10000, 'Bukti lama', $4, 'Menunggu', '01 Okt 2026')
  `, [legacyId, students[5], waliB, legacyProof]);
  requestIds.push(legacyId);
  await initializeDatabase();
  const legacyHash = await pool.query('SELECT "buktiHash" FROM "PermintaanBMT" WHERE "id" = $1', [legacyId]);
  assert.equal(legacyHash.rows[0].buktiHash, crypto.createHash("sha256").update(Buffer.from(legacyProof.split(",")[1], "base64")).digest("hex"));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

async function cleanup() {
  if (server) await new Promise((resolve) => server.close(resolve));
  try {
    const requests = await pool.query('SELECT "id" FROM "PermintaanBMT" WHERE "santriId" = ANY($1::text[])', [students]);
    const allRequestIds = [...new Set([...requestIds, ...requests.rows.map((row) => row.id)])];
    await pool.query('DELETE FROM "AuditLog" WHERE "aktorId" = ANY($1::text[]) OR "targetId" = ANY($2::text[])',
      [actorIds, allRequestIds]);
    await pool.query('DELETE FROM "PermintaanBMT" WHERE "santriId" = ANY($1::text[])', [students]);
    await pool.query('DELETE FROM "TransaksiCashless" WHERE "santriId" = ANY($1::text[])', [students]);
    if (idempotencyKeys.length) {
      await pool.query('DELETE FROM "TransaksiCashlessIdempotency" WHERE "idempotencyKey" = ANY($1::text[])', [idempotencyKeys]);
    }
    await pool.query('DELETE FROM "Santri" WHERE "id" = ANY($1::text[])', [students]);
    await pool.query('DELETE FROM "Wali" WHERE "id" = ANY($1::text[])', [[waliA, waliB]]);
    await pool.query('DELETE FROM "Guru" WHERE "id" = ANY($1::text[])', [[bmt1, bmt2, admin, guruKasir]]);
    if (originalTopupSetting !== undefined) {
      await pool.query(`
        INSERT INTO "Pengaturan" ("kunci", "nilai") VALUES ('topup', $1)
        ON CONFLICT ("kunci") DO UPDATE SET "nilai" = EXCLUDED."nilai"
      `, [originalTopupSetting]);
    }
    const [remainingStudents, remainingRequests, remainingTransactions, remainingWali, remainingGuru, remainingAudit] = await Promise.all([
      pool.query('SELECT COUNT(*) AS "n" FROM "Santri" WHERE "id" = ANY($1::text[])', [students]),
      pool.query('SELECT COUNT(*) AS "n" FROM "PermintaanBMT" WHERE "santriId" = ANY($1::text[])', [students]),
      pool.query('SELECT COUNT(*) AS "n" FROM "TransaksiCashless" WHERE "santriId" = ANY($1::text[])', [students]),
      pool.query('SELECT COUNT(*) AS "n" FROM "Wali" WHERE "id" = ANY($1::text[])', [[waliA, waliB]]),
      pool.query('SELECT COUNT(*) AS "n" FROM "Guru" WHERE "id" = ANY($1::text[])', [[bmt1, bmt2, admin, guruKasir]]),
      pool.query('SELECT COUNT(*) AS "n" FROM "AuditLog" WHERE "aktorId" = ANY($1::text[]) OR "targetId" = ANY($2::text[])',
        [actorIds, allRequestIds]),
    ]);
    for (const result of [remainingStudents, remainingRequests, remainingTransactions, remainingWali, remainingGuru, remainingAudit]) {
      assert.equal(Number(result.rows[0].n), 0, "fixture rows harus sudah dibersihkan");
    }
    const restored = await pool.query('SELECT "nilai" FROM "Pengaturan" WHERE "kunci" = $1', ["topup"]);
    assert.equal(restored.rows[0]?.nilai, originalTopupSetting, "pengaturan top-up harus dikembalikan");
    console.log("PASS cleanup akun, santri, permintaan, transaksi, audit, dan pengaturan sementara");
  } finally {
    await pool.end();
  }
}

async function run() {
  await prepareFixtures();
  const waliToken = await login(`${prefix}-wali-a`);
  const waliBToken = await login(`${prefix}-wali-b`);
  const bmtToken = await login(`${prefix}-bmt1`);
  const bmt2Token = await login(`${prefix}-bmt2`);
  const adminToken = await login(`${prefix}-admin`);
  const cashierToken = await login(`${prefix}-kasir`);
  console.log("PASS login wali, BMT, Admin, dan staf unit usaha");

  await setSettings(adminToken, {
    wajibReferensiMutasi: false,
    buktiDiDaftar: true,
    persetujuanKeduaAktif: false,
    maxPermintaanMenunggu: 3,
    nominalMinimum: 10000,
    nominalMaksimum: 5000000,
    batasPersetujuanTunggal: 1000000,
    nomorRekening: "INTEGRATION-NO-REKENING",
  });

  const proofA = await imageData([22, 90, 180]);
  const initial = await submitTopup(waliToken, students[0], proofA);
  assert.equal(initial.status, 201);
  const evidence = await api(`/permintaan/${initial.data.id}/bukti`, { token: bmtToken });
  assert.equal(evidence.status, 200);
  assert.equal(evidence.headers.get("content-type"), "image/png");
  assert.equal(evidence.headers.get("x-content-type-options"), "nosniff");
  assert.match(evidence.headers.get("content-disposition"), /^inline;/);
  assert.equal((await api(`/permintaan/${initial.data.id}/bukti`, { token: waliToken })).status, 403);
  const concurrent = await Promise.all(Array.from({ length: 10 }, () => approve(bmtToken, initial.data.id)));
  assert.equal(concurrent.filter((result) => result.status === 200).length, 1);
  assert.equal(concurrent.filter((result) => result.status === 409).length, 9);
  assert.equal(await saldo(students[0]), 10000);
  const successfulTopups = await pool.query(`
    SELECT COUNT(*) AS "n" FROM "TransaksiCashless"
    WHERE "santriId" = $1 AND "jenis" = 'Top Up'
  `, [students[0]]);
  assert.equal(Number(successfulTopups.rows[0].n), 1);
  console.log("PASS 10 persetujuan paralel: satu berhasil, sembilan 409, saldo bertambah tepat sekali");

  for (let repeat = 0; repeat < 2; repeat++) {
    const repeated = await submitTopup(waliToken, students[0], proofA);
    assert.equal(repeated.status, 409);
    assert.equal(repeated.data.error, "Bukti transfer ini sudah pernah dipakai");
  }
  assert.equal((await submitTopup(waliToken, students[0], await imageData([23, 91, 181]))).status, 201);
  console.log("PASS hash bukti: dua pengiriman ulang mendapat 409, bukti berbeda diterima");

  const invalidProofs = [
    "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>",
    "<html><body>not an image</body></html>",
    "%PDF-1.7",
    "GIF89a",
  ];
  for (const invalid of invalidProofs) {
    const response = await submitTopup(waliToken, students[0], `data:image/jpeg;base64,${Buffer.from(invalid).toString("base64")}`);
    assert.equal(response.status, 400);
  }
  const fakeJpg = await api("/permintaan", {
    token: waliToken, method: "POST",
    body: {
      santriId: students[0], jenis: "Top Up Saldo", nilaiDiminta: 10000,
      alasan: "Tipe palsu", buktiTransfer: `data:image/jpeg;base64,${Buffer.from("<html>fake jpg</html>").toString("base64")}`,
    },
  });
  assert.equal(fakeJpg.status, 400);
  const oversized = Buffer.concat([
    Buffer.from(proofA.split(",")[1], "base64"),
    Buffer.alloc(Math.floor(1.5 * 1024 * 1024)),
  ]);
  const oversizedResult = await submitTopup(waliToken, students[0], `data:image/png;base64,${oversized.toString("base64")}`);
  assert.equal(oversizedResult.status, 400);
  assert.match(oversizedResult.data.error, /1,5 MB/);
  console.log("PASS SVG/HTML/PDF/GIF/tipe palsu/ukuran lebih 1,5 MB ditolak");

  const wrongOwner = await submitTopup(waliToken, students[5], await imageData([60, 12, 80]));
  assert.equal(wrongOwner.status, 403);
  const waliBRequest = await submitTopup(waliBToken, students[5], await imageData([61, 13, 81]));
  assert.equal(waliBRequest.status, 201);
  const mine = await api("/permintaan/mine", { token: waliToken });
  assert.equal(mine.status, 200);
  assert.equal(mine.data.some((request) => request.id === waliBRequest.data.id), false);
  assert.equal(mine.data.find((request) => request.id === initial.data.id).buktiTransfer, proofA);
  assert.equal(mine.data.find((request) => request.id === initial.data.id).adaBukti, true);
  console.log("PASS otorisasi santri dan riwayat wali terisolasi; respons lama tetap memuat foto secara default");

  for (const amount of [9999, 5000001]) {
    const invalidAmount = await submitTopup(waliToken, students[1], await imageData([amount % 255, 20, 30]), amount);
    assert.equal(invalidAmount.status, 400);
  }
  for (let index = 0; index < 3; index++) {
    const pendingRequest = await submitTopup(
      waliToken, students[3], await imageData([120 + index, 40, 50]),
    );
    assert.equal(pendingRequest.status, 201);
  }
  const cappedRequest = await submitTopup(waliToken, students[3], await imageData([124, 40, 50]));
  assert.equal(cappedRequest.status, 409);
  assert.match(cappedRequest.data.error, /Maksimal 3/);
  const amountRequest = await submitTopup(waliToken, students[1], await imageData([70, 21, 31]), 20000);
  assert.equal(amountRequest.status, 201);
  const oldClientApproval = await approve(bmtToken, amountRequest.data.id, { disetujui: true });
  assert.equal(oldClientApproval.status, 200);
  assert.equal(await saldo(students[1]), 20000);
  const adjustedRequest = await submitTopup(waliToken, students[1], await imageData([71, 22, 32]), 20000);
  assert.equal(adjustedRequest.status, 201);
  assert.equal((await approve(bmtToken, adjustedRequest.data.id, { disetujui: true, nominalDisetujui: 15000 })).status, 200);
  assert.equal(await saldo(students[1]), 35000);
  await setSettings(adminToken, { wajibReferensiMutasi: true });
  const referenceRequired = await submitTopup(waliToken, students[1], await imageData([72, 23, 33]), 10000);
  assert.equal(referenceRequired.status, 201);
  assert.equal((await approve(bmtToken, referenceRequired.data.id)).status, 400);
  const withReference = await approve(bmtToken, referenceRequired.data.id, {
    disetujui: true, referensiMutasi: "MUTASI-IT-001",
  });
  assert.equal(withReference.status, 200);
  assert.equal(withReference.data.referensiMutasi, "MUTASI-IT-001");
  await setSettings(adminToken, { wajibReferensiMutasi: false });
  const rejection = await submitTopup(waliToken, students[1], await imageData([73, 24, 34]), 10000);
  assert.equal(rejection.status, 201);
  assert.equal((await approve(bmtToken, rejection.data.id, { disetujui: false })).status, 400);
  const denied = await approve(bmtToken, rejection.data.id, {
    disetujui: false, catatan: "Mutasi tidak ditemukan",
  });
  assert.equal(denied.status, 200);
  const waliHistory = await api("/permintaan/mine", { token: waliToken });
  assert.equal(waliHistory.data.find((request) => request.id === rejection.data.id).catatanBMT, "Mutasi tidak ditemukan");
  console.log("PASS nominal disetujui, klien lama, referensi opsional/aktif, batas nominal, dan alasan penolakan");

  await setSettings(adminToken, { persetujuanKeduaAktif: true, batasPersetujuanTunggal: 10000 });
  const highValue = await submitTopup(waliToken, students[2], await imageData([80, 30, 40]), 20000);
  assert.equal(highValue.status, 201);
  const firstApproval = await approve(bmtToken, highValue.data.id, {
    disetujui: true, nominalDisetujui: 20000,
  });
  assert.equal(firstApproval.status, 200);
  assert.equal(firstApproval.data.status, "Menunggu");
  assert.equal(firstApproval.data.perluPersetujuanKedua, true);
  assert.equal((await approve(bmtToken, highValue.data.id)).status, 409);
  const secondApproval = await approve(bmt2Token, highValue.data.id);
  assert.equal(secondApproval.status, 200);
  assert.equal(secondApproval.data.status, "Disetujui");
  assert.equal(await saldo(students[2]), 20000);
  await setSettings(adminToken, { persetujuanKeduaAktif: false, batasPersetujuanTunggal: 1000000 });
  console.log("PASS persetujuan kedua tetap Menunggu; pemroses pertama 409, staf berbeda menyelesaikan");

  await setSettings(adminToken, { buktiDiDaftar: false });
  const hiddenProofList = await api("/permintaan?status=Menunggu", { token: bmtToken });
  const listedRequest = hiddenProofList.data.find((request) => request.id === waliBRequest.data.id);
  assert.equal(listedRequest.adaBukti, true);
  assert.equal(Object.hasOwn(listedRequest, "buktiTransfer"), false);
  await setSettings(adminToken, { buktiDiDaftar: true });
  const report = await api(`/permintaan/laporan/topup-harian?tanggalISO=${new Date().toISOString().slice(0, 10)}`, { token: bmtToken });
  assert.equal(report.status, 200);
  assert.ok(Object.hasOwn(report.data.jumlahPerStatus, "Menunggu"));
  assert.ok(Object.hasOwn(report.data.jumlahPerStatus, "Disetujui"));
  assert.ok(report.data.permintaanDisetujui.some((request) => request.referensiMutasi === "MUTASI-IT-001"));
  const audit = await api("/permintaan/audit?limit=100", { token: adminToken });
  assert.equal(audit.status, 200);
  for (const action of ["topup.diajukan", "topup.bukti_duplikat", "topup.disetujui",
    "topup.ditolak", "topup.persetujuan_pertama", "topup.pengaturan_diubah"]) {
    assert.ok(audit.data.data.some((entry) => entry.aksi === action), `audit ${action}`);
  }
  assert.ok(audit.data.data.some((entry) => entry.aksi === "topup.pengaturan_diubah"
    && Object.hasOwn(entry.detail, "nomorRekening")));
  assert.equal((await api("/permintaan/audit", { token: waliToken })).status, 403);
  assert.ok(Number(report.data.totalSaldoSeluruhSantri) >= 0);
  console.log("PASS mode tanpa foto, laporan harian, dan AuditLog untuk pengajuan/proses/duplikat/pengaturan");

  const debits = await Promise.all(Array.from({ length: 20 }, (_, index) => {
    const key = uid();
    idempotencyKeys.push(key);
    return api("/transaksi", {
      token: cashierToken,
      method: "POST",
      body: {
        santriId: students[4], jenis: "Tarik Tunai", kategori: "Jajan Harian",
        jumlah: 1000, metode: "qr", idempotencyKey: key,
      },
    });
  }));
  assert.equal(debits.filter((result) => result.status === 201).length, 20);
  assert.equal(await saldo(students[4]), 30000);
  const replayKey = uid();
  idempotencyKeys.push(replayKey);
  const debitBody = {
    santriId: students[4], jenis: "Tarik Tunai", kategori: "Jajan Harian",
    jumlah: 1000, metode: "qr", idempotencyKey: replayKey,
  };
  assert.equal((await api("/transaksi", { token: cashierToken, method: "POST", body: debitBody })).status, 201);
  assert.equal((await api("/transaksi", { token: cashierToken, method: "POST", body: debitBody })).status, 200);
  assert.equal(await saldo(students[4]), 29000);
  const transactionAudit = await api("/transaksi/audit-saldo", { token: bmtToken });
  assert.equal(transactionAudit.status, 200);
  console.log("PASS regresi 20 debit paralel dan idempotency transaksi kasir");
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(cleanup);
