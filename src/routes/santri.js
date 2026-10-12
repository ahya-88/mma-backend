const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { query, queryOne, queryAll, withTransaction } = require("../db");
const { requireAuth, isSuperAdmin } = require("../auth");
const { CashlessError, getSantriRow, toPublicSantri, toSaldoPublik, riwayatSantri, SANTRI_BIODATA_FIELDS } = require("../cashlessService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();

function isAuthorizedSantriManager(req) {
  if (isSuperAdmin(req.user)) return true;
  if (req.user?.role === "guru") {
    const dep = req.user.departemen;
    return ["sekretariat", "administrasi", "pengasuhan", "pengajaran", "lptq", "unitusaha"].includes(dep);
  }
  return false;
}

// GET /api/santri/statistik - Statistik santri untuk dashboard skala 2.000 santri
router.get("/statistik", requireAuth, asyncHandler(async (req, res) => {
  const [totalRow, aktifRow, alumniRow, rombelRows, asramaRows] = await Promise.all([
    queryOne('SELECT COUNT(*) AS "total" FROM "Santri"'),
    queryOne('SELECT COUNT(*) AS "total" FROM "Santri" WHERE "is_deleted" = FALSE AND LOWER(COALESCE("statusSantri", \'Aktif\')) = \'aktif\''),
    queryOne('SELECT COUNT(*) AS "total" FROM "Santri" WHERE "is_deleted" = FALSE AND LOWER("statusSantri") = \'alumni\''),
    queryAll('SELECT COALESCE("kelas", \'Belum ada\') AS "kelas", COUNT(*) AS "jumlah" FROM "Santri" WHERE "is_deleted" = FALSE AND LOWER(COALESCE("statusSantri", \'Aktif\')) = \'aktif\' GROUP BY "kelas" ORDER BY "kelas"'),
    queryAll('SELECT COALESCE("asrama", \'Belum ada\') AS "asrama", COUNT(*) AS "jumlah" FROM "Santri" WHERE "is_deleted" = FALSE AND LOWER(COALESCE("statusSantri", \'Aktif\')) = \'aktif\' GROUP BY "asrama" ORDER BY "asrama"'),
  ]);

  res.json({
    total: Number(totalRow?.total || 0),
    aktif: Number(aktifRow?.total || 0),
    alumni: Number(alumniRow?.total || 0),
    perKelas: rombelRows.map((r) => ({ kelas: r.kelas, jumlah: Number(r.jumlah) })),
    perAsrama: asramaRows.map((r) => ({ asrama: r.asrama, jumlah: Number(r.jumlah) })),
  });
}));

// GET /api/santri - List santri dengan relasi data Wali
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const page = req.query.page ? Number(req.query.page) : null;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const q = (req.query.q || "").trim().toLowerCase();
  const kelas = (req.query.kelas || "").trim();
  const asrama = (req.query.asrama || "").trim();
  const status = (req.query.status || "").trim();
  const jenisKelamin = (req.query.jenisKelamin || req.query.gender || "").trim();

  const whereConditions = ['s."is_deleted" = FALSE'];
  const params = [];

  if (kelas && kelas !== "Semua") {
    params.push(kelas);
    whereConditions.push(`s."kelas" = $${params.length}`);
  }

  if (asrama && asrama !== "Semua") {
    params.push(asrama);
    whereConditions.push(`s."asrama" = $${params.length}`);
  }

  if (status && status !== "Semua") {
    params.push(status.toLowerCase());
    whereConditions.push(`LOWER(COALESCE(s."statusSantri", 'Aktif')) = $${params.length}`);
  }

  if (jenisKelamin && jenisKelamin !== "Semua") {
    params.push(jenisKelamin);
    whereConditions.push(`s."jenisKelamin" = $${params.length}`);
  }

  const angkatan = req.query.angkatan ? Number(req.query.angkatan) : null;
  if (angkatan) {
    params.push(angkatan);
    whereConditions.push(`s."angkatan" = $${params.length}`);
  }

  if (q) {
    params.push(`%${q}%`);
    whereConditions.push(`(LOWER(s."nama") LIKE $${params.length} OR LOWER(COALESCE(s."noStambuk", '')) LIKE $${params.length} OR LOWER(COALESCE(s."nis", '')) LIKE $${params.length} OR LOWER(COALESCE(s."nik", '')) LIKE $${params.length} OR LOWER(COALESCE(s."nisn", '')) LIKE $${params.length} OR LOWER(COALESCE(w."nama", '')) LIKE $${params.length})`);
  }

  const whereSql = whereConditions.length ? `WHERE ${whereConditions.join(" AND ")}` : "";

  const sqlSelect = `
    SELECT s.*, w."nama" AS "namaWali", w."hp" AS "hpWali"
    FROM "Santri" s
    LEFT JOIN "Wali" w ON s."waliId" = w."id"
    ${whereSql}
    ORDER BY s."nama"
  `;

  if (page || limit) {
    const p = Math.max(1, page || 1);
    const l = Math.min(100, Math.max(1, limit || 20));
    const offset = (p - 1) * l;

    const countSql = `
      SELECT COUNT(*) AS "total"
      FROM "Santri" s
    LEFT JOIN "Wali" w ON s."waliId" = w."id"
    ${whereSql}
    `;

    const [rows, countRes] = await Promise.all([
      queryAll(`${sqlSelect} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, l, offset]),
      queryOne(countSql, params),
    ]);

    const total = Number(countRes?.total || 0);
    const items = await Promise.all(rows.map(async (row) => {
      const pub = await toPublicSantri(row);
      return { ...pub, namaWali: row.namaWali || "", hpWali: row.hpWali || "" };
    }));

    return res.json({ items, total, page: p, limit: l, totalPages: Math.ceil(total / l) });
  }

  const rows = await queryAll(sqlSelect, params);
  const items = await Promise.all(rows.map(async (row) => {
    const pub = await toPublicSantri(row);
    return { ...pub, namaWali: row.namaWali || "", hpWali: row.hpWali || "" };
  }));

  res.json(items);
}));

// GET /api/santri/me-anak - Santri milik wali yang sedang login
router.get("/me-anak", requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role !== "wali") {
    return res.status(403).json({ error: "Hanya akun wali yang dapat mengakses daftar anak." });
  }
  const rows = await queryAll('SELECT * FROM "Santri" WHERE "waliId" = $1 AND "is_deleted" = FALSE ORDER BY "nama"', [req.user.id]);
  const items = await Promise.all(rows.map((row) => toPublicSantri(row)));
  res.json(items);
}));

// GET /api/santri/:id - Detail santri
router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const row = await queryOne(`
    SELECT s.*, w."nama" AS "namaWali", w."hp" AS "hpWali"
    FROM "Santri" s
    LEFT JOIN "Wali" w ON s."waliId" = w."id"
    WHERE s."id" = $1
  `, [req.params.id]);

  if (!row) throw new CashlessError(404, "Santri tidak ditemukan.");

  if (req.user.role === "wali" && row.waliId !== req.user.id) {
    return res.status(403).json({ error: "Akses ditolak. Anda hanya berwenang mengakses data anak sendiri." });
  }

  const pub = await toPublicSantri(row);
  res.json({ ...pub, namaWali: row.namaWali || "", hpWali: row.hpWali || "" });
}));

// GET /api/santri/:id/riwayat
router.get("/:id/riwayat", requireAuth, asyncHandler(async (req, res) => {
  const row = await queryOne('SELECT "id", "waliId" FROM "Santri" WHERE "id" = $1', [req.params.id]);
  if (!row) throw new CashlessError(404, "Santri tidak ditemukan.");
  if (req.user.role === "wali" && row.waliId !== req.user.id) {
    return res.status(403).json({ error: "Akses ditolak. Anda hanya berwenang mengakses data anak sendiri." });
  }
  res.json(await riwayatSantri(req.params.id));
}));

// GET /api/santri/:id/saldo-publik
router.get("/:id/saldo-publik", requireAuth, asyncHandler(async (req, res) => {
  const santri = await getSantriRow(req.params.id);
  if (req.user.role === "wali" && santri.waliId !== req.user.id) {
    return res.status(403).json({ error: "Akses ditolak. Anda hanya berwenang mengakses data anak sendiri." });
  }
  res.json(await toSaldoPublik(santri));
}));

// GET /api/santri/:id/rapor-ringkas
router.get("/:id/rapor-ringkas", requireAuth, asyncHandler(async (req, res) => {
  const santriId = req.params.id;
  const santri = await getSantriRow(santriId);

  if (req.user.role === "wali" && santri.waliId !== req.user.id) {
    return res.status(403).json({ error: "Akses ditolak." });
  }

  // Jalankan query secara bertahap (batching) agar tidak membanjiri connection pool Postgres
  const [hafalan, ubudiyah, nilai, prestasi] = await Promise.all([
    queryAll('SELECT * FROM "Hafalan" WHERE "santriId" = $1 ORDER BY "tanggalISO" DESC LIMIT 10', [santriId]),
    queryAll('SELECT * FROM "PenilaianUbudiyah" WHERE "santriId" = $1 ORDER BY "tanggalISO" DESC LIMIT 10', [santriId]),
    queryAll('SELECT * FROM "Nilai" WHERE "santriId" = $1 ORDER BY "tanggalISO" DESC LIMIT 20', [santriId]),
    queryAll('SELECT * FROM "Prestasi" WHERE "santriId" = $1 ORDER BY "tanggalISO" DESC LIMIT 10', [santriId]),
  ]);

  const [pelanggaran, raportAkademik, raportMental, raportTahfidz] = await Promise.all([
    queryAll('SELECT * FROM "Pelanggaran" WHERE "santriId" = $1 ORDER BY "tanggalISO" DESC LIMIT 10', [santriId]),
    queryAll('SELECT * FROM "RaportAkademik" WHERE "santriId" = $1 AND "status" = \'PUBLISHED\' ORDER BY "createdAt" DESC', [santriId]),
    queryAll('SELECT * FROM "RaportMental" WHERE "santriId" = $1 AND "status" = \'PUBLISHED\' ORDER BY "createdAt" DESC', [santriId]),
    queryAll('SELECT * FROM "RaportTahfidz" WHERE "santriId" = $1 AND "status" = \'PUBLISHED\' ORDER BY "createdAt" DESC', [santriId]),
  ]);

  const [penilaianKegiatan, absensi, perizinan, tagihan] = await Promise.all([
    queryAll('SELECT * FROM "PenilaianKegiatan" WHERE "santriId" = $1 ORDER BY "createdAt" DESC LIMIT 20', [santriId]),
    queryAll('SELECT * FROM "Absensi" WHERE "santriId" = $1 ORDER BY "tanggalISO" DESC LIMIT 30', [santriId]),
    queryAll('SELECT * FROM "Perizinan" WHERE "santriId" = $1 ORDER BY "createdAt" DESC LIMIT 15', [santriId]),
    queryAll('SELECT * FROM "Tagihan" WHERE "santriId" = $1 ORDER BY "createdAt" DESC LIMIT 10', [santriId]).catch(() => []),
  ]);

  const rekapAbsensi = { Hadir: 0, Sakit: 0, Izin: 0, Alpa: 0 };
  for (const a of (absensi || [])) {
    if (rekapAbsensi[a.status] !== undefined) rekapAbsensi[a.status]++;
  }
  const totalPoinPelanggaran = (pelanggaran || []).reduce((sum, p) => sum + Number(p.poin || 0), 0);

  res.json({
    santri: await toPublicSantri(santri),
    hafalan,
    ubudiyah,
    nilai,
    prestasi,
    pelanggaran,
    raportAkademik,
    raportMental,
    raportTahfidz,
    penilaianKegiatan,
    absensi,
    perizinan,
    tagihan: tagihan || [],
    rekapAbsensi,
    totalPoinPelanggaran,
  });
}));

// GET /api/santri/:id/raport
router.get("/:id/raport", requireAuth, asyncHandler(async (req, res) => {
  const santriId = req.params.id;
  const santri = await getSantriRow(santriId);
  if (req.user.role === "wali" && santri.waliId !== req.user.id) {
    return res.status(403).json({ error: "Akses ditolak." });
  }
  const isWaliUser = req.user.role === "wali";
  const statusFilter = isWaliUser ? 'AND "status" = \'PUBLISHED\'' : "";

  const [raportAkademik, raportMental, raportTahfidz] = await Promise.all([
    queryAll(`SELECT * FROM "RaportAkademik" WHERE "santriId" = $1 ${statusFilter} ORDER BY "createdAt" DESC`, [santriId]),
    queryAll(`SELECT * FROM "RaportMental" WHERE "santriId" = $1 ${statusFilter} ORDER BY "createdAt" DESC`, [santriId]),
    queryAll(`SELECT * FROM "RaportTahfidz" WHERE "santriId" = $1 ${statusFilter} ORDER BY "createdAt" DESC`, [santriId]),
  ]);

  res.json({ santriId, raportAkademik, raportMental, raportTahfidz });
}));

// POST /api/santri - Tambah santri baru
router.post("/", requireAuth, asyncHandler(async (req, res) => {
  if (!isAuthorizedSantriManager(req)) {
    return res.status(403).json({ error: "Hanya Sekretariat atau Superadmin yang dapat menambah santri." });
  }

  const body = req.body || {};
  const { nama, kelas, nis, noStambuk, nisn, waliId, limitJajanHarian } = body;
  if (!nama || typeof nama !== "string" || !nama.trim()) {
    throw new CashlessError(400, "Nama santri wajib diisi.");
  }

  const id = crypto.randomUUID();
  const limitVal = limitJajanHarian ? Number(limitJajanHarian) : null;
  const stambukVal = (noStambuk || nis || "").trim() || null;

  let finalWaliId = waliId || null;
  let createdWali = null;
  if (!finalWaliId && body.waliBaru && body.waliBaru.nama) {
    const { buatWali } = require("../adminService");
    createdWali = await buatWali({
      nama: body.waliBaru.nama,
      hp: body.waliBaru.hp || body.noDarurat || "",
      username: body.waliBaru.username,
      password: body.waliBaru.password || "Santri123!",
      actingUserId: req.user.id,
    });
    finalWaliId = createdWali.id;
  }

  await withTransaction(async (client) => {
    if (stambukVal) {
      const adaNis = await client.query('SELECT "id" FROM "Santri" WHERE "nis" = $1 OR "noStambuk" = $1', [stambukVal]);
      if (adaNis.rowCount) throw new CashlessError(400, "Nomor Stambuk / NIS sudah digunakan oleh santri lain.");
    }

    const cols = ['"id"', '"nama"', '"kelas"', '"nis"', '"noStambuk"', '"nisn"', '"waliId"', '"limitJajanHarian"', '"saldo"'];
    const vals = ['$1', '$2', '$3', '$4', '$5', '$6', '$7', '$8', '0'];
    const params = [id, nama.trim(), kelas ? kelas.trim() : null, stambukVal, stambukVal, nisn ? nisn.trim() : null, finalWaliId, limitVal];

    for (const field of SANTRI_BIODATA_FIELDS) {
      if (field === "noStambuk") continue;
      if (body[field] !== undefined && body[field] !== null) {
        params.push(body[field]);
        cols.push(`"${field}"`);
        vals.push(`$${params.length}`);
      }
    }

    await client.query(
      `INSERT INTO "Santri" (${cols.join(", ")}) VALUES (${vals.join(", ")})`,
      params,
    );
  });

  const newSantri = await getSantriRow(id);
  const respData = await toPublicSantri(newSantri);
  if (createdWali) respData._waliBaru = createdWali;
  res.status(201).json(respData);
}));

// POST /api/santri/:id/buat-wali - Buat akun wali langsung dari profil santri
router.post("/:id/buat-wali", requireAuth, asyncHandler(async (req, res) => {
  if (!isAuthorizedSantriManager(req)) {
    return res.status(403).json({ error: "Hanya Sekretariat atau Superadmin yang dapat membuat akun wali." });
  }

  const santriId = req.params.id;
  const santri = await getSantriRow(santriId);
  if (!santri) throw new CashlessError(404, "Data santri tidak ditemukan.");

  const { nama, hp, username, password } = req.body || {};
  const namaWaliFinal = (nama || santri.namaAyah || santri.namaIbu || `Wali ${santri.nama}`).trim();
  const hpFinal = (hp || santri.noDarurat || "").trim();
  const defaultUsername = `wali.${santri.noStambuk || santri.nis || santri.id.slice(0, 8)}`.toLowerCase().replace(/[^a-z0-9._]/g, "");
  const usernameFinal = (username ? String(username).trim() : defaultUsername).toLowerCase().replace(/[^a-z0-9._]/g, "");
  const passwordFinal = (password ? String(password).trim() : "Santri123!");

  const { buatWali } = require("../adminService");
  const createdWali = await buatWali({
    nama: namaWaliFinal,
    hp: hpFinal,
    username: usernameFinal,
    password: passwordFinal,
    santriId,
    actingUserId: req.user.id,
  });

  const updatedSantri = await getSantriRow(santriId);
  res.status(201).json({
    ok: true,
    wali: createdWali,
    santri: await toPublicSantri(updatedSantri),
  });
}));

// PUT /api/santri/:id - Update santri
router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  if (!isAuthorizedSantriManager(req)) {
    return res.status(403).json({ error: "Hanya Sekretariat atau Superadmin yang dapat mengedit santri." });
  }

  const santriId = req.params.id;
  const body = req.body || {};

  await withTransaction(async (client) => {
    const existing = await client.query('SELECT * FROM "Santri" WHERE "id" = $1 FOR UPDATE', [santriId]);
    if (!existing.rowCount) throw new CashlessError(404, "Santri tidak ditemukan.");

    const row = existing.rows[0];
    const namaFinal = body.nama !== undefined ? String(body.nama).trim() : row.nama;
    const kelasFinal = body.kelas !== undefined ? String(body.kelas).trim() : row.kelas;
    const stambukInput = body.noStambuk !== undefined ? body.noStambuk : body.nis;
    const nisFinal = stambukInput !== undefined ? (stambukInput ? String(stambukInput).trim() : null) : (row.noStambuk || row.nis);
    const nisnFinal = body.nisn !== undefined ? (body.nisn ? String(body.nisn).trim() : null) : row.nisn;
    const waliIdFinal = body.waliId !== undefined ? (body.waliId || null) : row.waliId;
    const limitFinal = body.limitJajanHarian !== undefined ? (body.limitJajanHarian ? Number(body.limitJajanHarian) : null) : row.limitJajanHarian;

    if (nisFinal && nisFinal !== (row.noStambuk || row.nis)) {
      const adaNis = await client.query('SELECT "id" FROM "Santri" WHERE ("nis" = $1 OR "noStambuk" = $1) AND "id" <> $2', [nisFinal, santriId]);
      if (adaNis.rowCount) throw new CashlessError(400, "Nomor Stambuk / NIS sudah digunakan oleh santri lain.");
    }

    const updates = [
      '"nama" = $1', '"kelas" = $2', '"nis" = $3', '"noStambuk" = $3', '"nisn" = $4', '"waliId" = $5', '"limitJajanHarian" = $6',
    ];
    const params = [namaFinal, kelasFinal, nisFinal, nisnFinal, waliIdFinal, limitFinal];

    for (const field of SANTRI_BIODATA_FIELDS) {
      if (field === "noStambuk") continue;
      if (body[field] !== undefined) {
        params.push(body[field]);
        updates.push(`"${field}" = $${params.length}`);
      }
    }

    params.push(santriId);
    await client.query(`UPDATE "Santri" SET ${updates.join(", ")} WHERE "id" = $${params.length}`, params);
  });

  const updated = await getSantriRow(santriId);
  res.json(await toPublicSantri(updated));
}));

// POST /api/santri/upsert - Tambah atau perbarui data santri secara fleksibel
router.post("/upsert", requireAuth, asyncHandler(async (req, res) => {
  if (!isAuthorizedSantriManager(req)) {
    return res.status(403).json({ error: "Hanya Superadmin atau pengelola santri yang berwenang memperbarui data santri." });
  }

  const body = req.body || {};
  const nama = (body.nama || "").trim();
  if (!nama) {
    throw new CashlessError(400, "Nama santri wajib diisi.");
  }

  const santriId = (body.id && String(body.id).trim()) ? String(body.id).trim() : crypto.randomUUID();
  const kelas = body.kelas ? String(body.kelas).trim() : null;
  const stambukVal = (body.noStambuk || body.nis || "").trim() || null;
  const nis = stambukVal;
  const nisn = body.nisn ? String(body.nisn).trim() : null;
  let waliId = body.waliId ? String(body.waliId).trim() : null;
  const limitVal = body.limitJajanHarian !== undefined && body.limitJajanHarian !== null ? Number(body.limitJajanHarian) : null;

  let createdWaliObj = null;
  if (!waliId && body.waliBaru && body.waliBaru.nama) {
    const { buatWali } = require("../adminService");
    createdWaliObj = await buatWali({
      nama: String(body.waliBaru.nama).trim(),
      hp: (body.waliBaru.hp || body.noDarurat || "").trim(),
      username: body.waliBaru.username,
      password: body.waliBaru.password || "Santri123!",
      actingUserId: req.user.id,
    });
    waliId = createdWaliObj.id;
  }

  await withTransaction(async (client) => {
    if (nis) {
      const adaNis = await client.query('SELECT "id" FROM "Santri" WHERE ("nis" = $1 OR "noStambuk" = $1) AND "id" <> $2', [nis, santriId]);
      if (adaNis.rowCount) throw new CashlessError(400, "Nomor Stambuk / NIS sudah digunakan oleh santri lain.");
    }

    const existing = await client.query('SELECT "id" FROM "Santri" WHERE "id" = $1 FOR UPDATE', [santriId]);
    if (existing.rowCount) {
      const updates = [
        '"nama" = $1', '"kelas" = $2', '"nis" = $3', '"noStambuk" = $3', '"nisn" = $4', '"waliId" = $5',
      ];
      const params = [nama, kelas, nis, nisn, waliId];
      if (limitVal !== null) {
        params.push(limitVal);
        updates.push(`"limitJajanHarian" = $${params.length}`);
      }
      for (const field of SANTRI_BIODATA_FIELDS) {
        if (field === "noStambuk") continue;
        if (body[field] !== undefined) {
          params.push(body[field]);
          updates.push(`"${field}" = $${params.length}`);
        }
      }
      params.push(santriId);
      await client.query(`UPDATE "Santri" SET ${updates.join(", ")} WHERE "id" = $${params.length}`, params);
    } else {
      const cols = ['"id"', '"nama"', '"kelas"', '"nis"', '"noStambuk"', '"nisn"', '"waliId"', '"saldo"'];
      const vals = ['$1', '$2', '$3', '$4', '$4', '$5', '$6', '0'];
      const params = [santriId, nama, kelas, nis, nisn, waliId];
      if (limitVal !== null) {
        params.push(limitVal);
        cols.push('"limitJajanHarian"');
        vals.push(`$${params.length}`);
      }
      for (const field of SANTRI_BIODATA_FIELDS) {
        if (field === "noStambuk") continue;
        if (body[field] !== undefined) {
          params.push(body[field]);
          cols.push(`"${field}"`);
          vals.push(`$${params.length}`);
        }
      }
      await client.query(`INSERT INTO "Santri" (${cols.join(", ")}) VALUES (${vals.join(", ")})`, params);
    }
  });

  const updated = await getSantriRow(santriId);
  const result = await toPublicSantri(updated);
  if (createdWaliObj) {
    result._waliBaru = createdWaliObj;
  }
  res.json(result);
}));

// DELETE /api/santri/:id
router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  if (!isSuperAdmin(req.user) && req.user?.departemen !== "sekretariat" && req.user?.departemen !== "pengasuhan") {
    return res.status(403).json({ error: "Hanya Superadmin, Sekretariat, atau Pengasuhan yang dapat menghapus data santri." });
  }

  const santriId = req.params.id;
  await withTransaction(async (client) => {
    const existing = await client.query('SELECT * FROM "Santri" WHERE "id" = $1 FOR UPDATE', [santriId]);
    if (!existing.rowCount) {
      // Jika data santri tidak ditemukan di database (mis. data mock atau sudah terhapus),
      // tetap kembalikan respons sukses agar operasi DELETE bersifat idempoten dan UI dapat membersihkan tampilannya.
      return;
    }

    await client.query('UPDATE "Santri" SET "is_deleted" = TRUE WHERE "id" = $1', [santriId]);
  });

  res.json({ id: santriId, deleted: true });
}));

// POST /api/santri/:id/kartu/terbitkan
router.post("/:id/kartu/terbitkan", requireAuth, asyncHandler(async (req, res) => {
  const santriId = req.params.id;
  const { kartuToken } = req.body || {};
  const tokenStr = kartuToken || crypto.randomBytes(16).toString("hex");
  const tISO = new Date().toISOString();

  await withTransaction(async (client) => {
    const existing = await client.query('SELECT "id" FROM "Santri" WHERE "kartuToken" = $1 AND "id" <> $2', [tokenStr, santriId]);
    if (existing.rowCount) throw new CashlessError(400, "Token/UID Kartu ini sudah terdaftar untuk santri lain.");

    await client.query(
      `UPDATE "Santri" SET "kartuToken" = $1, "kartuTerbit" = $2 WHERE "id" = $3`,
      [tokenStr, tISO, santriId],
    );
  });

  const updated = await getSantriRow(santriId);
  res.json(await toPublicSantri(updated));
}));

// POST /api/santri/:id/pin
router.post("/:id/pin", requireAuth, asyncHandler(async (req, res) => {
  const santriId = req.params.id;
  const { pin } = req.body || {};
  if (!santriId || typeof pin !== "string" || !/^\d{4,6}$/.test(pin.trim())) {
    throw new CashlessError(400, "PIN harus berupa 4–6 digit angka.");
  }

  const hash = await bcrypt.hash(pin.trim(), 10);
  await query(
    `UPDATE "Santri" SET "pinHash" = $1, "pinGagal" = 0, "pinKunciSampai" = NULL WHERE "id" = $2`,
    [hash, santriId],
  );

  res.json({ santriId, pinSet: true, pesan: "PIN santri berhasil disimpan." });
}));

// POST /api/santri/:id/luluskan - Luluskan santri menjadi Alumni
router.post("/:id/luluskan", requireAuth, asyncHandler(async (req, res) => {
  if (!isAuthorizedSantriManager(req)) {
    return res.status(403).json({ error: "Hanya Sekretariat atau Superadmin yang dapat meluluskan santri." });
  }
  const santriId = req.params.id;
  const { tahunLulus, statusSaatIni, instansiTujuan, noHp } = req.body || {};
  const tLulus = tahunLulus ? String(tahunLulus).trim() : new Date().getFullYear().toString();

  await withTransaction(async (client) => {
    const existing = await client.query('SELECT * FROM "Santri" WHERE "id" = $1 FOR UPDATE', [santriId]);
    if (!existing.rowCount) throw new CashlessError(404, "Santri tidak ditemukan.");

    await client.query(`
      UPDATE "Santri"
      SET "statusSantri" = 'Alumni',
          "alumniTahunLulus" = $1,
          "alumniStatusSaatIni" = $2,
          "alumniInstansiTujuan" = $3,
          "alumniNoHp" = $4,
          "updatedAt" = (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      WHERE "id" = $5
    `, [tLulus, statusSaatIni || "Melanjutkan Pendidikan", instansiTujuan || "", noHp || "", santriId]);
  });

  const updated = await getSantriRow(santriId);
  res.json(await toPublicSantri(updated));
}));

// POST /api/santri/:id/aktifkan-kembali - Kembalikan status santri menjadi Aktif
router.post("/:id/aktifkan-kembali", requireAuth, asyncHandler(async (req, res) => {
  if (!isAuthorizedSantriManager(req)) {
    return res.status(403).json({ error: "Hanya Sekretariat atau Superadmin yang dapat mengaktifkan santri." });
  }
  const santriId = req.params.id;
  await withTransaction(async (client) => {
    const existing = await client.query('SELECT * FROM "Santri" WHERE "id" = $1 FOR UPDATE', [santriId]);
    if (!existing.rowCount) throw new CashlessError(404, "Santri tidak ditemukan.");

    await client.query(`
      UPDATE "Santri"
      SET "statusSantri" = 'Aktif',
          "updatedAt" = (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      WHERE "id" = $1
    `, [santriId]);
  });

  const updated = await getSantriRow(santriId);
  res.json(await toPublicSantri(updated));
}));

module.exports = router;

