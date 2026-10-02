const express = require("express");
const QRCode = require("qrcode");
const db = require("../db");
const { requireAuth, requireBMT, requireUnitUsaha } = require("../auth");
const { sisaLimitHarian, toPublicSantri, CashlessError } = require("../cashlessService");
const { terbitkanKartu } = require("../pinService");

const router = express.Router();

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

router.get("/kelola", requireAuth, requireBMT, async (req, res, next) => {
  try {
    const santri = db.prepare("SELECT id, nama, kelas, nis, kartuToken, kartuTerbit, pinHash FROM Santri ORDER BY nama").all();
    const cards = await Promise.all(santri.map(async (row) => ({
      id: row.id,
      nama: row.nama,
      kelas: row.kelas || "",
      nis: row.nis || "",
      kartuTerbit: row.kartuTerbit,
      punyaPin: !!row.pinHash,
      qr: row.kartuToken ? await QRCode.toDataURL(`MMA1:${row.kartuToken}`, {
        width: 220, margin: 1, errorCorrectionLevel: "M",
      }) : null,
    })));
    res.set("Cache-Control", "no-store").json(cards);
  } catch (e) { next(e); }
});

router.post("/resolve", requireAuth, requireUnitUsaha, (req, res, next) => {
  try {
    const qr = typeof req.body?.token === "string" ? req.body.token : "";
    const match = qr.match(/^MMA1:([A-Za-z0-9_-]{22})$/);
    const santri = match ? db.prepare("SELECT * FROM Santri WHERE kartuToken = ?").get(match[1]) : null;
    if (!santri) return res.status(404).json({ error: "Kartu tidak dikenal." });

    const publik = toPublicSantri(santri);
    res.json({
      id: publik.id,
      nis: publik.nis,
      nisn: publik.nisn,
      nama: publik.nama,
      kelas: publik.kelas,
      saldo: publik.saldo,
      limitJajanHarian: publik.limitJajanHarian,
      sisaLimitHariIni: sisaLimitHarian(santri),
      blokir: publik.blokir,
      punyaPin: !!santri.pinHash,
    });
  } catch (e) { next(e); }
});

router.get("/cetak", requireAuth, requireBMT, async (req, res, next) => {
  try {
    db.transaction(() => {
      const rows = db.prepare("SELECT id FROM Santri WHERE kartuToken IS NULL OR kartuToken = ''").all();
      for (const santri of rows) terbitkanKartu(santri.id);
    })();

    const santri = db.prepare("SELECT nama, kelas, nis, kartuToken FROM Santri ORDER BY nama").all();
    const cards = await Promise.all(santri.map(async (row) => {
      const qr = await QRCode.toString(`MMA1:${row.kartuToken}`, {
        type: "svg", width: 180, margin: 1, errorCorrectionLevel: "M",
      });
      return `<article class="card"><div class="identity"><strong>${escapeHtml(row.nama)}</strong><span>${escapeHtml(row.kelas || "-")}</span><span>NIS ${escapeHtml(row.nis || "-")}</span></div><div class="qr">${qr}</div></article>`;
    }));

    res.set("Cache-Control", "no-store").type("html").send(`<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Kartu Santri</title><style>
@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;color:#13251d}.sheet{display:grid;grid-template-columns:repeat(2,85.6mm);gap:4mm;align-content:start}.card{width:85.6mm;height:53.98mm;border:1px solid #75877d;border-radius:2mm;padding:5mm;display:flex;align-items:center;justify-content:space-between;break-inside:avoid}.identity{display:flex;flex-direction:column;gap:2mm;max-width:49mm}.identity strong{font-size:15pt;overflow-wrap:anywhere}.identity span{font-size:10pt}.qr{width:36mm;height:36mm;flex:none}.qr svg{width:100%;height:100%}@media screen{body{padding:12mm;background:#e8ede9}.card{background:white;box-shadow:0 1mm 3mm #13251d22}}@media print{.card{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><main class="sheet">${cards.join("")}</main></body></html>`);
  } catch (e) { next(e); }
});

module.exports = router;