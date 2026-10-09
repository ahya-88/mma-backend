const express = require("express");
const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("../db");
const { requireAuth, requireUnitUsaha, isSuperAdmin } = require("../auth");
const { ubahStatusProduk } = require("../adminService");
const { CashlessError } = require("../cashlessService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();
const uid = () => crypto.randomUUID();
const todayISO = () => new Date().toISOString().slice(0, 10);

function isAuthorizedProductManager(req) {
  if (isSuperAdmin(req.user)) return true;
  return req.user?.role === "guru" && req.user.departemen === "unitusaha";
}

// GET /api/produk/saya - List produk unit staf kasir yang login
router.get("/saya", requireAuth, asyncHandler(async (req, res) => {
  const unit = req.user?.unit || "Kantin";
  const rows = await queryAll(`SELECT * FROM "ProdukUnitUsaha" WHERE "unit" = $1 ORDER BY "nama"`, [unit]);
  res.json(rows.map((r) => ({
    ...r,
    harga: Number(r.harga),
    stok: Number(r.stok || 0),
    aktif: r.aktif === 1 || r.aktif === true,
  })));
}));

// GET /api/produk/saya/barcode/:kode - Lookup barcode unit sendiri
router.get("/saya/barcode/:kode", requireAuth, asyncHandler(async (req, res) => {
  const unit = req.user?.unit || "Kantin";
  const kode = req.params.kode;
  const row = await queryOne(`SELECT * FROM "ProdukUnitUsaha" WHERE "barcode" = $1 AND "unit" = $2 LIMIT 1`, [kode, unit]);
  if (!row) {
    throw new CashlessError(404, `Produk dengan barcode '${kode}' tidak ditemukan.`);
  }
  res.json({
    ...row,
    harga: Number(row.harga),
    stok: Number(row.stok || 0),
    aktif: row.aktif === 1 || row.aktif === true,
  });
}));

// GET /api/produk/barcode/:kode - Lookup barcode global
router.get("/barcode/:kode", requireAuth, asyncHandler(async (req, res) => {
  const kode = req.params.kode;
  const row = await queryOne(`SELECT * FROM "ProdukUnitUsaha" WHERE "barcode" = $1 LIMIT 1`, [kode]);
  if (!row) {
    throw new CashlessError(404, `Produk dengan barcode '${kode}' tidak ditemukan.`);
  }
  res.json({
    ...row,
    harga: Number(row.harga),
    stok: Number(row.stok || 0),
    aktif: row.aktif === 1 || row.aktif === true,
  });
}));

// GET /api/produk/stok-opname/riwayat - Riwayat stok opname unit
router.get("/stok-opname/riwayat", requireAuth, asyncHandler(async (req, res) => {
  const unit = req.user?.unit;
  const where = unit && !isSuperAdmin(req.user) ? `WHERE "unit" = $1` : "";
  const params = unit && !isSuperAdmin(req.user) ? [unit] : [];
  const rows = await queryAll(`SELECT * FROM "RiwayatStokOpname" ${where} ORDER BY "createdAt" DESC LIMIT 100`, params);
  res.json(rows);
}));

// GET /api/produk - List produk
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const unit = req.query.unit || (req.user?.unit !== undefined ? req.user.unit : null);
  const hanyaAktif = req.query.hanyaAktif !== "false" && !isSuperAdmin(req.user);

  const kondisi = [];
  const params = [];

  if (unit && unit !== "Semua") {
    params.push(unit);
    kondisi.push(`"unit" = $${params.length}`);
  }

  if (hanyaAktif) {
    kondisi.push(`"aktif" = 1`);
  }

  const where = kondisi.length ? `WHERE ${kondisi.join(" AND ")}` : "";
  const rows = await queryAll(`SELECT * FROM "ProdukUnitUsaha" ${where} ORDER BY "unit", "nama"`, params);

  res.json(rows.map((r) => ({
    ...r,
    harga: Number(r.harga),
    stok: Number(r.stok || 0),
    aktif: r.aktif === 1 || r.aktif === true,
  })));
}));

// POST /api/produk - Tambah produk
router.post("/", requireAuth, asyncHandler(async (req, res) => {
  if (!isAuthorizedProductManager(req)) {
    return res.status(403).json({ error: "Hanya staf Unit Usaha atau Superadmin yang dapat mengelola produk." });
  }

  const { unit, nama, harga, kategori, barcode, stok } = req.body || {};
  const selectedUnit = unit || req.user.unit || "Kantin";
  const nominalHarga = Number(harga);

  if (!nama || !nama.trim() || !nominalHarga || nominalHarga <= 0) {
    throw new CashlessError(400, "Nama produk dan harga valid wajib diisi.");
  }

  const id = uid();
  const stokVal = Number(stok || 0);

  await query(
    `INSERT INTO "ProdukUnitUsaha" ("id", "unit", "nama", "harga", "kategori", "barcode", "stok", "aktif")
     VALUES ($1, $2, $3, $4, $5, $6, $7, 1)`,
    [id, selectedUnit, nama.trim(), nominalHarga, kategori || null, barcode || null, stokVal],
  );

  const row = await queryOne('SELECT * FROM "ProdukUnitUsaha" WHERE "id" = $1', [id]);
  res.status(201).json({ ...row, harga: Number(row.harga), aktif: true });
}));

