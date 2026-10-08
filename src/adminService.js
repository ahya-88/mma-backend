const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { query, queryOne, queryAll, withTransaction } = require("./db");
const { CashlessError, SANTRI_BIODATA_FIELDS, getSantriRow } = require("./cashlessService");

const uid = () => crypto.randomUUID();
const DEPARTEMEN_VALID = ["pengasuhan", "pengajaran", "lptq", "administrasi", "unitusaha", "sekretariat"];
const JENIS_AKUN_VALID = ["staf", "superadmin"];
const jenisEfektif = (row) => (row.jenisAkun === "admin" ? "superadmin" : row.jenisAkun) || (row.departemen === "admin" ? "superadmin" : "staf");

async function catatAuditAdmin({ aktorId, aksi, targetTipe, targetId, detail = {} }) {
  await query(
    `INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
     VALUES ($1, $2, 'guru', $3, $4, $5, $6::jsonb)`,
    [uid(), aktorId || null, aksi, targetTipe, targetId || null, JSON.stringify(detail)],
  );
}

async function semuaGuru() {
  const rows = await queryAll('SELECT "id", "nama", "username", "departemen", "unit", "jenisAkun", "mustChangePassword", COALESCE("statusAkun", \'Aktif\') AS "statusAkun", "createdAt" FROM "Guru" ORDER BY "nama"');
  return rows.map((row) => ({ ...row, jenisAkun: jenisEfektif(row) }));
}

async function buatGuru({ nama, username, password, departemen, unit, jenisAkun, actingUserId }) {
  if (jenisAkun === "admin") throw new CashlessError(400, "Jenis akun Admin sudah dilebur ke Superadmin. Gunakan jenisAkun 'superadmin'.");
  if (!JENIS_AKUN_VALID.includes(jenisAkun)) throw new CashlessError(400, "Jenis akun tidak valid.");
  if (!nama || !username || !password) throw new CashlessError(400, "Nama, username, dan password wajib diisi.");

  const { PASSWORD_MIN_LENGTH } = require("./passwordPolicy");
  if (password.length < PASSWORD_MIN_LENGTH) throw new CashlessError(400, `Password minimal ${PASSWORD_MIN_LENGTH} karakter.`);

  if (jenisAkun !== "staf") departemen = "admin";
  if (jenisAkun === "staf" && departemen === "admin") throw new CashlessError(400, "Departemen admin hanya untuk jenisAkun superadmin.");
  if (departemen !== "admin" && !DEPARTEMEN_VALID.includes(departemen)) throw new CashlessError(400, "Departemen tidak valid.");
  if (departemen === "unitusaha" && !unit) throw new CashlessError(400, "Unit usaha wajib dipilih untuk staf unit usaha.");

  const hash = await bcrypt.hash(password, 10);
  const row = { id: uid(), nama: nama.trim(), username: username.trim(), password: hash, departemen, unit: departemen === "unitusaha" ? unit : null, jenisAkun };

  return withTransaction(async () => {
    const ada = await queryOne('SELECT "id" FROM "Guru" WHERE "username" = $1', [row.username]);
    if (ada) throw new CashlessError(400, "Username staf sudah digunakan.");
    await query(
      'INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "unit", "jenisAkun", "mustChangePassword") VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)',
      [row.id, row.nama, row.username, row.password, row.departemen, row.unit, row.jenisAkun],
    );
    await catatAuditAdmin({
      aktorId: actingUserId, aksi: "admin.staff_created", targetTipe: "Guru", targetId: row.id,
      detail: { nama: row.nama, username: row.username, jenisAkun: row.jenisAkun, departemen: row.departemen },
    });
    return { id: row.id, nama: row.nama, username: row.username, departemen: row.departemen, unit: row.unit, jenisAkun: row.jenisAkun };
  });
}

