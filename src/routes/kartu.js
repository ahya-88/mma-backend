const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("../db");
const { requireAuth, isSuperAdmin } = require("../auth");
const { CashlessError, getSantriRow, toPublicSantri } = require("../cashlessService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();

// GET /api/kartu - Status penerbitan kartu seluruh santri
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const rows = await queryAll(`
    SELECT "id", "nama", "nis", "kelas", "kartuTerbit",
      ("pinHash" IS NOT NULL AND "pinHash" != '') AS "punyaPin"
    FROM "Santri" ORDER BY "nama"
  `);
  res.json(rows);
}));

// POST /api/kartu/terbitkan - Terbitkan kartu baru
router.post("/terbitkan", requireAuth, asyncHandler(async (req, res) => {
  const { santriId, kartuToken } = req.body || {};
  if (!santriId) throw new CashlessError(400, "santriId wajib diisi.");

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

// POST /api/kartu/set-pin - Set or reset santri PIN
router.post("/set-pin", requireAuth, asyncHandler(async (req, res) => {
  const { santriId, pin } = req.body || {};
  if (!santriId || typeof pin !== "string" || !/^\d{6}$/.test(pin.trim())) {
    throw new CashlessError(400, "PIN harus berupa 6 digit angka.");
  }

  const hash = await bcrypt.hash(pin.trim(), 10);
  await query(
    `UPDATE "Santri" SET "pinHash" = $1, "pinGagal" = 0, "pinKunciSampai" = NULL WHERE "id" = $2`,
    [hash, santriId],
  );

  res.json({ santriId, pinSet: true, pesan: "PIN santri berhasil disimpan." });
}));

module.exports = router;