// Helper eksekusi stok opname
async function eksekusiStokOpname({ produkId, stokFisik, alasan, catatan, user }) {
  const fis = Number(stokFisik);
  if (!produkId || Number.isNaN(fis) || fis < 0 || !alasan) {
    throw new CashlessError(400, "produkId, stokFisik valid, dan alasan wajib diisi.");
  }

  return withTransaction(async (client) => {
    const prodRes = await client.query('SELECT * FROM "ProdukUnitUsaha" WHERE "id" = $1 FOR UPDATE', [produkId]);
    if (!prodRes.rowCount) throw new CashlessError(404, "Produk tidak ditemukan.");

    const p = prodRes.rows[0];
    const stokSebelum = Number(p.stok || 0);
    const selisih = fis - stokSebelum;

    await client.query('UPDATE "ProdukUnitUsaha" SET "stok" = $1 WHERE "id" = $2', [fis, produkId]);

    const opnameId = uid();
    await client.query(
      `INSERT INTO "RiwayatStokOpname"
        ("id", "produkId", "unit", "stokSebelum", "stokFisik", "selisih", "alasan", "catatan", "petugasNama")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [opnameId, produkId, p.unit, stokSebelum, fis, selisih, alasan, catatan || null, user.nama],
    );

    return { id: opnameId, produkId, unit: p.unit, stokSebelum, stokFisik: fis, selisih, alasan };
  });
}

// POST /api/produk/:id/stok-opname - Catat stok opname via URL param id
router.post("/:id/stok-opname", requireAuth, asyncHandler(async (req, res) => {
  if (!isAuthorizedProductManager(req)) {
    return res.status(403).json({ error: "Akses ditolak." });
  }
  const { stokFisik, alasan, catatan } = req.body || {};
  const result = await eksekusiStokOpname({ produkId: req.params.id, stokFisik, alasan, catatan, user: req.user });
  res.status(201).json(result);
}));

// POST /api/produk/stok-opname - Catat stok opname via body produkId
router.post("/stok-opname", requireAuth, asyncHandler(async (req, res) => {
  if (!isAuthorizedProductManager(req)) {
    return res.status(403).json({ error: "Akses ditolak." });
  }
  const { produkId, stokFisik, alasan, catatan } = req.body || {};
  const result = await eksekusiStokOpname({ produkId, stokFisik, alasan, catatan, user: req.user });
  res.status(201).json(result);
}));

// PUT /api/produk/:id - Edit produk
router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  if (!isAuthorizedProductManager(req)) {
    return res.status(403).json({ error: "Hanya staf Unit Usaha atau Superadmin yang dapat mengedit produk." });
  }

  const id = req.params.id;
  const { nama, harga, kategori, barcode, stok, aktif } = req.body || {};

  const existing = await queryOne('SELECT * FROM "ProdukUnitUsaha" WHERE "id" = $1', [id]);
  if (!existing) throw new CashlessError(404, "Produk tidak ditemukan.");

  const namaFinal = nama !== undefined ? nama.trim() : existing.nama;
  const hargaFinal = harga !== undefined ? Number(harga) : Number(existing.harga);
  const kategoriFinal = kategori !== undefined ? kategori : existing.kategori;
  const barcodeFinal = barcode !== undefined ? barcode : existing.barcode;
  const stokFinal = stok !== undefined ? Number(stok) : Number(existing.stok || 0);
  const aktifFinal = aktif !== undefined ? (aktif ? 1 : 0) : existing.aktif;

  await query(
    `UPDATE "ProdukUnitUsaha"
     SET "nama" = $1, "harga" = $2, "kategori" = $3, "barcode" = $4, "stok" = $5, "aktif" = $6,
         "updatedAt" = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
     WHERE "id" = $7`,
    [namaFinal, hargaFinal, kategoriFinal, barcodeFinal, stokFinal, aktifFinal, id],
  );

  const updated = await queryOne('SELECT * FROM "ProdukUnitUsaha" WHERE "id" = $1', [id]);
  res.json({ ...updated, harga: Number(updated.harga), aktif: updated.aktif === 1 });
}));

// DELETE /api/produk/:id - Hapus produk
router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  if (!isAuthorizedProductManager(req)) {
    return res.status(403).json({ error: "Hanya staf Unit Usaha atau Superadmin yang dapat menghapus produk." });
  }
  const id = req.params.id;
  const existing = await queryOne('SELECT * FROM "ProdukUnitUsaha" WHERE "id" = $1', [id]);
  if (!existing) throw new CashlessError(404, "Produk tidak ditemukan.");

  await query('DELETE FROM "ProdukUnitUsaha" WHERE "id" = $1', [id]);
  res.json({ success: true, message: `Produk '${existing.nama}' berhasil dihapus.` });
}));

// PATCH /api/produk/:id/status - Aktifkan/nonaktifkan produk
router.patch("/:id/status", requireAuth, asyncHandler(async (req, res) => {
  if (!isAuthorizedProductManager(req)) {
    return res.status(403).json({ error: "Hanya staf Unit Usaha atau Superadmin yang dapat merubah status produk." });
  }

  const { aktif } = req.body || {};
  res.json(await ubahStatusProduk({ id: req.params.id, aktif: !!aktif }));
}));

module.exports = router;
