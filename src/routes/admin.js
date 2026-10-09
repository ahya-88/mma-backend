const express = require("express");
const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("../db");
const { requireAuth, requireAdmin, requireDashboardAdmin, isSuperAdmin } = require("../auth");
const {
  semuaGuru, buatGuru, editGuru, editPasswordGuru, editPasswordWali, hapusGuru,
  semuaUnitUsaha, tambahUnitUsaha, hapusUnitUsaha,
  semuaTahunAjaran, tambahTahunAjaran, aktifkanTahunAjaran, hapusTahunAjaran,
  ambilTampilan, simpanTampilan, ringkasanSuperadmin, daftarWali, daftarKartuSuperadmin,
  daftarPermintaanSuperadmin, daftarAuditSuperadmin, ubahStatusProduk,
} = require("../adminService");
const { CashlessError, getSantriRow, toPublicSantri } = require("../cashlessService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();
const uid = () => crypto.randomUUID();
const todayISO = () => new Date().toISOString().slice(0, 10);

// Helper permissions check
function isAuthorizedAdminOrSekretariat(req) {
  if (isSuperAdmin(req.user)) return true;
  return req.user?.role === "guru" && req.user.departemen === "sekretariat";
}

// ---- Akses & Profil Pengguna ----
router.get("/akses", requireAuth, asyncHandler(async (req, res) => {
  res.json(req.user);
}));

// ---- Kelengkapan Data Santri ----
router.get("/kelengkapan-data", requireAuth, asyncHandler(async (req, res) => {
  const totalSantriRow = await queryOne('SELECT COUNT(*) AS "total" FROM "Santri"');
  const totalWaliRow = await queryOne('SELECT COUNT(*) AS "total" FROM "Wali"');
  const totalSantriBelumLengkapRow = await queryOne('SELECT COUNT(*) AS "total" FROM "Santri" WHERE "waliId" IS NULL OR "foto" IS NULL OR "nisn" IS NULL');
  const totalWaliBelumAktivasiRow = await queryOne('SELECT COUNT(*) AS "total" FROM "Wali" WHERE "statusAkun" = \'Belum Aktivasi\' OR "mustChangePassword" = TRUE');

  const perKelasRows = await queryAll(`
    SELECT COALESCE(s."kelas", 'Belum ditentukan') AS "kelas",
      COUNT(s."id") AS "total",
      COUNT(s."waliId") AS "adaWali",
      COUNT(CASE WHEN w."statusAkun" = 'Aktif' AND w."mustChangePassword" = FALSE THEN 1 END) AS "waliAktif",
      COUNT(CASE WHEN s."foto" IS NOT NULL AND s."foto" != '' THEN 1 END) AS "adaFoto",
      COUNT(CASE WHEN s."waliId" IS NOT NULL AND s."foto" IS NOT NULL AND s."foto" != '' AND s."nisn" IS NOT NULL AND s."nisn" != '' THEN 1 END) AS "dataLengkap"
    FROM "Santri" s
    LEFT JOIN "Wali" w ON s."waliId" = w."id"
    GROUP BY s."kelas"
    ORDER BY "total" DESC
  `);

  const perKelas = perKelasRows.map((r) => {
    const tot = Number(r.total || 0);
    const adaWali = Number(r.adaWali || 0);
    const waliAktif = Number(r.waliAktif || 0);
    const adaFoto = Number(r.adaFoto || 0);
    const dataLengkap = Number(r.dataLengkap || 0);
    return {
      kelas: r.kelas,
      total: tot,
      adaWali,
      persenWali: tot ? Math.round((adaWali / tot) * 100) : 0,
      waliAktif,
      persenWaliAktif: tot ? Math.round((waliAktif / tot) * 100) : 0,
      adaFoto,
      persenFoto: tot ? Math.round((adaFoto / tot) * 100) : 0,
      dataLengkap,
      persenDataLengkap: tot ? Math.round((dataLengkap / tot) * 100) : 0,
    };
  });

  res.json({
    totalSantri: Number(totalSantriRow.total || 0),
    totalWali: Number(totalWaliRow.total || 0),
    totalSantriBelumLengkap: Number(totalSantriBelumLengkapRow.total || 0),
    totalWaliBelumAktivasi: Number(totalWaliBelumAktivasiRow.total || 0),
    perKelas,
  });
}));

// ---- Ringkasan Dashboard Superadmin ----
router.get("/ringkasan", requireAuth, requireDashboardAdmin, asyncHandler(async (req, res) => {
  res.json(await ringkasanSuperadmin());
}));

// ---- Pengelolaan Staf (Guru) ----
router.get("/guru", requireAuth, asyncHandler(async (req, res) => {
  res.json(await semuaGuru());
}));

router.post("/guru", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { nama, username, password, departemen, unit, jenisAkun } = req.body || {};
  res.status(201).json(await buatGuru({
    nama, username, password, departemen, unit, jenisAkun, actingUserId: req.user.id,
  }));
}));

