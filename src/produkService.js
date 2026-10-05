const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("./db");
const { CashlessError } = require("./cashlessService");
const { recordAudit } = require("./auditLog");

const uid = () => crypto.randomUUID();
const semuaProdukUnit = (unit) => queryAll('SELECT * FROM "ProdukUnitUsaha" WHERE "unit" = $1 ORDER BY "kategori", "nama"', [unit]);
const semuaProdukSemuaUnit = () => queryAll('SELECT * FROM "ProdukUnitUsaha" ORDER BY "unit", "kategori", "nama"');

async function assertBarcodeTersedia(unit, barcode, kecualiId) {
  if (!barcode) return;
  const ada = await queryOne('SELECT "id" FROM "ProdukUnitUsaha" WHERE "unit" = $1 AND "barcode" = $2 AND "id" != $3', [unit, barcode, kecualiId || ""]);
  if (ada) throw new CashlessError(409, "Barcode itu sudah dipakai produk lain di unit ini.");
}

async function tambahProduk({ unit, nama, harga, kategori, barcode }) {
  return withTransaction(async () => {
    if (!unit || !nama || harga == null) throw new CashlessError(400, "Unit, nama, dan harga wajib diisi.");
    if (!Number.isFinite(Number(harga)) || Number(harga) < 0) throw new CashlessError(400, "Harga tidak valid.");
    await assertBarcodeTersedia(unit, barcode || null);
    const row = { id: uid(), unit, nama, harga: Math.round(Number(harga)), kategori: kategori || null, barcode: barcode || null, aktif: 1 };
    await query('INSERT INTO "ProdukUnitUsaha" ("id", "unit", "nama", "harga", "kategori", "barcode", "aktif") VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [row.id, row.unit, row.nama, row.harga, row.kategori, row.barcode, row.aktif]);
    return queryOne('SELECT * FROM "ProdukUnitUsaha" WHERE "id" = $1', [row.id]);
  });
}

async function editProduk({ id, unit, nama, harga, kategori, barcode, aktif }) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "ProdukUnitUsaha" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Produk tidak ditemukan.");
    if (unit && unit !== row.unit) throw new CashlessError(403, "Tidak boleh memindahkan produk ke unit lain.");
    const hargaBaru = harga != null ? Number(harga) : Number(row.harga);
    if (!Number.isFinite(hargaBaru) || hargaBaru < 0) throw new CashlessError(400, "Harga tidak valid.");
    const barcodeBaru = barcode !== undefined ? (barcode || null) : row.barcode;
    if (barcodeBaru !== row.barcode) await assertBarcodeTersedia(row.unit, barcodeBaru, id);
    await query(`UPDATE "ProdukUnitUsaha" SET "nama" = $1, "harga" = $2, "kategori" = $3, "barcode" = $4, "aktif" = $5,
      "updatedAt" = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE "id" = $6`,
    [nama || row.nama, Math.round(hargaBaru), kategori !== undefined ? (kategori || null) : row.kategori, barcodeBaru,
      aktif != null ? (aktif ? 1 : 0) : row.aktif, id]);
    return queryOne('SELECT * FROM "ProdukUnitUsaha" WHERE "id" = $1', [id]);
  });
}

async function hapusProduk(id, actorId) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "ProdukUnitUsaha" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Produk tidak ditemukan.");
    await query('DELETE FROM "ProdukUnitUsaha" WHERE "id" = $1', [id]);
    await recordAudit({ actorId, actorRole: "guru", action: "data.product_deleted", targetType: "ProdukUnitUsaha", targetId: id });
    return { ok: true };
  });
}

async function cariByBarcode(unit, barcode) {
  const row = await queryOne('SELECT * FROM "ProdukUnitUsaha" WHERE "unit" = $1 AND "barcode" = $2 AND "aktif" = 1', [unit, barcode]);
  if (!row) throw new CashlessError(404, "Produk dengan barcode itu tidak ditemukan di unit ini.");
  return row;
}

async function stokOpname({ id, unit, stokFisik, alasan, catatan, petugasNama }) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "ProdukUnitUsaha" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Produk tidak ditemukan.");
    if (unit && unit !== row.unit) throw new CashlessError(403, "Produk ini milik unit usaha lain.");

    const fisik = Number(stokFisik);
    if (!Number.isInteger(fisik) || fisik < 0) {
      throw new CashlessError(400, "Jumlah stok fisik harus angka bulat >= 0.");
    }
    if (!alasan || !alasan.trim()) {
      throw new CashlessError(400, "Alasan penyesuaian stok opname wajib diisi.");
    }

    const stokSebelum = Number(row.stok || 0);
    const selisih = fisik - stokSebelum;

    await query(`UPDATE "ProdukUnitUsaha" SET "stok" = $1,
      "updatedAt" = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      WHERE "id" = $2`, [fisik, id]);

    const logId = uid();
    await query(`INSERT INTO "RiwayatStokOpname"
      ("id", "produkId", "unit", "stokSebelum", "stokFisik", "selisih", "alasan", "catatan", "petugasNama")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [logId, id, row.unit, stokSebelum, fisik, selisih, alasan.trim(), catatan ? catatan.trim() : null, petugasNama || "Staf"]);

    const produkUpdated = await queryOne('SELECT * FROM "ProdukUnitUsaha" WHERE "id" = $1', [id]);
    return {
      ok: true,
      logId,
      stokSebelum,
      stokFisik: fisik,
      selisih,
      alasan: alasan.trim(),
      produk: produkUpdated,
    };
  });
}

async function riwayatStokOpnameUnit(unit) {
  return queryAll(`SELECT r.*, p."nama" AS "namaProduk", p."kategori", p."barcode"
    FROM "RiwayatStokOpname" r
    LEFT JOIN "ProdukUnitUsaha" p ON r."produkId" = p."id"
    WHERE r."unit" = $1
    ORDER BY r."createdAt" DESC LIMIT 100`, [unit]);
}

module.exports = {
  semuaProdukUnit,
  semuaProdukSemuaUnit,
  tambahProduk,
  editProduk,
  hapusProduk,
  cariByBarcode,
  stokOpname,
  riwayatStokOpnameUnit,
};