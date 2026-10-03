const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("./db");
const { CashlessError, getSantriRow, todayISO } = require("./cashlessService");

const uid = () => crypto.randomUUID();
const JENIS_TAGIHAN = ["Syahriyah", "Uang Pangkal", "Seragam", "Kegiatan/Kitab", "Kesehatan", "Lainnya"];
const KATEGORI_CASHFLOW = ["Pembayaran Santri", "Infaq/Donasi", "Bantuan Pemerintah", "Operasional", "Gaji/Honor", "Konsumsi", "Perbaikan/Maintenance", "Lainnya"];
const STATUS_ANGGARAN = ["Diajukan", "Disetujui", "Ditolak", "Direalisasikan"];

function statusTagihan(tagihan) {
  return (tagihan.jumlahDibayar || 0) >= tagihan.jumlah ? "Lunas" : (tagihan.jumlahDibayar || 0) > 0 ? "Sebagian" : "Belum Lunas";
}

async function buatTagihan({ santriIds, jenis, jumlah, bulan, dicatatOleh }) {
  return withTransaction(async () => {
    if (!Array.isArray(santriIds) || !santriIds.length) throw new CashlessError(400, "Minimal satu santri tujuan tagihan wajib diisi.");
    if (!jenis || !jumlah || !bulan) throw new CashlessError(400, "Jenis, jumlah, dan bulan tagihan wajib diisi.");
    const dibuat = [];
    for (const santriId of santriIds) {
      await getSantriRow(santriId);
      const row = { id: uid(), santriId, jenis, jumlah: Number(jumlah), bulan, jumlahDibayar: 0, tanggalBayarISO: null, dicatatOleh: dicatatOleh || null };
      await query('INSERT INTO "Tagihan" ("id", "santriId", "jenis", "jumlah", "bulan", "jumlahDibayar", "tanggalBayarISO", "dicatatOleh") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [row.id, row.santriId, row.jenis, row.jumlah, row.bulan, row.jumlahDibayar, row.tanggalBayarISO, row.dicatatOleh]);
      dibuat.push(row);
    }
    return dibuat;
  });
}

const semuaTagihan = () => queryAll('SELECT * FROM "Tagihan" ORDER BY "createdAt" DESC');
const tagihanSantri = (santriId) => queryAll('SELECT * FROM "Tagihan" WHERE "santriId" = $1 ORDER BY "createdAt" DESC', [santriId]);

async function hapusTagihan(id) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "Tagihan" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Data tagihan tidak ditemukan.");
    await query('DELETE FROM "Tagihan" WHERE "id" = $1', [id]);
    return row;
  });
}

async function editTagihanNominal({ id, jumlah, jumlahDibayar }) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "Tagihan" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Data tagihan tidak ditemukan.");
    jumlah = Number(jumlah);
    jumlahDibayar = Number(jumlahDibayar);
    if (!jumlah || jumlahDibayar < 0) throw new CashlessError(400, "Jumlah tagihan/dibayar tidak valid.");
    const dibayarBaru = Math.min(jumlahDibayar, jumlah);
    await query('UPDATE "Tagihan" SET "jumlah" = $1, "jumlahDibayar" = $2 WHERE "id" = $3', [jumlah, dibayarBaru, id]);
    return queryOne('SELECT * FROM "Tagihan" WHERE "id" = $1', [id]);
  });
}

