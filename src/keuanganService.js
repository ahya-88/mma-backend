const crypto = require("crypto");
const { query, queryOne, queryAll } = require("./db");
const { CashlessError } = require("./cashlessService");
const { recordAudit } = require("./auditLog");

const uid = () => crypto.randomUUID();
const todayISO = () => new Date().toISOString().slice(0, 10);

const JENIS_TRANSAKSI_UNIT = ["Dana Masuk", "Dana Keluar", "Transfer Antar Bagian"];
const KATEGORI_CASHFLOW = [
  "Unit Usaha - Dana Masuk",
  "Unit Usaha - Dana Keluar",
  "Unit Usaha - Transfer Antar Bagian",
  "Pembayaran Santri",
  "Infaq/Donasi",
  "Operasional",
];

// Transaksi Unit Usaha
async function semuaTransaksiUnitUsaha({ unit } = {}) {
  const kondisi = [];
  const params = [];
  if (unit && unit !== "Semua") {
    params.push(unit);
    kondisi.push(`("unitAsal" = $1 OR "unitTujuan" = $1)`);
  }
  const where = kondisi.length ? `WHERE ${kondisi.join(" AND ")}` : "";
  return queryAll(`SELECT * FROM "TransaksiUnitUsaha" ${where} ORDER BY "createdAt" DESC`, params);
}

async function catatTransaksiUnitUsaha({ jenis, unitAsal, unitTujuan, jumlah, keterangan, dicatatOleh }) {
  const nominal = Number(jumlah);
  if (!jenis || !nominal || nominal <= 0) {
    throw new CashlessError(400, "Jenis dan jumlah transaksi unit usaha wajib diisi.");
  }
  const id = uid();
  const tISO = todayISO();
  const bln = tISO.slice(0, 7);

  await query(
    `INSERT INTO "TransaksiUnitUsaha"
      ("id", "jenis", "unitAsal", "unitTujuan", "jumlah", "keterangan", "dicatatOleh", "tanggalISO", "bulan")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, jenis, unitAsal || null, unitTujuan || null, nominal, keterangan || null, dicatatOleh || null, tISO, bln],
  );

  return queryOne('SELECT * FROM "TransaksiUnitUsaha" WHERE "id" = $1', [id]);
}

async function hapusTransaksiUnitUsaha(id, actorId) {
  const row = await queryOne('SELECT * FROM "TransaksiUnitUsaha" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Transaksi unit usaha tidak ditemukan.");
  await query('DELETE FROM "TransaksiUnitUsaha" WHERE "id" = $1', [id]);
  await recordAudit({ actorId, actorRole: "guru", action: "keuangan.transaksi_unit_deleted", targetType: "TransaksiUnitUsaha", targetId: id });
  return { id, deleted: true };
}

async function laporanCashflowUnitUsaha({ unit } = {}) {
  const k = unit && unit !== "Semua" ? unit : null;
  const sql = k
    ? `SELECT "jenis", COALESCE(SUM("jumlah"), 0) AS "total" FROM "TransaksiUnitUsaha" WHERE "unitAsal" = $1 OR "unitTujuan" = $1 GROUP BY "jenis"`
    : `SELECT "jenis", COALESCE(SUM("jumlah"), 0) AS "total" FROM "TransaksiUnitUsaha" GROUP BY "jenis"`;
  const params = k ? [k] : [];

  const rows = await queryAll(sql, params);
  const ringkasan = Object.fromEntries(rows.map((r) => [r.jenis, Number(r.total)]));

  return {
    unit: k || "Semua",
    ringkasan: {
      Masuk: ringkasan["Dana Masuk"] || 0,
      Keluar: ringkasan["Dana Keluar"] || 0,
      Transfer: ringkasan["Transfer Antar Bagian"] || 0,
      Neto: (ringkasan["Dana Masuk"] || 0) - (ringkasan["Dana Keluar"] || 0),
    },
  };
}

module.exports = {
  JENIS_TRANSAKSI_UNIT,
  KATEGORI_CASHFLOW,
  semuaTransaksiUnitUsaha,
  catatTransaksiUnitUsaha,
  hapusTransaksiUnitUsaha,
  laporanCashflowUnitUsaha,
};