async function editGuru({ id, nama, username, departemen, unit, jenisAkun, actingUserId }) {
  if (jenisAkun === "admin") throw new CashlessError(400, "Jenis akun Admin sudah dilebur ke Superadmin. Gunakan jenisAkun 'superadmin'.");
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "Guru" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Staf tidak ditemukan.");

    const oldKind = jenisEfektif(row);
    const kindFinal = jenisAkun || oldKind;
    if (!JENIS_AKUN_VALID.includes(kindFinal)) throw new CashlessError(400, "Jenis akun tidak valid.");

    const depFinal = kindFinal !== "staf" ? "admin" : (departemen || row.departemen);
    if (kindFinal === "staf" && depFinal === "admin") throw new CashlessError(400, "Departemen admin hanya untuk jenisAkun superadmin.");
    if (depFinal !== "admin" && !DEPARTEMEN_VALID.includes(depFinal)) throw new CashlessError(400, "Departemen tidak valid.");
    const unitFinal = depFinal === "unitusaha" ? (unit || row.unit) : null;
    if (depFinal === "unitusaha" && !unitFinal) throw new CashlessError(400, "Unit usaha wajib dipilih untuk staf unit usaha.");

    if (oldKind === "superadmin" && kindFinal !== "superadmin") {
      const count = Number((await queryOne('SELECT COUNT(*) AS "n" FROM "Guru" WHERE "jenisAkun" = \'superadmin\' OR "jenisAkun" = \'admin\' OR "departemen" = \'admin\'')).n);
      if (count <= 1) throw new CashlessError(400, "Tidak bisa menurunkan akun Superadmin terakhir.");
    }

    const nameFinal = nama ? nama.trim() : row.nama;
    const userFinal = username ? username.trim() : row.username;

    const adaUser = await queryOne('SELECT "id" FROM "Guru" WHERE "username" = $1 AND "id" != $2', [userFinal, id]);
    if (adaUser) throw new CashlessError(400, "Username staf sudah digunakan.");

    await query(
      'UPDATE "Guru" SET "nama" = $1, "username" = $2, "departemen" = $3, "unit" = $4, "jenisAkun" = $5, "sessionVersion" = "sessionVersion" + 1 WHERE "id" = $6',
      [nameFinal, userFinal, depFinal, unitFinal, kindFinal, id],
    );

    await catatAuditAdmin({
      aktorId: actingUserId, aksi: "admin.staff_updated", targetTipe: "Guru", targetId: id,
      detail: { nama: nameFinal, username: userFinal, jenisAkun: kindFinal, departemen: depFinal },
    });

    return { id, nama: nameFinal, username: userFinal, departemen: depFinal, unit: unitFinal, jenisAkun: kindFinal };
  });
}

async function editPasswordGuru({ id, password, actingUserId }) {
  const { PASSWORD_MIN_LENGTH } = require("./passwordPolicy");
  if (!password || password.length < PASSWORD_MIN_LENGTH) throw new CashlessError(400, `Password minimal ${PASSWORD_MIN_LENGTH} karakter.`);

  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "Guru" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Staf tidak ditemukan.");

    const hash = await bcrypt.hash(password, 10);
    await query(
      'UPDATE "Guru" SET "password" = $1, "mustChangePassword" = TRUE, "sessionVersion" = "sessionVersion" + 1, "loginFailedAttempts" = 0, "loginLockedUntil" = NULL WHERE "id" = $2',
      [hash, id],
    );

    await catatAuditAdmin({ aktorId: actingUserId, aksi: "auth.password_reset", targetId: id, targetTipe: "Guru" });
    return { id, username: row.username, passwordDiubah: true };
  });
}