async function catatPembayaran({ tagihanId, jumlahBayar, dicatatOleh }) {
  return withTransaction(async () => {
    const tagihan = await queryOne('SELECT * FROM "Tagihan" WHERE "id" = $1 FOR UPDATE', [tagihanId]);
    if (!tagihan) throw new CashlessError(404, "Data tagihan tidak ditemukan.");
    jumlahBayar = Number(jumlahBayar);
    if (!jumlahBayar || jumlahBayar <= 0) throw new CashlessError(400, "Jumlah bayar harus lebih dari 0.");
    const dibayarBaru = Math.min(Number(tagihan.jumlah), (Number(tagihan.jumlahDibayar) || 0) + jumlahBayar);
    await query('UPDATE "Tagihan" SET "jumlahDibayar" = $1, "tanggalBayarISO" = $2 WHERE "id" = $3', [dibayarBaru, todayISO(), tagihanId]);
    const santri = await getSantriRow(tagihan.santriId);
    const cashflow = {
      id: uid(), bulan: tagihan.bulan, tanggalISO: todayISO(), jenis: "Masuk", kategori: "Pembayaran Santri",
      jumlah: jumlahBayar, keterangan: `Pembayaran ${tagihan.jenis} a.n. ${santri.nama}`, dicatatOleh: dicatatOleh || null,
    };
    await query('INSERT INTO "Cashflow" ("id", "bulan", "tanggalISO", "jenis", "kategori", "jumlah", "keterangan", "dicatatOleh") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [cashflow.id, cashflow.bulan, cashflow.tanggalISO, cashflow.jenis, cashflow.kategori, cashflow.jumlah, cashflow.keterangan, cashflow.dicatatOleh]);
    return { tagihan: await queryOne('SELECT * FROM "Tagihan" WHERE "id" = $1', [tagihanId]), cashflow };
  });
}

async function catatCashflow({ bulan, jenis, kategori, jumlah, keterangan, dicatatOleh }) {
  return withTransaction(async () => {
    if (!bulan || !jenis || !kategori || !jumlah) throw new CashlessError(400, "Bulan, jenis, kategori, dan jumlah wajib diisi.");
    if (!["Masuk", "Keluar"].includes(jenis)) throw new CashlessError(400, "Jenis cashflow harus Masuk atau Keluar.");
    if (!KATEGORI_CASHFLOW.includes(kategori)) throw new CashlessError(400, "Kategori cashflow tidak valid.");
    const row = { id: uid(), bulan, tanggalISO: todayISO(), jenis, kategori, jumlah: Number(jumlah), keterangan: keterangan || null, dicatatOleh: dicatatOleh || null };
    await query('INSERT INTO "Cashflow" ("id", "bulan", "tanggalISO", "jenis", "kategori", "jumlah", "keterangan", "dicatatOleh") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [row.id, row.bulan, row.tanggalISO, row.jenis, row.kategori, row.jumlah, row.keterangan, row.dicatatOleh]);
    return row;
  });
}
const semuaCashflow = () => queryAll('SELECT * FROM "Cashflow" ORDER BY "createdAt" DESC');

async function hapusCashflow(id) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "Cashflow" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Data cashflow tidak ditemukan.");
    await query('DELETE FROM "Cashflow" WHERE "id" = $1', [id]);
    return row;
  });
}

async function lampirkanRincian(pengajuan) {
  const rincian = await queryAll('SELECT "id", "uraian", "qty", "hargaSatuan", "subtotal" FROM "RincianAnggaran" WHERE "pengajuanId" = $1', [pengajuan.id]);
  return { ...pengajuan, rincian };
}

async function semuaPengajuan() {
  const rows = await queryAll('SELECT * FROM "PengajuanAnggaran" ORDER BY "createdAt" DESC');
  return Promise.all(rows.map(lampirkanRincian));
}

