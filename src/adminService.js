const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { query, queryOne, queryAll, withTransaction, TAMPILAN_DEFAULT } = require("./db");
const { CashlessError } = require("./cashlessService");

const uid = () => crypto.randomUUID();
const DEPARTEMEN_VALID = ["admin", "pengasuhan", "pengajaran", "lptq", "administrasi", "unitusaha", "sekretariat"];

function toPublicGuru(row) {
  if (!row) return row;
  const { password, ...rest } = row;
  return rest;
}

async function assertUsernameTersedia(username, kecualiId) {
  const adaGuru = await queryOne('SELECT "id" FROM "Guru" WHERE "username" = $1 AND "id" != $2', [username, kecualiId || ""]);
  const adaWali = await queryOne('SELECT "id" FROM "Wali" WHERE "username" = $1', [username]);
  if (adaGuru || adaWali) throw new CashlessError(409, "Username itu sudah dipakai (harus unik di seluruh sistem untuk login satu pintu).");
}

async function semuaGuru() {
  return (await queryAll('SELECT * FROM "Guru" ORDER BY "departemen", "nama"')).map(toPublicGuru);
}

async function buatGuru({ nama, username, password, departemen, unit }) {
  if (!nama || !username || !password) throw new CashlessError(400, "Nama, username, dan kata sandi wajib diisi.");
  if (!DEPARTEMEN_VALID.includes(departemen)) throw new CashlessError(400, "Departemen tidak valid.");
  if (departemen === "unitusaha" && !unit) throw new CashlessError(400, "Pilih bagian Unit Usaha (Kantin/Kopel/Dapur/BMT, dst.).");
  await assertUsernameTersedia(username);
  const row = {
    id: uid(), nama, username, password: bcrypt.hashSync(password, 10),
    departemen, unit: departemen === "unitusaha" ? unit : null,
  };
  await query(
    'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "unit") VALUES ($1, $2, $3, $4, $5, $6)',
    [row.id, row.nama, row.username, row.password, row.departemen, row.unit],
  );
  return toPublicGuru(row);
}

async function editGuru({ id, nama, username, departemen, unit }) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "Guru" WHERE "id" = $1', [id]);
    if (!row) throw new CashlessError(404, "Akun tidak ditemukan.");
    if (username && username !== row.username) await assertUsernameTersedia(username, id);
    const depFinal = departemen || row.departemen;
    if (!DEPARTEMEN_VALID.includes(depFinal)) throw new CashlessError(400, "Departemen tidak valid.");
    const unitFinal = depFinal === "unitusaha" ? (unit || row.unit) : null;
    if (depFinal === "unitusaha" && !unitFinal) throw new CashlessError(400, "Pilih bagian Unit Usaha (Kantin/Kopel/Dapur/BMT, dst.).");
    await query(
      'UPDATE "Guru" SET "nama" = $1, "username" = $2, "departemen" = $3, "unit" = $4 WHERE "id" = $5',
      [nama || row.nama, username || row.username, depFinal, unitFinal, id],
    );
    return toPublicGuru(await queryOne('SELECT * FROM "Guru" WHERE "id" = $1', [id]));
  });
}

async function editPasswordGuru({ id, password }) {
  if (!password) throw new CashlessError(400, "Kata sandi baru wajib diisi.");
  const row = await queryOne('SELECT "id" FROM "Guru" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Akun tidak ditemukan.");
  await query('UPDATE "Guru" SET "password" = $1 WHERE "id" = $2', [bcrypt.hashSync(password, 10), id]);
  return { id, updated: true };
}

async function hapusGuru({ id, actingUserId }) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "Guru" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Akun tidak ditemukan.");
    if (id === actingUserId) throw new CashlessError(400, "Tidak bisa menghapus akun sendiri yang sedang dipakai untuk login ini.");
    if (row.departemen === "admin") {
      const jumlahAdmin = (await queryOne('SELECT COUNT(*) AS "n" FROM "Guru" WHERE "departemen" = \'admin\'')).n;
      if (Number(jumlahAdmin) <= 1) throw new CashlessError(400, "Tidak bisa menghapus admin terakhir — sistem membutuhkan minimal satu akun Admin.");
    }
    await query('DELETE FROM "Guru" WHERE "id" = $1', [id]);
    return { id, deleted: true };
  });
}

const semuaUnitUsaha = () => queryAll('SELECT * FROM "UnitUsaha" ORDER BY "nama"');