async function editPasswordWali({ id, password, actingUserId }) {
  const { PASSWORD_MIN_LENGTH } = require("./passwordPolicy");
  if (!password || password.length < PASSWORD_MIN_LENGTH) throw new CashlessError(400, `Password minimal ${PASSWORD_MIN_LENGTH} karakter.`);

  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "Wali" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Wali tidak ditemukan.");

    const hash = await bcrypt.hash(password, 10);
    await query(
      'UPDATE "Wali" SET "password" = $1, "mustChangePassword" = TRUE, "sessionVersion" = "sessionVersion" + 1, "loginFailedAttempts" = 0, "loginLockedUntil" = NULL, "statusAkun" = \'Belum Aktivasi\' WHERE "id" = $2',
      [hash, id],
    );

    await catatAuditAdmin({ aktorId: actingUserId, aksi: "auth.password_reset", targetId: id, targetTipe: "Wali" });
    return { id, username: row.username, passwordDiubah: true };
  });
}

async function hapusGuru({ id, actingUserId }) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "Guru" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Staf tidak ditemukan.");

    const kind = jenisEfektif(row);
    if (kind === "superadmin") {
      const jumlahSuperadmin = Number((await queryOne('SELECT COUNT(*) AS "n" FROM "Guru" WHERE "jenisAkun" = \'superadmin\' OR "jenisAkun" = \'admin\' OR "departemen" = \'admin\'')).n);
      if (jumlahSuperadmin <= 1) throw new CashlessError(400, "Tidak bisa menghapus Superadmin terakhir.");
    }

    await query('DELETE FROM "Guru" WHERE "id" = $1', [id]);
    await catatAuditAdmin({ aktorId: actingUserId, aksi: "admin.staff_deleted", targetTipe: "Guru", targetId: id, detail: { nama: row.nama, username: row.username } });
    return { id, deleted: true };
  });
}

async function semuaUnitUsaha() { return queryAll('SELECT "id", "nama" FROM "UnitUsaha" ORDER BY "nama"'); }
async function tambahUnitUsaha(nama) {
  if (!nama || !nama.trim()) throw new CashlessError(400, "Nama unit usaha wajib diisi.");
  const clean = nama.trim();
  const ada = await queryOne('SELECT "id" FROM "UnitUsaha" WHERE "nama" = $1', [clean]);
  if (ada) throw new CashlessError(400, "Unit usaha sudah ada.");
  const row = { id: uid(), nama: clean };
  await query('INSERT INTO "UnitUsaha" ("id", "nama") VALUES ($1, $2)', [row.id, row.nama]);
  return row;
}
async function hapusUnitUsaha(id, actingUserId) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "UnitUsaha" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Unit usaha tidak ditemukan.");
    await query('DELETE FROM "UnitUsaha" WHERE "id" = $1', [id]);
    await catatAuditAdmin({ aktorId: actingUserId, aksi: "admin.business_unit_deleted", targetTipe: "UnitUsaha", targetId: id, detail: { nama: row.nama } });
    return { id, deleted: true };
  });
}

async function semuaTahunAjaran() { return queryAll('SELECT "id", "tahunMulai", "aktif" FROM "TahunAjaran" ORDER BY "tahunMulai" DESC'); }
async function tambahTahunAjaran(tahunMulai) {
  const t = Number(tahunMulai);
  if (!t || t < 2000 || t > 2100) throw new CashlessError(400, "Tahun mulai tidak valid.");
  const ada = await queryOne('SELECT "id" FROM "TahunAjaran" WHERE "tahunMulai" = $1', [t]);
  if (ada) throw new CashlessError(400, "Tahun ajaran tersebut sudah ada.");
  const row = { id: uid(), tahunMulai: t, aktif: 0 };
  await query('INSERT INTO "TahunAjaran" ("id", "tahunMulai", "aktif") VALUES ($1, $2, $3)', [row.id, row.tahunMulai, row.aktif]);
  return row;
}
async function aktifkanTahunAjaran(id) {
  return withTransaction(async () => {
    const target = await queryOne('SELECT * FROM "TahunAjaran" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!target) throw new CashlessError(404, "Tahun ajaran tidak ditemukan.");
    await query('UPDATE "TahunAjaran" SET "aktif" = 0');
    await query('UPDATE "TahunAjaran" SET "aktif" = 1 WHERE "id" = $1', [id]);
    return { ...target, aktif: 1 };
  });
}
async function hapusTahunAjaran(id, actingUserId) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "TahunAjaran" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Tahun ajaran tidak ditemukan.");
    if (row.aktif) throw new CashlessError(400, "Tahun ajaran aktif tidak dapat dihapus.");
    await query('DELETE FROM "TahunAjaran" WHERE "id" = $1', [id]);
    await catatAuditAdmin({ aktorId: actingUserId, aksi: "admin.school_year_deleted", targetTipe: "TahunAjaran", targetId: id, detail: { tahunMulai: row.tahunMulai } });
    return { id, deleted: true };
  });
}

