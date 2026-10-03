const express = require("express");
const QRCode = require("qrcode");
const { queryAll, queryOne, withTransaction } = require("../db");
const { requireAuth, requireBMT, requireUnitUsaha } = require("../auth");
const { sisaLimitHarian, toPublicSantri, CashlessError } = require("../cashlessService");
const { terbitkanKartu } = require("../pinService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

router.get("/kelola", requireAuth, requireBMT, asyncHandler(async (req, res) => {
  const santri = await queryAll('SELECT "id", "nama", "kelas", "nis", "kartuToken", "kartuTerbit", "pinHash" FROM "Santri" ORDER BY "nama"');
  const cards = await Promise.all(santri.map(async (row) => ({
    id: row.id,
    nama: row.nama,
    kelas: row.kelas || "",
    nis: row.nis || "",
    kartuTerbit: row.kartuTerbit,
    punyaPin: !!row.pinHash,
    qr: row.kartuToken ? await QRCode.toDataURL(`MMA1:${row.kartuToken}`, { width: 220, margin: 1, errorCorrectionLevel: "M" }) : null,
  })));
  res.set("Cache-Control", "no-store").json(cards);
}));

router.post("/resolve", asyncHandler(async (req, res) => {
  const raw = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!raw) return res.status(400).json({ error: "Token kartu wajib diisi." });

  const kandidat = new Set();
  kandidat.add(raw);

  // 1. Ekstrak JSON BMT
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

  // 2. Ekstrak URL Query Parameters
  if (raw.includes("://") || raw.includes("?") || raw.includes("&")) {
    try {
      const match = raw.match(/(?:token|nis|id|santri_id|card|code|no)=([A-Za-z0-9_-]+)/i);
      if (match) kandidat.add(match[1].trim());
    } catch (_) {}
  }

  // 3. Ekstrak Prefix BMT
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

router.get("/cetak", requireAuth, requireBMT, asyncHandler(async (req, res) => {
  await withTransaction(async () => {
    const rows = await queryAll('SELECT "id" FROM "Santri" WHERE "kartuToken" IS NULL OR "kartuToken" = \'\'');
    for (const santri of rows) await terbitkanKartu(santri.id);
  });

  const santri = await queryAll('SELECT "nama", "kelas", "nis", "kartuToken" FROM "Santri" ORDER BY "nama"');
  const cards = await Promise.all(santri.map(async (row) => {
    const qr = await QRCode.toString(`MMA1:${row.kartuToken}`, { type: "svg", width: 180, margin: 1, errorCorrectionLevel: "M" });
    return `<article class="card"><div class="identity"><strong>${escapeHtml(row.nama)}</strong><span>${escapeHtml(row.kelas || "-")}</span><span>NIS ${escapeHtml(row.nis || "-")}</span></div><div class="qr">${qr}</div></article>`;
  }));
  res.set("Cache-Control", "no-store").type("html").send(`<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Kartu Santri</title><style>
@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;color:#13251d}.sheet{display:grid;grid-template-columns:repeat(2,85.6mm);gap:4mm;align-content:start}.card{width:85.6mm;height:53.98mm;border:1px solid #75877d;border-radius:2mm;padding:5mm;display:flex;align-items:center;justify-content:space-between;break-inside:avoid}.identity{display:flex;flex-direction:column;gap:2mm;max-width:49mm}.identity strong{font-size:15pt;overflow-wrap:anywhere}.identity span{font-size:10pt}.qr{width:36mm;height:36mm;flex:none}.qr svg{width:100%;height:100%}@media screen{body{padding:12mm;background:#e8ede9}.card{background:white;box-shadow:0 1mm 3mm #13251d22}}@media print{.card{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><main class="sheet">${cards.join("")}</main></body></html>`);
}));

module.exports = router;