async function ajukanAnggaran({ namaKegiatan, unitPengaju, ketuaBagianNama, kategori, bulanRencana, catatan, rincian, diajukanOleh }) {
  return withTransaction(async () => {
    if (!namaKegiatan || !kategori || !bulanRencana) throw new CashlessError(400, "Nama kegiatan, kategori, dan bulan rencana wajib diisi.");
    if (!Array.isArray(rincian) || !rincian.length) throw new CashlessError(400, "Minimal satu baris rincian anggaran wajib diisi.");
    const rincianBersih = rincian.map((item) => {
      const qty = Number(item.qty), hargaSatuan = Number(item.hargaSatuan);
      if (!item.uraian || !qty || !hargaSatuan) throw new CashlessError(400, "Setiap baris rincian wajib punya uraian, jumlah, dan harga satuan.");
      return { id: uid(), uraian: item.uraian, qty, hargaSatuan, subtotal: qty * hargaSatuan };
    });
    const totalAnggaran = rincianBersih.reduce((total, item) => total + item.subtotal, 0);
    const row = {
      id: uid(), namaKegiatan, unitPengaju: unitPengaju || null, ketuaBagianNama: ketuaBagianNama || null,
      kategori, bulanRencana, catatan: catatan || null, totalAnggaran, status: "Diajukan",
      tanggalPengajuanISO: todayISO(), diajukanOleh: diajukanOleh || null,
      tanggalKeputusanISO: null, disetujuiOleh: null, pimpinanId: null, realisasiJumlah: null, realisasiTanggalISO: null,
    };
    await query(`INSERT INTO "PengajuanAnggaran" ("id", "namaKegiatan", "unitPengaju", "ketuaBagianNama", "kategori", "bulanRencana", "catatan", "totalAnggaran", "status", "tanggalPengajuanISO", "diajukanOleh", "tanggalKeputusanISO", "disetujuiOleh", "pimpinanId", "realisasiJumlah", "realisasiTanggalISO")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [row.id, row.namaKegiatan, row.unitPengaju, row.ketuaBagianNama, row.kategori, row.bulanRencana, row.catatan, row.totalAnggaran, row.status,
      row.tanggalPengajuanISO, row.diajukanOleh, row.tanggalKeputusanISO, row.disetujuiOleh, row.pimpinanId, row.realisasiJumlah, row.realisasiTanggalISO]);
    for (const item of rincianBersih) {
      await query('INSERT INTO "RincianAnggaran" ("id", "pengajuanId", "uraian", "qty", "hargaSatuan", "subtotal") VALUES ($1, $2, $3, $4, $5, $6)',
        [item.id, row.id, item.uraian, item.qty, item.hargaSatuan, item.subtotal]);
    }
    return lampirkanRincian(row);
  });
}

async function hapusPengajuan(id) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Data pengajuan anggaran tidak ditemukan.");
    if (!["Diajukan", "Ditolak"].includes(row.status)) throw new CashlessError(409, "Hanya pengajuan berstatus Diajukan atau Ditolak yang boleh dihapus.");
    await query('DELETE FROM "RincianAnggaran" WHERE "pengajuanId" = $1', [id]);
    await query('DELETE FROM "PengajuanAnggaran" WHERE "id" = $1', [id]);
    return row;
  });
}

async function setujuiAnggaran({ id, pimpinanId, disetujuiOleh }) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Data pengajuan anggaran tidak ditemukan.");
    if (row.status !== "Diajukan") throw new CashlessError(409, "Hanya pengajuan berstatus Diajukan yang bisa disetujui.");
    await query('UPDATE "PengajuanAnggaran" SET "status" = \'Disetujui\', "tanggalKeputusanISO" = $1, "disetujuiOleh" = $2, "pimpinanId" = $3 WHERE "id" = $4',
      [todayISO(), disetujuiOleh || null, pimpinanId || null, id]);
    return lampirkanRincian(await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1', [id]));
  });
}

async function tolakAnggaran({ id, disetujuiOleh }) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Data pengajuan anggaran tidak ditemukan.");
    if (row.status !== "Diajukan") throw new CashlessError(409, "Hanya pengajuan berstatus Diajukan yang bisa ditolak.");
    await query('UPDATE "PengajuanAnggaran" SET "status" = \'Ditolak\', "tanggalKeputusanISO" = $1, "disetujuiOleh" = $2 WHERE "id" = $3',
      [todayISO(), disetujuiOleh || null, id]);
    return lampirkanRincian(await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1', [id]));
  });
}

async function realisasikanAnggaran({ id, jumlahRealisasi, dicatatOleh }) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Data pengajuan anggaran tidak ditemukan.");
    if (row.status !== "Disetujui") throw new CashlessError(409, "Hanya pengajuan berstatus Disetujui yang bisa direalisasikan.");
    const jumlah = Number(jumlahRealisasi) || Number(row.totalAnggaran);
    if (!jumlah || jumlah <= 0) throw new CashlessError(400, "Jumlah realisasi tidak valid.");
    await query('UPDATE "PengajuanAnggaran" SET "status" = \'Direalisasikan\', "realisasiJumlah" = $1, "realisasiTanggalISO" = $2 WHERE "id" = $3',
      [jumlah, todayISO(), id]);
    const cashflow = {
      id: uid(), bulan: row.bulanRencana, tanggalISO: todayISO(), jenis: "Keluar", kategori: row.kategori,
      jumlah, keterangan: `Realisasi Anggaran: ${row.namaKegiatan}`, dicatatOleh: dicatatOleh || null,
    };
    await query('INSERT INTO "Cashflow" ("id", "bulan", "tanggalISO", "jenis", "kategori", "jumlah", "keterangan", "dicatatOleh") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [cashflow.id, cashflow.bulan, cashflow.tanggalISO, cashflow.jenis, cashflow.kategori, cashflow.jumlah, cashflow.keterangan, cashflow.dicatatOleh]);
    return { pengajuan: await lampirkanRincian(await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1', [id])), cashflow };
  });
}

module.exports = {
  JENIS_TAGIHAN, KATEGORI_CASHFLOW, STATUS_ANGGARAN, statusTagihan,
  buatTagihan, semuaTagihan, tagihanSantri, hapusTagihan, editTagihanNominal, catatPembayaran,
  catatCashflow, semuaCashflow, hapusCashflow,
  ajukanAnggaran, semuaPengajuan, hapusPengajuan, setujuiAnggaran, tolakAnggaran, realisasikanAnggaran,
};