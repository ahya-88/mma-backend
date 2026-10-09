const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("../db");
const { requireAuth, requireUnitUsaha, isSuperAdmin } = require("../auth");
const { CashlessError, getSantriRow, toPublicSantri, sisaLimitHarian } = require("../cashlessService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();

// GET /api/kartu - Status penerbitan kartu seluruh santri
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const rows = await queryAll(`
    SELECT "id", "nama", "nis", "kelas", "kartuTerbit", "kartuToken",
      ("pinHash" IS NOT NULL AND "pinHash" != '') AS "punyaPin"
    FROM "Santri" ORDER BY "nama"
  `);
  res.json(rows);
}));

// GET /api/kartu/kelola - Alias untuk kompatibilitas modul kelola kartu
router.get("/kelola", requireAuth, asyncHandler(async (req, res) => {
  const rows = await queryAll(`
    SELECT "id", "nama", "nis", "kelas", "kartuTerbit", "kartuToken",
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

// POST /api/kartu/:id/terbitkan - Terbitkan kartu dengan santriId di param URL
router.post("/:id/terbitkan", requireAuth, asyncHandler(async (req, res) => {
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

// POST /api/kartu/set-pin - Set or reset santri PIN (4-6 digit)
router.post("/set-pin", requireAuth, asyncHandler(async (req, res) => {
  const { santriId, pin } = req.body || {};
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

// POST /api/kartu/:id/pin - Set or reset santri PIN dengan santriId di param URL
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

// POST /api/kartu/resolve - Resolusi kartu untuk kasir Unit Usaha
router.post("/resolve", requireAuth, requireUnitUsaha, asyncHandler(async (req, res) => {
  const raw = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!raw) return res.status(400).json({ error: "Token kartu wajib diisi." });

  const kandidat = new Set();
  kandidat.add(raw);

  if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.includes("{") && raw.includes("}"))) {
    try {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start !== -1 && end > start) {
        const parsed = JSON.parse(raw.substring(start, end + 1));
        const keys = ["token", "nis", "nisn", "id", "santri_id", "santriId", "id_santri", "no_kartu", "noKartu", "card_id", "cardId", "code", "kode", "nomor", "uuid"];
        for (const k of keys) {
          if (parsed[k]) kandidat.add(String(parsed[k]).trim());
        }
      }
    } catch (_) {}
  }

  if (raw.includes("://") || raw.includes("?") || raw.includes("&")) {
    try {
      const match = raw.match(/(?:token|nis|id|santri_id|card|code|no)=([A-Za-z0-9_-]+)/i);
      if (match) kandidat.add(match[1].trim());
    } catch (_) {}
  }

  const prefixes = ["MMA1:", "MMA:", "BMT:", "BMT-", "KARTU:", "KARTU-", "CARD:", "CARD-", "SANTRI:", "SANTRI-", "NIS:", "NIS-", "ID:", "ID-"];
  for (const p of prefixes) {
    if (raw.toUpperCase().startsWith(p.toUpperCase())) {
      kandidat.add(raw.substring(p.length).trim());
    }
  }

  const tokenList = Array.from(kandidat).filter(Boolean);
  let santri = null;
  if (tokenList.length > 0) {
    santri = await queryOne(
      'SELECT * FROM "Santri" WHERE "kartuToken" = ANY($1) OR "id" = ANY($1) OR "nis" = ANY($1) OR "nisn" = ANY($1) LIMIT 1',
      [tokenList]
    );
  }

  if (!santri) return res.status(404).json({ error: "Kartu tidak dikenal." });

  const publik = await toPublicSantri(santri);
  res.json({
    id: publik.id, nis: publik.nis, nisn: publik.nisn, nama: publik.nama, kelas: publik.kelas,
    saldo: publik.saldo, limitJajanHarian: publik.limitJajanHarian,
    sisaLimitHariIni: await sisaLimitHarian(santri), blokir: publik.blokir, punyaPin: !!santri.pinHash,
  });
}));

module.exports = router;