const TAMPILAN_DEFAULT = {
  logoUrl: "", buildingPhotoUrl: "", namaAplikasi: "Ma'had Mudaiyatul Anwar",
  warnaPrimer: "#29AAE1", warnaSekunder: "#0C4A6E", warnaAksenBg: "#7C3AED",
  warnaTeks: "#17242E", warnaTeksMuted: "#5B7C93", warnaBorder: "#CFE3F0",
  warnaLatarHalaman: "#F4F8FB", fontJudul: "Fraunces", fontIsi: "Inter", gayaBackground: "aurora",
};

let cachedTampilan = null;
let cachedTampilanTime = 0;
const TAMPILAN_CACHE_TTL_MS = 10 * 60 * 1000;

async function ambilTampilan() {
  if (cachedTampilan && Date.now() - cachedTampilanTime < TAMPILAN_CACHE_TTL_MS) {
    return cachedTampilan;
  }
  const row = await queryOne('SELECT "nilai" FROM "Pengaturan" WHERE "kunci" = \'tampilan\'');
  if (!row) {
    cachedTampilan = TAMPILAN_DEFAULT;
  } else {
    try { cachedTampilan = { ...TAMPILAN_DEFAULT, ...JSON.parse(row.nilai) }; } catch (_) { cachedTampilan = TAMPILAN_DEFAULT; }
  }
  cachedTampilanTime = Date.now();
  return cachedTampilan;
}

async function simpanTampilan(tampilan) {
  const nilai = JSON.stringify({ ...TAMPILAN_DEFAULT, ...(tampilan || {}) });
  await query(
    'INSERT INTO "Pengaturan" ("kunci", "nilai") VALUES ($1, $2) ON CONFLICT ("kunci") DO UPDATE SET "nilai" = EXCLUDED."nilai"',
    ["tampilan", nilai],
  );
  cachedTampilan = null;
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

async function daftarWali({ page, limit, q } = {}) {
  if (page || limit || q) {
    const p = Math.max(1, Number(page || 1));
    const l = Math.min(100, Math.max(1, Number(limit || 20)));
    const offset = (p - 1) * l;
    const queryStr = (q || "").trim().toLowerCase();
    const whereSql = queryStr ? `WHERE LOWER("nama") LIKE $1 OR LOWER(COALESCE("hp", '')) LIKE $1 OR LOWER("username") LIKE $1` : "";
    const params = queryStr ? [`%${queryStr}%`] : [];

    const [items, countRow] = await Promise.all([
      queryAll(`SELECT "id", "nama", "hp", "username", "statusAkun", "createdAt" FROM "Wali" ${whereSql} ORDER BY "nama" LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, l, offset]),
      queryOne(`SELECT COUNT(*) AS "total" FROM "Wali" ${whereSql}`, params),
    ]);
    const total = Number(countRow.total);
    return { items, page: p, limit: l, total, totalPages: Math.ceil(total / l) };
  }
  return queryAll('SELECT "id", "nama", "hp", "username", "statusAkun", "createdAt" FROM "Wali" ORDER BY "nama"');
}

async function daftarKartuSuperadmin({ page, limit, q, kelas } = {}) {
  if (page || limit || q || kelas) {
    const p = Math.max(1, Number(page || 1));
    const l = Math.min(100, Math.max(1, Number(limit || 20)));
    const offset = (p - 1) * l;
    const queryStr = (q || "").trim().toLowerCase();
    const k = (kelas || "").trim();

    const whereConditions = [];
    const params = [];

    if (k) {
      params.push(k);
      whereConditions.push(`"kelas" = $${params.length}`);
    }
    if (queryStr) {
      params.push(`%${queryStr}%`);
      whereConditions.push(`(LOWER("nama") LIKE $${params.length} OR LOWER(COALESCE("nis", '')) LIKE $${params.length})`);
    }

    const whereSql = whereConditions.length ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const [items, countRow] = await Promise.all([
      queryAll(`SELECT "id", "nama", "nis", "kelas", "kartuTerbit",
          ("pinHash" IS NOT NULL AND "pinHash" != '') AS "punyaPin"
        FROM "Santri" ${whereSql} ORDER BY "nama" LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, l, offset]),
      queryOne(`SELECT COUNT(*) AS "total" FROM "Santri" ${whereSql}`, params),
    ]);
    const total = Number(countRow.total);
    return { items, page: p, limit: l, total, totalPages: Math.ceil(total / l) };
  }

  return queryAll(`SELECT "id", "nama", "nis", "kelas", "kartuTerbit",
      ("pinHash" IS NOT NULL AND "pinHash" != '') AS "punyaPin"
    FROM "Santri" ORDER BY "nama"`);
}

