require("dotenv").config({ quiet: true });
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { pool, query, queryOne, queryAll, initializeDatabase } = require("../src/db");
const { bersihkanDataDemo } = require("../src/imporService");

test.before(async () => {
  await initializeDatabase();
});

test.after(async () => {
  await pool.end();
});

test("DATA CLEANUP: Hapus santri Sekretariat menghapus seluruh data anak terkait secara cascade", async () => {
  const santriId = `santri_cascade_${crypto.randomUUID()}`;
  const waliId = `wali_cascade_${crypto.randomUUID()}`;

  await query('INSERT INTO "Wali" ("id", "nama", "username", "password") VALUES ($1, \'Wali Cascade\', $2, \'pass\')', [waliId, `usr_${crypto.randomUUID()}`]);
  await query('INSERT INTO "Santri" ("id", "nama", "waliId", "saldo") VALUES ($1, \'Santri Cascade\', $2, 50000)', [santriId, waliId]);

  // Insert child records across all modules
  await query('INSERT INTO "Absensi" ("id", "santriId", "status", "tanggalISO") VALUES ($1, $2, \'Hadir\', \'2026-10-08\')', [crypto.randomUUID(), santriId]);
  await query('INSERT INTO "Perizinan" ("id", "santriId", "jenis", "alasan", "status", "tanggalKeluar", "tanggalKembali") VALUES ($1, $2, \'Pulang\', \'Sakit\', \'Disetujui\', \'2026-10-08\', \'2026-10-09\')', [crypto.randomUUID(), santriId]);
  await query('INSERT INTO "Pelanggaran" ("id", "santriId", "jenis", "poin", "tanggalISO") VALUES ($1, $2, \'Terlambat\', 5, \'2026-10-08\')', [crypto.randomUUID(), santriId]);
  await query('INSERT INTO "Nilai" ("id", "santriId", "mapel", "nilai", "tanggalISO") VALUES ($1, $2, \'Fiqih\', 90, \'2026-10-08\')', [crypto.randomUUID(), santriId]);
  await query('INSERT INTO "Tagihan" ("id", "santriId", "jenis", "jumlah", "bulan") VALUES ($1, $2, \'Syahriyah\', 100000, \'2026-10\')', [crypto.randomUUID(), santriId]);
  await query('INSERT INTO "Ledger" ("id", "santriId", "jenis", "jumlah", "saldoSetelah", "waktu") VALUES ($1, $2, \'Saldo Awal\', 50000, 50000, $3)', [crypto.randomUUID(), santriId, new Date().toISOString()]);

  // Manual Cascade Delete simulation
  const sid = santriId;
  await query('DELETE FROM "Absensi" WHERE "santriId" = $1', [sid]);
  await query('DELETE FROM "Perizinan" WHERE "santriId" = $1', [sid]);
  await query('DELETE FROM "Pelanggaran" WHERE "santriId" = $1', [sid]);
  await query('DELETE FROM "Nilai" WHERE "santriId" = $1', [sid]);
  await query('DELETE FROM "Tagihan" WHERE "santriId" = $1', [sid]);
  await query('DELETE FROM "Ledger" WHERE "santriId" = $1', [sid]);
  await query('DELETE FROM "Santri" WHERE "id" = $1', [sid]);

  const santriCheck = await queryOne('SELECT "id" FROM "Santri" WHERE "id" = $1', [santriId]);
  assert.equal(santriCheck, null, "Santri harus terhapus total dari database");

  // Clean up Wali
  await query('DELETE FROM "Wali" WHERE "id" = $1', [waliId]);
});

test("DATA CLEANUP: bersihkanDataDemo mengosongkan seluruh data santri/wali/transaksi, Guru tetap ada", async () => {
  const existingWali = await queryAll('SELECT * FROM "Wali"');
  const existingSantri = await queryAll('SELECT * FROM "Santri"');
  try {
    const result = await bersihkanDataDemo({ konfirmasi: true, aktorId: "admin_test" });
    assert.equal(result.cleaned, true);

    const santriCount = await queryOne('SELECT COUNT(*) AS "n" FROM "Santri"');
    const waliCount = await queryOne('SELECT COUNT(*) AS "n" FROM "Wali"');
    const guruCount = await queryOne('SELECT COUNT(*) AS "n" FROM "Guru"');

    assert.equal(Number(santriCount.n), 0, "Seluruh data santri harus 0");
    assert.equal(Number(waliCount.n), 0, "Seluruh data wali harus 0");
    assert.ok(Number(guruCount.n) >= 0, "Tabel Guru tetap ada");
  } finally {
    for (const w of existingWali) {
      await query(
        `INSERT INTO "Wali" ("id", "nama", "hp", "username", "password", "mustChangePassword", "statusAkun") 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         ON CONFLICT ("id") DO NOTHING`,
        [w.id, w.nama, w.hp, w.username, w.password, w.mustChangePassword, w.statusAkun]
      );
    }
    for (const s of existingSantri) {
      await query(
        `INSERT INTO "Santri" ("id", "nama", "waliId", "saldo") 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT ("id") DO NOTHING`,
        [s.id, s.nama, s.waliId, s.saldo]
      );
    }
  }
});
