const express = require("express");
const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("../db");
const { requireAuth, requireBMT, requireAnyStaff, requireSekretariat, isSuperAdmin } = require("../auth");
const { getSantriRow, toPublicSantri, toSaldoPublik, riwayatSantri, CashlessError, SANTRI_BIODATA_FIELDS } = require("../cashlessService");
const { setPin, terbitkanKartu } = require("../pinService");
const { riwayatAbsensi, daftarPerizinan, riwayatPelanggaran } = require("../pengasuhanService");
const { nilaiPerSantri, prestasiPerSantri, hafalanPerSantri, ubudiyahPerSantri } = require("../akademikService");
const { tagihanSantri } = require("../keuanganService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();
const isBMT = (user) => user?.role === "guru" && user.departemen === "unitusaha" && user.unit === "BMT";

function assertLihatSantri(req, santri) {
  if (isSuperAdmin(req.user)) return;
  if (isBMT(req.user)) return;
  if (req.user.role === "wali" && santri.waliId === req.user.id) return;
  throw new CashlessError(403, "Tidak berwenang melihat data santri ini.");
}

function assertLihatRaporSantri(req, santri) {
  if (isSuperAdmin(req.user)) return;
  if (req.user.role === "guru") return;
  if (req.user.role === "wali" && santri.waliId === req.user.id) return;
  throw new CashlessError(403, "Tidak berwenang melihat data santri ini.");
}

router.post("/pin/awal", requireAuth, requireBMT, asyncHandler(async (req, res) => {
  const daftarPin = await withTransaction(async () => {
    const belumPunyaPin = await queryAll('SELECT "id", "nis", "nama", "kelas" FROM "Santri" WHERE "pinHash" IS NULL OR "pinHash" = \'\' ORDER BY "nama" FOR UPDATE');
    const daftar = [];
    for (const santri of belumPunyaPin) {
      const pin = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      await setPin(santri.id, pin);
      daftar.push({ nis: santri.nis ?? "", nama: santri.nama, kelas: santri.kelas ?? "", pin });
    }
    await query(`INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
      VALUES ($1, $2, $3, 'auth.initial_pins_generated', 'SantriBatch', NULL, $4::jsonb)`,
    [crypto.randomUUID(), req.user.id, req.user.role, JSON.stringify({ jumlah: daftar.length })]);
    return daftar;
  });
  res.json(daftarPin);
}));

router.post("/:id/pin", requireAuth, requireBMT, asyncHandler(async (req, res) => {
  const santri = await getSantriRow(req.params.id);
  await withTransaction(async () => {
    await setPin(santri.id, req.body?.pin);
    await query(`INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
      VALUES ($1, $2, $3, 'auth.student_pin_reset', 'Santri', $4, '{}'::jsonb)`,
    [crypto.randomUUID(), req.user.id, req.user.role, santri.id]);
  });
  res.json({ diatur: true });
}));

router.post("/:id/kartu/terbitkan", requireAuth, requireBMT, asyncHandler(async (req, res) => {
  const santri = await getSantriRow(req.params.id);
  const { kartuTerbit } = await withTransaction(async () => {
    const issued = await terbitkanKartu(santri.id);
    await query(`INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
      VALUES ($1, $2, $3, 'cashless.student_card_issued', 'Santri', $4, '{}'::jsonb)`,
    [crypto.randomUUID(), req.user.id, req.user.role, santri.id]);
    return issued;
  });
  res.json({ terbit: true, kartuTerbit });
}));

router.post("/upsert", requireAuth, requireAnyStaff, asyncHandler(async (req, res) => {
  const body = req.body || {};
  const { id, nama } = body;
  if (!id || !nama) return res.status(400).json({ error: "id dan nama santri wajib diisi." });
  const ada = await queryOne('SELECT "id" FROM "Santri" WHERE "id" = $1', [id]);
  const biodataToSet = {};
  for (const field of SANTRI_BIODATA_FIELDS) if (field in body) biodataToSet[field] = body[field] || null;
  const riwayatKelasProvided = "riwayatKelas" in body;
  const riwayatKelasJSON = riwayatKelasProvided ? JSON.stringify(body.riwayatKelas || []) : null;

  if (ada) {
    const values = [nama];
    const sets = ['"nama" = $1'];
    let fotoWajahBerubah = false;
    for (const column of ["kelas", "nis", "nisn", "waliId"]) {
      if (column in body) {
        values.push(body[column] || null);
        sets.push(`"${column}" = $${values.length}`);
      }
    }
    for (const field of Object.keys(biodataToSet)) {
      values.push(biodataToSet[field]);
      sets.push(`"${field}" = $${values.length}`);
    }
    if ("foto" in biodataToSet) {
      const lama = await queryOne('SELECT "foto" FROM "Santri" WHERE "id" = $1', [id]);
      if ((lama?.foto || null) !== (biodataToSet.foto || null)) {
        sets.push('"faceEmbedding" = NULL');
        fotoWajahBerubah = true;
      }
    }
    if (riwayatKelasProvided) {
      values.push(riwayatKelasJSON);
      sets.push(`"riwayatKelas" = $${values.length}`);
    }
    sets.push('"updatedAt" = to_char(CURRENT_TIMESTAMP AT TIME ZONE \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"\')');
    values.push(id);
    await withTransaction(async () => {
      await query('SELECT "id" FROM "Santri" WHERE "id" = $1 FOR UPDATE', [id]);
      await query(`UPDATE "Santri" SET ${sets.join(", ")} WHERE "id" = $${values.length}`, values);
      if (fotoWajahBerubah) await query('DELETE FROM "FaceTemplate" WHERE "santriId" = $1 AND "sumber" = \'foto\'', [id]);
    });
  } else {
    const columns = ["id", "nama", "kelas", "nis", "nisn", "waliId", "saldo", ...Object.keys(biodataToSet)];
    const values = [id, nama, body.kelas || null, body.nis || null, body.nisn || null, body.waliId || null, 0,
      ...Object.values(biodataToSet)];
    if (riwayatKelasProvided) {
      columns.push("riwayatKelas");
      values.push(riwayatKelasJSON);
    }
    await query(`INSERT INTO "Santri" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES (${values.map((_, index) => `$${index + 1}`).join(", ")})`, values);
  }
  const publik = await toPublicSantri(await getSantriRow(id));
  res.json(isBMT(req.user) ? publik : sanitasiUntukNonBMT(publik));
}));

const FIELD_FINANSIAL_SANTRI = ["saldo", "limitJajanHarian", "durasiBlokirHari", "sisaLimitHariIni", "blokir"];
function sanitasiUntukNonBMT(santriPublik) {
  const hasil = { ...santriPublik };
  for (const field of FIELD_FINANSIAL_SANTRI) delete hasil[field];
  return hasil;
}

router.get("/", requireAuth, requireAnyStaff, asyncHandler(async (req, res) => {
  if (req.query.page !== undefined || req.query.limit !== undefined || req.query.q !== undefined || req.query.kelas !== undefined) {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const offset = (page - 1) * limit;
    const q = (req.query.q || "").trim().toLowerCase();
    const kelas = (req.query.kelas || "").trim();

    const whereConditions = [];
    const params = [];

    if (kelas) {
      params.push(kelas);
      whereConditions.push(`"kelas" = $${params.length}`);
    }

    if (q) {
      params.push(`%${q}%`);
      whereConditions.push(`(LOWER("nama") LIKE $${params.length} OR LOWER(COALESCE("nis", '')) LIKE $${params.length} OR LOWER(COALESCE("nisn", '')) LIKE $${params.length})`);
    }

    const whereSql = whereConditions.length ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const [rows, countRow] = await Promise.all([
      queryAll(`SELECT * FROM "Santri" ${whereSql} ORDER BY "nama" LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]),
      queryOne(`SELECT COUNT(*) AS "total" FROM "Santri" ${whereSql}`, params),
    ]);

    const total = Number(countRow.total);
    const publicRows = await Promise.all(rows.map((row) => toPublicSantri(row)));
    const sanitized = isBMT(req.user) ? publicRows : publicRows.map(sanitasiUntukNonBMT);

    return res.json({
      items: sanitized,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  }

  const rows = await Promise.all((await queryAll('SELECT * FROM "Santri" ORDER BY "nama"')).map((row) => toPublicSantri(row)));
  res.json(isBMT(req.user) ? rows : rows.map(sanitasiUntukNonBMT));
}));

router.delete("/:id", requireAuth, requireSekretariat, asyncHandler(async (req, res) => {
  try {
    const santri = await withTransaction(async () => {
      const row = await getSantriRow(req.params.id, true);
      await query('DELETE FROM "Santri" WHERE "id" = $1', [row.id]);
      await query(`INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
        VALUES ($1, $2, $3, 'data.santri_deleted', 'Santri', $4, '{}'::jsonb)`,
      [crypto.randomUUID(), req.user.id, req.user.role, row.id]);
      return row;
    });
    res.json({ id: santri.id, deleted: true });
  } catch (error) {
    if (error instanceof CashlessError) throw error;
    if (error && error.code === "23503") return res.status(409).json({ error: "Santri tidak bisa dihapus karena masih memiliki riwayat data terkait (transaksi, nilai, absensi, dsb.)." });
    throw error;
  }
}));

router.get("/me-anak", requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role !== "wali") return res.status(403).json({ error: "Hanya untuk akun wali." });
  const rows = await Promise.all((await queryAll('SELECT * FROM "Santri" WHERE "waliId" = $1', [req.user.id])).map((row) => toPublicSantri(row)));
  res.json(rows);
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const santri = await getSantriRow(req.params.id);
  assertLihatSantri(req, santri);
  res.json(await toPublicSantri(santri));
}));

router.get("/:id/riwayat", requireAuth, asyncHandler(async (req, res) => {
  const santri = await getSantriRow(req.params.id);
  assertLihatSantri(req, santri);
  res.json(await riwayatSantri(req.params.id));
}));

router.get("/:id/saldo-publik", requireAuth, asyncHandler(async (req, res) => {
  const santri = await getSantriRow(req.params.id);
  assertLihatSantri(req, santri);
  res.json(await toSaldoPublik(santri));
}));

router.get("/:id/rapor-ringkas", requireAuth, asyncHandler(async (req, res) => {
  const santri = await getSantriRow(req.params.id);
  assertLihatRaporSantri(req, santri);
  const [absensi, pelanggaran, perizinan, nilai, prestasi, hafalan, ubudiyah] = await Promise.all([
    riwayatAbsensi(req.params.id),
    riwayatPelanggaran(req.params.id),
    daftarPerizinan({ santriId: req.params.id }),
    nilaiPerSantri(req.params.id),
    prestasiPerSantri(req.params.id),
    hafalanPerSantri(req.params.id),
    ubudiyahPerSantri(req.params.id),
  ]);
  const bolehLihatTagihan = isSuperAdmin(req.user) || req.user.role === "wali" || (req.user.role === "guru" && req.user.departemen === "administrasi");
  res.json({
    absensi: absensi.rows,
    rekapAbsensi: absensi.rekap,
    perizinan,
    pelanggaran: pelanggaran.rows,
    totalPoinPelanggaran: pelanggaran.totalPoin,
    nilai,
    prestasi,
    hafalan,
    ubudiyah,
    tagihan: bolehLihatTagihan ? await tagihanSantri(req.params.id) : [],
  });
}));

module.exports = router;