router.put(["/guru/:id", "/staf/:id", "/akun/:id"], requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { nama, username, departemen, unit, jenisAkun, password, newPassword } = req.body || {};
  const hasil = await editGuru({
    id: req.params.id, nama, username, departemen, unit, jenisAkun, actingUserId: req.user.id,
  });
  const pw = password || newPassword;
  if (pw) {
    await editPasswordGuru({ id: req.params.id, password: pw, actingUserId: req.user.id });
  }
  res.json(hasil);
}));

router.patch(["/guru/:id", "/staf/:id", "/akun/:id"], requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { nama, username, departemen, unit, jenisAkun, password, newPassword } = req.body || {};
  const hasil = await editGuru({
    id: req.params.id, nama, username, departemen, unit, jenisAkun, actingUserId: req.user.id,
  });
  const pw = password || newPassword;
  if (pw) {
    await editPasswordGuru({ id: req.params.id, password: pw, actingUserId: req.user.id });
  }
  res.json(hasil);
}));

router.put(["/guru/:id/password", "/staf/:id/password", "/akun/:id/password"], requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const password = req.body?.password || req.body?.newPassword;
  res.json(await editPasswordGuru({ id: req.params.id, password, actingUserId: req.user.id }));
}));

router.post(["/guru/:id/password", "/staf/:id/password", "/akun/:id/password", "/guru/:id/reset-password", "/staf/:id/reset-password", "/akun/:id/reset-password"], requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const password = req.body?.password || req.body?.newPassword;
  res.json(await editPasswordGuru({ id: req.params.id, password, actingUserId: req.user.id }));
}));

router.delete(["/guru/:id", "/staf/:id", "/akun/:id"], requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  res.json(await hapusGuru({ id: req.params.id, actingUserId: req.user.id }));
}));

// ---- Pengelolaan Wali ----
router.get("/wali", requireAuth, asyncHandler(async (req, res) => {
  res.json(await daftarWali({ page: req.query.page, limit: req.query.limit, q: req.query.q }));
}));

router.put("/wali/:id", requireAuth, asyncHandler(async (req, res) => {
  if (!isAuthorizedAdminOrSekretariat(req)) {
    return res.status(403).json({ error: "Hanya Superadmin atau Sekretariat yang dapat mengedit data wali." });
  }
  const { nama, hp, username } = req.body || {};
  const wali = await queryOne('SELECT * FROM "Wali" WHERE "id" = $1', [req.params.id]);
  if (!wali) return res.status(404).json({ error: "Akun wali tidak ditemukan." });

  if (username && username.trim() !== wali.username) {
    const existing = await queryOne('SELECT "id" FROM "Wali" WHERE "username" = $1 AND "id" <> $2', [username.trim(), req.params.id]);
    if (existing) return res.status(400).json({ error: "Username sudah digunakan oleh akun wali lain." });
  }

  await query('UPDATE "Wali" SET "nama" = COALESCE($1, "nama"), "hp" = COALESCE($2, "hp"), "username" = COALESCE($3, "username") WHERE "id" = $4', [
    nama ? String(nama).trim() : null,
    hp ? String(hp).trim() : null,
    username ? String(username).trim() : null,
    req.params.id,
  ]);
  res.json({ ok: true, message: "Data wali berhasil diperbarui." });
}));

router.post("/wali/:id/reset-password", requireAuth, asyncHandler(async (req, res) => {
  if (!isAuthorizedAdminOrSekretariat(req)) {
    return res.status(403).json({ error: "Hanya Superadmin atau Sekretariat yang dapat mereset kata sandi wali." });
  }
  const { newPassword, password } = req.body || {};
  res.json(await editPasswordWali({ id: req.params.id, password: newPassword || password, actingUserId: req.user.id }));
}));