async function tambahUnitUsaha(namaMentah) {
  const nama = (namaMentah || "").trim();
  if (!nama) throw new CashlessError(400, "Nama unit usaha wajib diisi.");
  return withTransaction(async () => {
    if (await queryOne('SELECT "id" FROM "UnitUsaha" WHERE "nama" = $1', [nama])) throw new CashlessError(409, "Unit usaha itu sudah ada.");
    const row = { id: uid(), nama };
    await query('INSERT INTO "UnitUsaha" ("id", "nama") VALUES ($1, $2)', [row.id, row.nama]);
    return row;
  });
}

async function hapusUnitUsaha(id) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "UnitUsaha" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Unit usaha tidak ditemukan.");
    const dipakai = Number((await queryOne('SELECT COUNT(*) AS "n" FROM "Guru" WHERE "departemen" = \'unitusaha\' AND "unit" = $1', [row.nama])).n);
    if (dipakai > 0) throw new CashlessError(409, "Unit usaha ini masih dipakai oleh akun staf — pindahkan akun tersebut ke unit lain dahulu.");
    await query('DELETE FROM "UnitUsaha" WHERE "id" = $1', [id]);
    return row;
  });
}

async function semuaTahunAjaran() {
  return (await queryAll('SELECT * FROM "TahunAjaran" ORDER BY "tahunMulai" DESC')).map((row) => ({ ...row, aktif: !!row.aktif }));
}

async function tambahTahunAjaran(tahunMulaiMentah) {
  const tahunMulai = Number(tahunMulaiMentah);
  if (!tahunMulai || tahunMulai < 2000) throw new CashlessError(400, "Masukkan tahun mulai yang valid, mis. 2027.");
  return withTransaction(async () => {
    if (await queryOne('SELECT "id" FROM "TahunAjaran" WHERE "tahunMulai" = $1', [tahunMulai])) throw new CashlessError(409, "Tahun ajaran itu sudah ada.");
    const row = { id: uid(), tahunMulai, aktif: 0 };
    await query('INSERT INTO "TahunAjaran" ("id", "tahunMulai", "aktif") VALUES ($1, $2, $3)', [row.id, row.tahunMulai, row.aktif]);
    return { ...row, aktif: false };
  });
}

async function aktifkanTahunAjaran(id) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT "id" FROM "TahunAjaran" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Tahun ajaran tidak ditemukan.");
    await query('UPDATE "TahunAjaran" SET "aktif" = 0');
    await query('UPDATE "TahunAjaran" SET "aktif" = 1 WHERE "id" = $1', [id]);
    return { id, aktif: true };
  });
}

async function hapusTahunAjaran(id) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "TahunAjaran" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Tahun ajaran tidak ditemukan.");
    await query('DELETE FROM "TahunAjaran" WHERE "id" = $1', [id]);
    return row;
  });
}

async function ambilTampilan() {
  const row = await queryOne('SELECT "nilai" FROM "Pengaturan" WHERE "kunci" = $1', ["tampilan"]);
  if (!row) return { ...TAMPILAN_DEFAULT };
  try { return { ...TAMPILAN_DEFAULT, ...JSON.parse(row.nilai) }; } catch { return { ...TAMPILAN_DEFAULT }; }
}

async function simpanTampilan(tampilan) {
  const nilai = JSON.stringify({ ...TAMPILAN_DEFAULT, ...(tampilan || {}) });
  await query(
    'INSERT INTO "Pengaturan" ("kunci", "nilai") VALUES ($1, $2) ON CONFLICT ("kunci") DO UPDATE SET "nilai" = EXCLUDED."nilai"',
    ["tampilan", nilai],
  );
  return ambilTampilan();
}

