const express = require("express");
const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("../db");
const { requireAuth, requireAdministrasi, isSuperAdmin } = require("../auth");
const { CashlessError } = require("../cashlessService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();
const uid = () => crypto.randomUUID();
const todayISO = () => new Date().toISOString().slice(0, 10);

// ---- Tagihan & Pembayaran ----
router.get("/tagihan", requireAuth, asyncHandler(async (req, res) => {
  const santriId = req.query.santriId;
  const bulan = req.query.bulan;

  const kondisi = [];
  const params = [];

  if (santriId) { params.push(santriId); kondisi.push(`t."santriId" = $${params.length}`); }
  if (bulan) { params.push(bulan); kondisi.push(`t."bulan" = $${params.length}`); }

  if (req.user.role === "wali") {
    params.push(req.user.id);
    kondisi.push(`s."waliId" = $${params.length}`);
  }

  const where = kondisi.length ? `WHERE ${kondisi.join(" AND ")}` : "";

  const rows = await queryAll(`
    SELECT t.*, s."nama" AS "namaSantri", s."kelas"
    FROM "Tagihan" t
    LEFT JOIN "Santri" s ON t."santriId" = s."id"
    ${where}
    ORDER BY t."createdAt" DESC
  `, params);

  res.json(rows.map((r) => ({
    ...r,
    jumlah: Number(r.jumlah),
    jumlahDibayar: Number(r.jumlahDibayar),
    tunggakan: Math.max(0, Number(r.jumlah) - Number(r.jumlahDibayar)),
  })));
}));

router.post("/tagihan", requireAuth, requireAdministrasi, asyncHandler(async (req, res) => {
  const { santriId, jenis, jumlah, bulan } = req.body || {};
  const nominal = Number(jumlah);
  if (!santriId || !jenis || !nominal || nominal <= 0 || !bulan) {
    throw new CashlessError(400, "santriId, jenis, jumlah, dan bulan wajib diisi.");
  }

  const id = uid();
  await query(
    `INSERT INTO "Tagihan" ("id", "santriId", "jenis", "jumlah", "bulan", "jumlahDibayar", "dicatatOleh")
     VALUES ($1, $2, $3, $4, $5, 0, $6)`,
    [id, santriId, jenis, nominal, bulan, req.user.nama],
  );

  const row = await queryOne('SELECT * FROM "Tagihan" WHERE "id" = $1', [id]);
  res.status(201).json(row);
}));

router.put("/tagihan/:id/bayar", requireAuth, requireAdministrasi, asyncHandler(async (req, res) => {
  const { jumlahBayar } = req.body || {};
  const nominalBayar = Number(jumlahBayar);
  if (!nominalBayar || nominalBayar <= 0) {
    throw new CashlessError(400, "Jumlah bayar harus lebih besar dari 0.");
  }

  const tagihanId = req.params.id;
  await withTransaction(async (client) => {
    const row = await client.query('SELECT * FROM "Tagihan" WHERE "id" = $1 FOR UPDATE', [tagihanId]);
    if (!row.rowCount) throw new CashlessError(404, "Tagihan tidak ditemukan.");

    const t = row.rows[0];
    const totalSemula = Number(t.jumlah);
    const sudahDibayar = Number(t.jumlahDibayar || 0);
    const totalDibayarBaru = sudahDibayar + nominalBayar;

    if (totalDibayarBaru > totalSemula) {
      throw new CashlessError(400, `Jumlah bayar melebihi sisa tagihan (${totalSemula - sudahDibayar}).`);
    }

    await client.query(
      `UPDATE "Tagihan" SET "jumlahDibayar" = $1, "tanggalBayarISO" = $2 WHERE "id" = $3`,
      [totalDibayarBaru, todayISO(), tagihanId],
    );
  });

  const updated = await queryOne('SELECT * FROM "Tagihan" WHERE "id" = $1', [tagihanId]);
  res.json(updated);
}));

// ---- Cashflow / Arus Kas ----
router.get("/cashflow", requireAuth, asyncHandler(async (req, res) => {
  const bulan = req.query.bulan || todayISO().slice(0, 7);
  const unit = req.query.unit;

  const kondisi = [`"bulan" = $1`];
  const params = [bulan];

  if (unit && unit !== "Semua") {
    params.push(unit);
    kondisi.push(`"unit" = $${params.length}`);
  }

  const rows = await queryAll(`SELECT * FROM "Cashflow" WHERE ${kondisi.join(" AND ")} ORDER BY "tanggalISO" DESC`, params);
  res.json(rows.map((r) => ({ ...r, jumlah: Number(r.jumlah) })));
}));

router.post("/cashflow", requireAuth, requireAdministrasi, asyncHandler(async (req, res) => {
  const { jenis, kategori, unit, jumlah, keterangan } = req.body || {};
  const nominal = Number(jumlah);
  if (!["Masuk", "Keluar"].includes(jenis) || !kategori || !nominal || nominal <= 0) {
    throw new CashlessError(400, "Jenis ('Masuk'/'Keluar'), kategori, dan jumlah valid wajib diisi.");
  }

  const id = uid();
  const tISO = todayISO();
  const bln = tISO.slice(0, 7);

  await query(
    `INSERT INTO "Cashflow" ("id", "bulan", "tanggalISO", "jenis", "kategori", "unit", "jumlah", "keterangan", "dicatatOleh")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, bln, tISO, jenis, kategori, unit || null, nominal, keterangan || null, req.user.nama],
  );

  const row = await queryOne('SELECT * FROM "Cashflow" WHERE "id" = $1', [id]);
  res.status(201).json(row);
}));

// ---- Pengajuan Anggaran ----
router.get("/anggaran", requireAuth, asyncHandler(async (req, res) => {
  const status = req.query.status;
  const kondisi = [];
  const params = [];

  if (status && status !== "Semua") {
    params.push(status);
    kondisi.push(`"status" = $${params.length}`);
  }

  const where = kondisi.length ? `WHERE ${kondisi.join(" AND ")}` : "";
  const rows = await queryAll(`SELECT * FROM "PengajuanAnggaran" ${where} ORDER BY "createdAt" DESC`, params);

  res.json(rows.map((r) => ({
    ...r,
    totalAnggaran: Number(r.totalAnggaran),
    realisasiJumlah: r.realisasiJumlah ? Number(r.realisasiJumlah) : null,
  })));
}));

router.post("/anggaran", requireAuth, asyncHandler(async (req, res) => {
  const { namaKegiatan, unitPengaju, kategori, bulanRencana, totalAnggaran, rincian, catatan } = req.body || {};
  const nominal = Number(totalAnggaran);

  if (!namaKegiatan || !kategori || !bulanRencana || !nominal || nominal <= 0) {
    throw new CashlessError(400, "Nama kegiatan, kategori, bulan rencana, dan total anggaran wajib diisi.");
  }

  const id = uid();
  const tISO = todayISO();

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO "PengajuanAnggaran"
        ("id", "namaKegiatan", "unitPengaju", "kategori", "bulanRencana", "totalAnggaran", "status", "tanggalPengajuanISO", "diajukanOleh", "catatan")
       VALUES ($1, $2, $3, $4, $5, $6, 'Diajukan', $7, $8, $9)`,
      [id, namaKegiatan.trim(), unitPengaju || req.user.unit || null, kategori, bulanRencana, nominal, tISO, req.user.nama, catatan || null],
    );

    if (Array.isArray(rincian) && rincian.length) {
      for (const item of rincian) {
        const qty = Number(item.qty || 1);
        const hargaSatuan = Number(item.hargaSatuan || 0);
        await client.query(
          `INSERT INTO "RincianAnggaran" ("id", "pengajuanId", "uraian", "qty", "hargaSatuan", "subtotal")
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [uid(), id, item.uraian || "-", qty, hargaSatuan, qty * hargaSatuan],
        );
      }
    }
  });

  const row = await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1', [id]);
  res.status(201).json(row);
}));

router.post("/anggaran/:id/proses", requireAuth, requireAdministrasi, asyncHandler(async (req, res) => {
  const { disetujui, realisasiJumlah, catatan } = req.body || {};
  const id = req.params.id;

  const row = await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Pengajuan anggaran tidak ditemukan.");

  const statusBaru = disetujui ? "Disetujui" : "Ditolak";
  const realisasiVal = disetujui && realisasiJumlah !== undefined ? Number(realisasiJumlah) : null;

  await query(
    `UPDATE "PengajuanAnggaran"
     SET "status" = $1, "disetujuiOleh" = $2, "tanggalKeputusanISO" = $3, "realisasiJumlah" = $4, "catatan" = COALESCE($5, "catatan")
     WHERE "id" = $6`,
    [statusBaru, req.user.nama, todayISO(), realisasiVal, catatan || null, id],
  );

  const updated = await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1', [id]);
  res.json(updated);
}));

module.exports = router;