async function daftarPermintaanSuperadmin({ page, limit, status, q } = {}) {
  if (page || limit || status || q) {
    const p = Math.max(1, Number(page || 1));
    const l = Math.min(100, Math.max(1, Number(limit || 20)));
    const offset = (p - 1) * l;
    const st = (status && status !== "Semua") ? status.trim() : "";
    const queryStr = (q || "").trim().toLowerCase();

    const whereConditions = [];
    const params = [];

    if (st) {
      params.push(st);
      whereConditions.push(`"status" = $${params.length}`);
    }
    if (queryStr) {
      params.push(`%${queryStr}%`);
      whereConditions.push(`(LOWER("jenis") LIKE $${params.length} OR LOWER("alasan") LIKE $${params.length})`);
    }

    const whereSql = whereConditions.length ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const [rows, countRow] = await Promise.all([
      queryAll(`SELECT "id", "santriId", "waliId", "jenis", "nilaiDiminta", "alasan", "status",
          "tanggalAjukan", "tanggalDiproses", "diprosesOleh", "catatanBMT", "nominalDisetujui",
          "referensiMutasi", "diprosesPada", "perluPersetujuanKedua", "diprosesPertamaOleh",
          "createdAt", ("buktiTransfer" IS NOT NULL AND "buktiTransfer" != '') AS "adaBukti"
        FROM "PermintaanBMT" ${whereSql} ORDER BY "createdAt" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, l, offset]),
      queryOne(`SELECT COUNT(*) AS "total" FROM "PermintaanBMT" ${whereSql}`, params),
    ]);
    const total = Number(countRow.total);
    return { items: rows, page: p, limit: l, total, totalPages: Math.ceil(total / l) };
  }

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
  semuaGuru, buatGuru, editGuru, editPasswordGuru, editPasswordWali, hapusGuru,
  semuaUnitUsaha, tambahUnitUsaha, hapusUnitUsaha,
  semuaTahunAjaran, tambahTahunAjaran, aktifkanTahunAjaran, hapusTahunAjaran,
  ambilTampilan, simpanTampilan, ringkasanSuperadmin, daftarWali, daftarKartuSuperadmin,
  daftarPermintaanSuperadmin, daftarAuditSuperadmin,
  ubahStatusProduk, TAMPILAN_DEFAULT,
};
