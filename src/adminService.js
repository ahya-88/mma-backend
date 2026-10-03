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

module.exports = {
  semuaGuru, buatGuru, editGuru, editPasswordGuru, hapusGuru,
  semuaUnitUsaha, tambahUnitUsaha, hapusUnitUsaha,
  semuaTahunAjaran, tambahTahunAjaran, aktifkanTahunAjaran, hapusTahunAjaran,
  ambilTampilan, simpanTampilan, TAMPILAN_DEFAULT,
};