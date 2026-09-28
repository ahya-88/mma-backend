const crypto = require("crypto");
const db = require("./db");
const { CashlessError } = require("./cashlessService");

const uid = () => crypto.randomUUID();

function semuaProdukUnit(unit) {
  return db.prepare("SELECT * FROM ProdukUnitUsaha WHERE unit = ? ORDER BY kategori, nama").all(unit);
}

// Dipakai Admin untuk melihat seluruh katalog lintas unit (mis. rekap/laporan).
function semuaProdukSemuaUnit() {
  return db.prepare("SELECT * FROM ProdukUnitUsaha ORDER BY unit, kategori, nama").all();
}

function assertBarcodeTersedia(unit, barcode, kecualiId) {
  if (!barcode) return;
  const ada = db
    .prepare("SELECT id FROM ProdukUnitUsaha WHERE unit = ? AND barcode = ? AND id != ?")
    .get(unit, barcode, kecualiId || "");
  if (ada) throw new CashlessError(409, "Barcode itu sudah dipakai produk lain di unit ini.");
}

const tambahProduk = db.transaction(({ unit, nama, harga, kategori, barcode }) => {
  if (!unit || !nama || harga == null) throw new CashlessError(400, "Unit, nama, dan harga wajib diisi.");
  if (!Number.isFinite(Number(harga)) || Number(harga) < 0) throw new CashlessError(400, "Harga tidak valid.");
  assertBarcodeTersedia(unit, barcode || null);
  const row = {
    id: uid(), unit, nama, harga: Math.round(Number(harga)),
    kategori: kategori || null, barcode: barcode || null, aktif: 1,
  };
  db.prepare(
    `INSERT INTO ProdukUnitUsaha (id, unit, nama, harga, kategori, barcode, aktif)
     VALUES (@id, @unit, @nama, @harga, @kategori, @barcode, @aktif)`
  ).run(row);
  return db.prepare("SELECT * FROM ProdukUnitUsaha WHERE id = ?").get(row.id);
});

// `unit` request TIDAK boleh dipakai untuk memindahkan produk ke unit lain — dikunci ke unit
// pemilik asli, supaya staf satu unit tidak bisa mengedit/mengklaim produk unit lain lewat body.
const editProduk = db.transaction(({ id, unit, nama, harga, kategori, barcode, aktif }) => {
  const row = db.prepare("SELECT * FROM ProdukUnitUsaha WHERE id = ?").get(id);
  if (!row) throw new CashlessError(404, "Produk tidak ditemukan.");
  if (unit && unit !== row.unit) throw new CashlessError(403, "Tidak boleh memindahkan produk ke unit lain.");
  const hargaBaru = harga != null ? Number(harga) : row.harga;
  if (!Number.isFinite(hargaBaru) || hargaBaru < 0) throw new CashlessError(400, "Harga tidak valid.");
  const barcodeBaru = barcode !== undefined ? (barcode || null) : row.barcode;
  if (barcodeBaru !== row.barcode) assertBarcodeTersedia(row.unit, barcodeBaru, id);
  db.prepare(
    `UPDATE ProdukUnitUsaha SET nama = @nama, harga = @harga, kategori = @kategori,
       barcode = @barcode, aktif = @aktif, updatedAt = datetime('now') WHERE id = @id`
  ).run({
    id,
    nama: nama || row.nama,
    harga: Math.round(hargaBaru),
    kategori: kategori !== undefined ? (kategori || null) : row.kategori,
    barcode: barcodeBaru,
    aktif: aktif != null ? (aktif ? 1 : 0) : row.aktif,
  });
  return db.prepare("SELECT * FROM ProdukUnitUsaha WHERE id = ?").get(id);
});

function hapusProduk(id) {
  const row = db.prepare("SELECT * FROM ProdukUnitUsaha WHERE id = ?").get(id);
  if (!row) throw new CashlessError(404, "Produk tidak ditemukan.");
  db.prepare("DELETE FROM ProdukUnitUsaha WHERE id = ?").run(id);
  return { ok: true };
}

// Untuk pemindai barcode fisik (mode keyboard wedge) di layar kasir Kopel: cari 1 produk aktif
// berdasarkan kode yang diketik alat scanner + Enter.
function cariByBarcode(unit, barcode) {
  const row = db
    .prepare("SELECT * FROM ProdukUnitUsaha WHERE unit = ? AND barcode = ? AND aktif = 1")
    .get(unit, barcode);
  if (!row) throw new CashlessError(404, "Produk dengan barcode itu tidak ditemukan di unit ini.");
  return row;
}

module.exports = { semuaProdukUnit, semuaProdukSemuaUnit, tambahProduk, editProduk, hapusProduk, cariByBarcode };
