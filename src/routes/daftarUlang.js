const express = require("express");
const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("../db");
const { requireAuth, isSuperAdmin } = require("../auth");
const { CashlessError, getSantriRow, toPublicSantri } = require("../cashlessService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();

function isAuthorizedDaftarUlangManager(req) {
  if (isSuperAdmin(req.user)) return true;
  if (req.user?.role === "guru") {
    const dep = req.user.departemen;
    return ["sekretariat", "pengasuhan", "pengajaran", "administrasi"].includes(dep);
  }
  return false;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = () => crypto.randomUUID();

// GET /api/daftar-ulang/tahun-aktif
// Mendapatkan ringkasan tahun ajaran aktif & rekap daftar ulang
router.get("/tahun-aktif", requireAuth, asyncHandler(async (req, res) => {
  const tahunAktif = await queryOne('SELECT * FROM "TahunAjaran" WHERE "aktif" = 1 LIMIT 1');
  if (!tahunAktif) {
    return res.json({
      tahunAktif: null,
      statistik: { totalSantriAktif: 0, sudahDaftarUlang: 0, belumDaftarUlang: 0 },
    });
  }

  const [totalSantri, terdaftar] = await Promise.all([
    queryOne('SELECT COUNT(*) AS "total" FROM "Santri" WHERE COALESCE("statusSantri", \'Aktif\') = \'Aktif\''),
    queryOne('SELECT COUNT(DISTINCT "santriId") AS "total" FROM "PendaftaranUlang" WHERE "tahunAjaranId" = $1', [tahunAktif.id]),
  ]);

  const total = Number(totalSantri?.total || 0);
  const sudah = Number(terdaftar?.total || 0);

  res.json({
    tahunAktif: {
      ...tahunAktif,
      label: `${tahunAktif.tahunMulai}/${tahunAktif.tahunMulai + 1}`,
    },
    statistik: {
      totalSantriAktif: total,
      sudahDaftarUlang: sudah,
      belumDaftarUlang: Math.max(0, total - sudah),
    },
  });
}));

// GET /api/daftar-ulang/riwayat/:santriId
// Mendapatkan seluruh riwayat pendaftaran ulang seorang santri
router.get("/riwayat/:santriId", requireAuth, asyncHandler(async (req, res) => {
  const santriId = req.params.santriId;
  const santri = await getSantriRow(santriId);
  if (req.user.role === "wali" && santri.waliId !== req.user.id) {
    return res.status(403).json({ error: "Akses ditolak." });
  }

  const rows = await queryAll(`
    SELECT p.*, t."tahunMulai"
    FROM "PendaftaranUlang" p
    LEFT JOIN "TahunAjaran" t ON p."tahunAjaranId" = t."id"
    WHERE p."santriId" = $1
    ORDER BY p."createdAt" DESC
  `, [santriId]);

  const items = rows.map((r) => ({
    ...r,
    tahunLabel: r.tahunMulai ? `${r.tahunMulai}/${r.tahunMulai + 1}` : "-",
  }));

  res.json(items);
}));

// POST /api/daftar-ulang/promosi-massal
// Melakukan kenaikan kelas & pemindahan asrama santri secara massal (batch)
router.post("/promosi-massal", requireAuth, asyncHandler(async (req, res) => {
  if (!isAuthorizedDaftarUlangManager(req)) {
    return res.status(403).json({ error: "Hanya Sekretariat, Pengasuhan, atau Superadmin yang berwenang melakukan kenaikan kelas massal." });
  }

  const { tahunAjaranId, items } = req.body || {};
  if (!tahunAjaranId) throw new CashlessError(400, "tahunAjaranId wajib ditentukan.");
  if (!Array.isArray(items) || !items.length) {
    throw new CashlessError(400, "Daftar santri (items) untuk promosi tidak boleh kosong.");
  }

  const tahunRow = await queryOne('SELECT * FROM "TahunAjaran" WHERE "id" = $1', [tahunAjaranId]);
  if (!tahunRow) throw new CashlessError(404, "Tahun ajaran tidak ditemukan.");

  const tahunLabel = `${tahunRow.tahunMulai}/${tahunRow.tahunMulai + 1}`;
  const tISO = todayISO();
  let diproses = 0;

  await withTransaction(async (client) => {
    for (const item of items) {
      const santriId = item.santriId;
      const kelasBaru = (item.kelasBaru || "").trim();
      if (!santriId || !kelasBaru) continue;

      const santriRes = await client.query('SELECT * FROM "Santri" WHERE "id" = $1 FOR UPDATE', [santriId]);
      if (!santriRes.rowCount) continue;
      const s = santriRes.rows[0];

      const kelasLama = s.kelas || "";
      const asramaLama = s.asrama || "";
      const asramaBaru = item.asramaBaru !== undefined ? (item.asramaBaru || "").trim() : asramaLama;
      const halaqohBaru = item.halaqohBaru !== undefined ? (item.halaqohBaru || "").trim() : (s.halaqoh || "");
      const statusPromosi = item.status || "Aktif"; // Aktif | Tinggal Kelas
      const catatan = item.keterangan || (statusPromosi === "Tinggal Kelas" ? "Tinggal kelas" : "Naik kelas");

      // Update riwayat kelas
      let riwayat = [];
      try { riwayat = s.riwayatKelas ? JSON.parse(s.riwayatKelas) : []; } catch (_) {}
      riwayat.push({
        tahunAjaran: tahunLabel,
        kelas: kelasBaru,
        asrama: asramaBaru,
        tanggal: tISO,
        status: statusPromosi,
      });

      // Update santri master
      await client.query(`
        UPDATE "Santri"
        SET "kelas" = $1,
            "asrama" = $2,
            "halaqoh" = $3,
            "statusSantri" = 'Aktif',
            "riwayatKelas" = $4,
            "updatedAt" = (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
        WHERE "id" = $5
      `, [kelasBaru, asramaBaru, halaqohBaru, JSON.stringify(riwayat), santriId]);

      // Catat snapshot ke PendaftaranUlang (UPSERT)
      const pId = uid();
      await client.query(`
        INSERT INTO "PendaftaranUlang"
          ("id", "santriId", "tahunAjaranId", "kelasBaru", "kelasSebelumnya", "asramaBaru", "asramaSebelumnya", "halaqohBaru", "status", "keterangan", "diprosesOleh", "tanggalDaftarUlang")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT ("santriId", "tahunAjaranId") DO UPDATE
        SET "kelasBaru" = EXCLUDED."kelasBaru",
            "kelasSebelumnya" = EXCLUDED."kelasSebelumnya",
            "asramaBaru" = EXCLUDED."asramaBaru",
            "asramaSebelumnya" = EXCLUDED."asramaSebelumnya",
            "halaqohBaru" = EXCLUDED."halaqohBaru",
            "status" = EXCLUDED."status",
            "keterangan" = EXCLUDED."keterangan",
            "diprosesOleh" = EXCLUDED."diprosesOleh",
            "tanggalDaftarUlang" = EXCLUDED."tanggalDaftarUlang"
      `, [
        pId, santriId, tahunAjaranId, kelasBaru, kelasLama, asramaBaru, asramaLama, halaqohBaru,
        statusPromosi, catatan, req.user?.nama || req.user?.username || "Petugas", tISO,
      ]);

      diproses++;
    }

    // Catat Audit Log
    await client.query(`
      INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
      VALUES ($1, $2, 'guru', 'santri.promosi_massal', 'TahunAjaran', $3, $4::jsonb)
    `, [
      uid(), req.user?.id || null, tahunAjaranId,
      JSON.stringify({ tahunLabel, totalDiproses: diproses }),
    ]);
  });

  res.json({
    sukses: true,
    totalDiproses: diproses,
    pesan: `Berhasil memproses kenaikan kelas & daftar ulang untuk ${diproses} santri.`,
  });
}));

// POST /api/daftar-ulang/luluskan-massal
// Meluluskan santri tingkat akhir secara massal menjadi Alumni
router.post("/luluskan-massal", requireAuth, asyncHandler(async (req, res) => {
  if (!isAuthorizedDaftarUlangManager(req)) {
    return res.status(403).json({ error: "Hanya Sekretariat atau Superadmin yang berwenang meluluskan santri." });
  }

  const { santriIds, tahunLulus, statusSaatIni, instansiTujuan } = req.body || {};
  if (!Array.isArray(santriIds) || !santriIds.length) {
    throw new CashlessError(400, "Pilih minimal 1 santri untuk diluluskan.");
  }
  const tLulus = (tahunLulus || new Date().getFullYear()).toString();
  const stSaatIni = statusSaatIni || "Melanjutkan Pendidikan";
  let diproses = 0;

  await withTransaction(async (client) => {
    for (const id of santriIds) {
      const s = await client.query('SELECT "id" FROM "Santri" WHERE "id" = $1 FOR UPDATE', [id]);
      if (!s.rowCount) continue;

      await client.query(`
        UPDATE "Santri"
        SET "statusSantri" = 'Alumni',
            "alumniTahunLulus" = $1,
            "alumniStatusSaatIni" = $2,
            "alumniInstansiTujuan" = $3,
            "updatedAt" = (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
        WHERE "id" = $4
      `, [tLulus, stSaatIni, instansiTujuan || "", id]);

      diproses++;
    }

    await client.query(`
      INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
      VALUES ($1, $2, 'guru', 'santri.luluskan_massal', 'Santri', NULL, $3::jsonb)
    `, [
      uid(), req.user?.id || null,
      JSON.stringify({ tahunLulus: tLulus, totalDiluluskan: diproses }),
    ]);
  });

  res.json({
    sukses: true,
    totalDiluluskan: diproses,
    pesan: `Berhasil meluluskan ${diproses} santri ke buku induk alumni.`,
  });
}));

module.exports = router;
