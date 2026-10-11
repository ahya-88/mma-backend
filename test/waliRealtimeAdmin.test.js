require("dotenv").config({ quiet: true });
if (process.env.NEON_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.NEON_DATABASE_URL;
}

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { query, queryOne } = require("../src/db");
const { buatWali, hapusWali, daftarWali, editPasswordWali, ringkasanSuperadmin } = require("../src/adminService");
const { login } = require("../src/auth");

test("WALI CRUD: buatWali, daftarWali, editPasswordWali, dan proteksi hapusWali jika ada santri", async () => {
  const adminId = `admin_${crypto.randomUUID().slice(0, 8)}`;
  const username = `wali_${crypto.randomUUID().slice(0, 8)}`;
  const password = "password123";

  // 1. Buat akun wali baru
  const baru = await buatWali({
    nama: "Bpk. Uji Coba",
    hp: "081299998888",
    username,
    password,
    actingUserId: adminId,
  });

  assert.ok(baru.id);
  assert.equal(baru.nama, "Bpk. Uji Coba");
  assert.equal(baru.username, username);
  assert.equal(baru.statusAkun, "Belum Aktivasi");

  // Verifikasi hash di DB
  const dbWali = await queryOne('SELECT * FROM "Wali" WHERE "id" = $1', [baru.id]);
  assert.ok(dbWali);
  assert.equal(dbWali.mustChangePassword, true);
  assert.ok(await bcrypt.compare(password, dbWali.password));

  // 2. Daftar wali memuat santriList (awalnya kosong)
  const list1 = await daftarWali({ q: username });
  assert.ok(list1.items.length >= 1);
  const foundWali = list1.items.find((w) => w.id === baru.id);
  assert.ok(foundWali);
  assert.deepEqual(foundWali.santriList, []);

  // 3. Tautkan santri ke wali ini
  const santriId = `santri_${crypto.randomUUID().slice(0, 8)}`;
  await query(
    `INSERT INTO "Santri" ("id", "nama", "kelas", "waliId", "saldo")
     VALUES ($1, 'Santri Anak Bpk Uji', 'Tahfidz 1A', $2, 0)`,
    [santriId, baru.id]
  );

  // 4. Cek daftar wali lagi - harus ada santriList berisi anak
  const list2 = await daftarWali({ q: username });
  const foundWithAnak = list2.items.find((w) => w.id === baru.id);
  assert.ok(foundWithAnak);
  assert.equal(foundWithAnak.santriList.length, 1);
  assert.equal(foundWithAnak.santriList[0].id, santriId);
  assert.equal(foundWithAnak.santriList[0].nama, "Santri Anak Bpk Uji");

  // 5. Coba hapus wali saat masih ada anak terhubung -> harus ditolak (error 400)
  await assert.rejects(
    async () => {
      await hapusWali({ id: baru.id, actingUserId: adminId });
    },
    /masih terhubung dengan 1 santri/i
  );

  // 6. Reset kata sandi wali
  const resetRes = await editPasswordWali({
    id: baru.id,
    password: "passwordBaru123",
    actingUserId: adminId,
  });
  assert.equal(resetRes.passwordDiubah, true);
  const updatedWali = await queryOne('SELECT * FROM "Wali" WHERE "id" = $1', [baru.id]);
  assert.ok(await bcrypt.compare("passwordBaru123", updatedWali.password));

  // 7. Lepaskan tautan santri dan hapus santri test
  await query('DELETE FROM "Santri" WHERE "id" = $1', [santriId]);

  // 8. Hapus wali berhasil saat tidak ada santri terhubung
  const delRes = await hapusWali({ id: baru.id, actingUserId: adminId });
  assert.equal(delRes.ok, true);

  const checkDeleted = await queryOne('SELECT "id" FROM "Wali" WHERE "id" = $1', [baru.id]);
  assert.equal(checkDeleted, null);
});

test("REAL-TIME ADMIN: ringkasanSuperadmin mengembalikan metrik terkonsolidasi & telemetri server", async () => {
  const ringkasan = await ringkasanSuperadmin();

  assert.ok(ringkasan.diperbaruiPada);
  assert.equal(ringkasan.statusLayanan, true);
  assert.ok(typeof ringkasan.serverUptimeDetik === "number");

  // Cek struktur kartu metrik
  assert.ok("santri" in ringkasan.kartu);
  assert.ok("wali" in ringkasan.kartu);
  assert.ok("guru" in ringkasan.kartu);
  assert.ok("absensiHariIni" in ringkasan.kartu);
  assert.ok("izinMenunggu" in ringkasan.kartu);
  assert.ok("topupMenunggu" in ringkasan.kartu);
  assert.ok("anggaranMenunggu" in ringkasan.kartu);
  assert.ok("totalSaldoSantri" in ringkasan.kartu);
  assert.ok("tagihanMenunggak" in ringkasan.kartu);
  assert.ok("nominalTunggakan" in ringkasan.kartu);
  assert.ok("jumlahTransaksiCashless" in ringkasan.kartu);
  assert.ok("transaksiHariIni" in ringkasan.kartu);
  assert.ok("nominalHariIni" in ringkasan.kartu);

  // Cek cashflow, perKelas, dan aktivitas
  assert.ok(Array.isArray(ringkasan.cashflowTujuhHari));
  assert.ok(Array.isArray(ringkasan.perKelas));
  assert.ok(Array.isArray(ringkasan.aktivitas));

  // Cek pool stats
  assert.ok(ringkasan.poolStats);
  assert.ok(typeof ringkasan.poolStats.totalCount === "number");
});