router.put("/wali/:id/password", requireAuth, asyncHandler(async (req, res) => {
  if (!isAuthorizedAdminOrSekretariat(req)) {
    return res.status(403).json({ error: "Hanya Superadmin atau Sekretariat yang dapat mereset kata sandi wali." });
  }
  const { password, newPassword } = req.body || {};
  res.json(await editPasswordWali({ id: req.params.id, password: password || newPassword, actingUserId: req.user.id }));
}));

// ---- Unit Usaha ----
router.get("/unit-usaha", requireAuth, asyncHandler(async (req, res) => {
  res.json(await semuaUnitUsaha());
}));

router.post("/unit-usaha", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { nama } = req.body || {};
  res.status(201).json(await tambahUnitUsaha(nama));
}));

router.delete("/unit-usaha/:id", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  res.json(await hapusUnitUsaha(req.params.id, req.user.id));
}));

// ---- Tahun Ajaran ----
router.get("/tahun-ajaran", requireAuth, asyncHandler(async (req, res) => {
  res.json(await semuaTahunAjaran());
}));

router.post("/tahun-ajaran", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { tahunMulai } = req.body || {};
  res.status(201).json(await tambahTahunAjaran(tahunMulai));
}));

router.post("/tahun-ajaran/:id/aktifkan", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  res.json(await aktifkanTahunAjaran(req.params.id));
}));

router.delete("/tahun-ajaran/:id", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  res.json(await hapusTahunAjaran(req.params.id, req.user.id));
}));

// ---- Tampilan Aplikasi ----
router.get("/tampilan", requireAuth, asyncHandler(async (req, res) => {
  res.json(await ambilTampilan());
}));

router.put("/tampilan", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  res.json(await simpanTampilan(req.body));
}));

// ---- Kartu & Permintaan & Audit Superadmin ----
router.get("/kartu", requireAuth, asyncHandler(async (req, res) => {
  res.json(await daftarKartuSuperadmin({ page: req.query.page, limit: req.query.limit, q: req.query.q, kelas: req.query.kelas }));
}));

router.get("/permintaan", requireAuth, asyncHandler(async (req, res) => {
  res.json(await daftarPermintaanSuperadmin({ page: req.query.page, limit: req.query.limit, status: req.query.status, q: req.query.q }));
}));

router.get("/audit", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  res.json(await daftarAuditSuperadmin({ page: Number(req.query.page || 1), limit: Number(req.query.limit || 50) }));
}));

// ---- Impor Excel / CSV Santri (Sekretariat & Admin Sync Fix) ----
router.get("/impor/template", requireAuth, asyncHandler(async (req, res) => {
  const csvTemplate = `nama,nis,nisn,kelas,jenisKelamin,namaWali,hpWali,tempatLahir,tanggalLahir
Ahmad Fauzi,1001,00812345,7A,L,Budi Santoso,08123456789,Jakarta,2010-05-15
Siti Aminah,1002,00812346,7A,P,Rudi Hermawan,08123456780,Bandung,2010-08-20
`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="Template_Impor_Santri_MMA.csv"');
  res.send(csvTemplate);
}));

router.post("/impor/dry-run", requireAuth, asyncHandler(async (req, res) => {
  if (!isAuthorizedAdminOrSekretariat(req)) {
    return res.status(403).json({ error: "Hanya Sekretariat atau Superadmin yang dapat menguji impor santri." });
  }

  const { rows } = req.body || {};
  if (!Array.isArray(rows) || !rows.length) {
    throw new CashlessError(400, "Data baris impor tidak boleh kosong.");
  }

  let jumlahBaru = 0;
  let jumlahUpdate = 0;
  let jumlahGagal = 0;
  const detailGagal = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const barisNum = idx + 2;
    const nama = (row.nama || "").trim();
    const nis = (row.nis || "").trim();

    if (!nama) {
      jumlahGagal++;
      detailGagal.push({ baris: barisNum, nama: nama || "-", alasan: "Nama santri wajib diisi." });
      continue;
    }

    if (nis) {
      const existing = await queryOne('SELECT "id" FROM "Santri" WHERE "nis" = $1', [nis]);
      if (existing) jumlahUpdate++;
      else jumlahBaru++;
    } else {
      jumlahBaru++;
    }
  }

  res.json({
    valid: jumlahGagal === 0,
    totalBaris: rows.length,
    jumlahBaru,
    jumlahUpdate,
    jumlahGagal,
    detailGagal,
  });
}));