async function ringkasanSuperadmin() {
  const count = async (table, condition = "", params = []) => Number((await queryOne(`SELECT COUNT(*) AS "n" FROM "${table}" ${condition}`, params)).n);
  const today = new Date().toISOString().slice(0, 10);
  const [santri, wali, guru, absensiHariIni, izinMenunggu, topupMenunggu, anggaranMenunggu,
    tagihan, transaksi, faceTemplates, cashflowTujuhHari, perKelas, aktivitas] = await Promise.all([
    count("Santri"),
    count("Wali"),
    count("Guru"),
    count("Absensi", 'WHERE "tanggalISO" = $1', [today]),
    count("Perizinan", 'WHERE "status" = \'Menunggu\''),
    count("PermintaanBMT", 'WHERE "status" = \'Menunggu\''),
    count("PengajuanAnggaran", 'WHERE "status" = \'Diajukan\''),
    queryOne('SELECT COUNT(*) AS "jumlah", COALESCE(SUM("jumlah" - "jumlahDibayar"), 0) AS "tunggakan" FROM "Tagihan" WHERE "jumlah" > "jumlahDibayar"'),
    queryOne('SELECT COUNT(*) AS "jumlah", COALESCE(SUM("jumlah"), 0) AS "nominal" FROM "TransaksiCashless"'),
    count("FaceTemplate"),
    queryAll(`SELECT "tanggalISO" AS "tanggal", SUM(CASE WHEN "jenis" = 'Masuk' THEN "jumlah" ELSE -"jumlah" END) AS "neto"
      FROM "Cashflow" WHERE "tanggalISO" >= to_char(CURRENT_DATE - INTERVAL '6 days', 'YYYY-MM-DD')
      GROUP BY "tanggalISO" ORDER BY "tanggalISO"`),
    queryAll('SELECT COALESCE("kelas", \'Belum ditentukan\') AS "kelas", COUNT(*) AS "jumlah" FROM "Santri" GROUP BY "kelas" ORDER BY "jumlah" DESC LIMIT 8'),
    queryAll(`SELECT "waktu", "aktorRole", "aksi", "targetTipe", "targetId"
      FROM "AuditLog" ORDER BY "waktu" DESC LIMIT 8`),
  ]);

  const statusLayanan = await queryOne('SELECT 1 AS "ok"');
  return {
    diperbaruiPada: new Date().toISOString(),
    kartu: {
      santri, wali, guru, absensiHariIni, izinMenunggu, topupMenunggu, anggaranMenunggu,
      tagihanMenunggak: Number(tagihan.jumlah),
      nominalTunggakan: Number(tagihan.tunggakan),
      jumlahTransaksiCashless: Number(transaksi.jumlah),
      nominalTransaksiCashless: Number(transaksi.nominal),
      faceTemplates,
    },
    cashflowTujuhHari: cashflowTujuhHari.map((row) => ({ ...row, neto: Number(row.neto) })),
    perKelas: perKelas.map((row) => ({ ...row, jumlah: Number(row.jumlah) })),
    aktivitas,
    statusLayanan: !!statusLayanan?.ok,
  };
}

async function daftarWali() {
  return queryAll('SELECT "id", "nama", "hp", "username", "createdAt" FROM "Wali" ORDER BY "nama"');
}

async function daftarKartuSuperadmin() {
  return queryAll(`SELECT "id", "nama", "nis", "kelas", "kartuTerbit",
      ("pinHash" IS NOT NULL AND "pinHash" != '') AS "punyaPin"
    FROM "Santri" ORDER BY "nama"`);
}

async function daftarPermintaanSuperadmin() {
  return queryAll(`SELECT "id", "santriId", "waliId", "jenis", "nilaiDiminta", "alasan", "status",
      "tanggalAjukan", "tanggalDiproses", "diprosesOleh", "catatanBMT", "nominalDisetujui",
      "referensiMutasi", "diprosesPada", "perluPersetujuanKedua", "diprosesPertamaOleh",
      "createdAt", ("buktiTransfer" IS NOT NULL AND "buktiTransfer" != '') AS "adaBukti"
    FROM "PermintaanBMT" ORDER BY "createdAt" DESC`);
}

async function daftarAuditSuperadmin({ page = 1, limit = 50 } = {}) {
  const offset = (page - 1) * limit;
  const [items, total] = await Promise.all([
    queryAll(`SELECT "waktu", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId"
      FROM "AuditLog" ORDER BY "waktu" DESC LIMIT $1 OFFSET $2`, [limit, offset]),
    queryOne('SELECT COUNT(*) AS "total" FROM "AuditLog"'),
  ]);
  return { items, page, limit, total: Number(total.total) };
}

async function ubahStatusProduk({ id, aktif }) {
  if (typeof aktif !== "boolean") throw new CashlessError(400, "Status produk harus berupa boolean.");
  const result = await query(
    'UPDATE "ProdukUnitUsaha" SET "aktif" = $1, "updatedAt" = to_char(CURRENT_TIMESTAMP AT TIME ZONE \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"\') WHERE "id" = $2 RETURNING "id", "unit", "nama", "aktif"',
    [aktif ? 1 : 0, id],
  );
  if (!result.rowCount) throw new CashlessError(404, "Produk tidak ditemukan.");
  return result.rows[0];
}

module.exports = {
  semuaGuru, buatGuru, editGuru, editPasswordGuru, hapusGuru,
  semuaUnitUsaha, tambahUnitUsaha, hapusUnitUsaha,
  semuaTahunAjaran, tambahTahunAjaran, aktifkanTahunAjaran, hapusTahunAjaran,
  ambilTampilan, simpanTampilan, ringkasanSuperadmin, daftarWali, daftarKartuSuperadmin,
  daftarPermintaanSuperadmin, daftarAuditSuperadmin,
  ubahStatusProduk, TAMPILAN_DEFAULT,
};