router.post("/impor/eksekusi", requireAuth, asyncHandler(async (req, res) => {
  if (!isAuthorizedAdminOrSekretariat(req)) {
    return res.status(403).json({ error: "Hanya Sekretariat atau Superadmin yang dapat mengeksekusi impor santri." });
  }

  const { namaBatch, rows } = req.body || {};
  if (!Array.isArray(rows) || !rows.length) {
    throw new CashlessError(400, "Data baris impor tidak boleh kosong.");
  }

  const bcrypt = require("bcryptjs");
  const batchId = uid();
  const defaultWaliPass = "wali123";
  const defaultWaliHash = await bcrypt.hash(defaultWaliPass, 10);

  let totalSantri = 0;
  let totalWaliBaru = 0;

  await withTransaction(async (client) => {
    // Record BatchImpor
    await client.query(
      `INSERT INTO "BatchImpor" ("id", "namaBatch", "sumber", "jumlahSantri", "status", "dibuatOleh")
       VALUES ($1, $2, 'excel', $3, 'Berhasil', $4)`,
      [batchId, (namaBatch || "Impor Santri").trim(), rows.length, req.user.nama],
    );

    for (const row of rows) {
      const nama = (row.nama || "").trim();
      const nis = (row.nis || "").trim() || null;
      const nisn = (row.nisn || "").trim() || null;
      const kelas = (row.kelas || "").trim() || null;
      const jenisKelamin = (row.jenisKelamin || "").trim() || null;
      const tempatLahir = (row.tempatLahir || "").trim() || null;
      const tanggalLahir = (row.tanggalLahir || "").trim() || null;
      const namaWali = (row.namaWali || "").trim();
      const hpWali = (row.hpWali || "").trim();

      if (!nama) continue;

      let waliId = null;
      if (namaWali) {
        // Cari atau buat akun Wali secara otomatis
        const usernameWali = hpWali
          ? `wali.${hpWali.slice(-6)}`
          : `wali.${namaWali.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10)}.${Math.floor(1000 + Math.random() * 9000)}`;

        let waliRow = await client.query('SELECT "id" FROM "Wali" WHERE "nama" = $1 AND ("hp" = $2 OR "username" = $3)', [namaWali, hpWali || "", usernameWali]);
        if (waliRow.rowCount) {
          waliId = waliRow.rows[0].id;
        } else {
          waliId = uid();
          await client.query(
            `INSERT INTO "Wali" ("id", "nama", "hp", "username", "password", "mustChangePassword", "statusAkun", "importBatchId")
             VALUES ($1, $2, $3, $4, $5, TRUE, 'Belum Aktivasi', $6)`,
            [waliId, namaWali, hpWali || null, usernameWali, defaultWaliHash, batchId],
          );
          totalWaliBaru++;
        }
      }

      // Upsert data Santri berdasarkan NIS atau UUID baru
      let existingSantri = nis ? await client.query('SELECT "id" FROM "Santri" WHERE "nis" = $1', [nis]) : { rowCount: 0 };

      if (existingSantri.rowCount) {
        const santriId = existingSantri.rows[0].id;
        await client.query(
          `UPDATE "Santri" SET
            "nama" = $1, "kelas" = COALESCE($2, "kelas"), "nisn" = COALESCE($3, "nisn"),
            "jenisKelamin" = COALESCE($4, "jenisKelamin"), "tempatLahir" = COALESCE($5, "tempatLahir"),
            "tanggalLahir" = COALESCE($6, "tanggalLahir"), "waliId" = COALESCE($7, "waliId"),
            "importBatchId" = $8
           WHERE "id" = $9`,
          [nama, kelas, nisn, jenisKelamin, tempatLahir, tanggalLahir, waliId, batchId, santriId],
        );
      } else {
        const santriId = uid();
        await client.query(
          `INSERT INTO "Santri"
            ("id", "nama", "kelas", "nis", "nisn", "jenisKelamin", "tempatLahir", "tanggalLahir", "waliId", "saldo", "importBatchId")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10)`,
          [santriId, nama, kelas, nis, nisn, jenisKelamin, tempatLahir, tanggalLahir, waliId, batchId],
        );
      }
      totalSantri++;
    }

    await client.query(
      'UPDATE "BatchImpor" SET "jumlahSantri" = $1, "jumlahWali" = $2 WHERE "id" = $3',
      [totalSantri, totalWaliBaru, batchId],
    );
  });

  res.json({
    batchId,
    totalSantri,
    totalWaliBaru,
    pesan: `Berhasil mengimpor ${totalSantri} data santri dan memproses ${totalWaliBaru} akun wali baru.`,
  });
}));

module.exports = router;
