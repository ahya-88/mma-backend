const crypto = require("crypto");
const db = require("./db");
const { CashlessError, getSantriRow, todayISO, todayLabel } = require("./cashlessService");

const uid = () => crypto.randomUUID();
const JENIS_TAGIHAN = ["Syahriyah", "Uang Pangkal", "Seragam", "Kegiatan/Kitab", "Kesehatan", "Lainnya"];
const KATEGORI_CASHFLOW = ["Pembayaran Santri", "Infaq/Donasi", "Bantuan Pemerintah", "Operasional", "Gaji/Honor", "Konsumsi", "Perbaikan/Maintenance", "Lainnya"];

function statusTagihan(t) {
  return (t.jumlahDibayar || 0) >= t.jumlah ? "Lunas" : (t.jumlahDibayar || 0) > 0 ? "Sebagian" : "Belum Lunas";
}

// ---- Tagihan ----
// santriIds: array — dihitung di frontend dari data.santri (target satu/kelas/semua santri),
// backend tidak menyimpan keanggotaan kelas sendiri sehingga tidak menduplikasi logika itu.
const buatTagihan = db.transaction(({ santriIds, jenis, jumlah, bulan, dicatatOleh }) => {
  if (!Array.isArray(santriIds) || !santriIds.length) throw new CashlessError(400, "Minimal satu santri tujuan tagihan wajib diisi.");
  if (!jenis || !jumlah || !bulan) throw new CashlessError(400, "Jenis, jumlah, dan bulan tagihan wajib diisi.");
  const dibuat = [];
  for (const santriId of santriIds) {
    getSantriRow(santriId);
    const row = { id: uid(), santriId, jenis, jumlah: Number(jumlah), bulan, jumlahDibayar: 0, tanggalBayarISO: null, dicatatOleh: dicatatOleh || null };
    db.prepare(`INSERT INTO Tagihan (id, santriId, jenis, jumlah, bulan, jumlahDibayar, tanggalBayarISO, dicatatOleh) VALUES (@id, @santriId, @jenis, @jumlah, @bulan, @jumlahDibayar, @tanggalBayarISO, @dicatatOleh)`).run(row);
    dibuat.push(row);
  }
  return dibuat;
});

function semuaTagihan() { return db.prepare("SELECT * FROM Tagihan ORDER BY createdAt DESC").all(); }
function tagihanSantri(santriId) { return db.prepare("SELECT * FROM Tagihan WHERE santriId = ? ORDER BY createdAt DESC").all(santriId); }

const hapusTagihan = db.transaction((id) => {
  const row = db.prepare("SELECT * FROM Tagihan WHERE id = ?").get(id);
  if (!row) throw new CashlessError(404, "Data tagihan tidak ditemukan.");
  db.prepare("DELETE FROM Tagihan WHERE id = ?").run(id);
  return row;
});

const editTagihanNominal = db.transaction(({ id, jumlah, jumlahDibayar }) => {
  const row = db.prepare("SELECT * FROM Tagihan WHERE id = ?").get(id);
  if (!row) throw new CashlessError(404, "Data tagihan tidak ditemukan.");
  jumlah = Number(jumlah); jumlahDibayar = Number(jumlahDibayar);
  if (!jumlah || jumlahDibayar < 0) throw new CashlessError(400, "Jumlah tagihan/dibayar tidak valid.");
  const dibayarBaru = Math.min(jumlahDibayar, jumlah);
  db.prepare("UPDATE Tagihan SET jumlah = ?, jumlahDibayar = ? WHERE id = ?").run(jumlah, dibayarBaru, id);
  return db.prepare("SELECT * FROM Tagihan WHERE id = ?").get(id);
});

// Catat pembayaran: menaikkan jumlahDibayar (dibatasi maksimal jumlah tagihan) DAN otomatis
// menambah satu baris Cashflow masuk kategori "Pembayaran Santri" — dalam satu transaksi,
// meniru perilaku gabungan yang sama di frontend sebelumnya.
const catatPembayaran = db.transaction(({ tagihanId, jumlahBayar, dicatatOleh }) => {
  const t = db.prepare("SELECT * FROM Tagihan WHERE id = ?").get(tagihanId);
  if (!t) throw new CashlessError(404, "Data tagihan tidak ditemukan.");
  jumlahBayar = Number(jumlahBayar);
  if (!jumlahBayar || jumlahBayar <= 0) throw new CashlessError(400, "Jumlah bayar harus lebih dari 0.");
  const dibayarBaru = Math.min(t.jumlah, (t.jumlahDibayar || 0) + jumlahBayar);
  db.prepare("UPDATE Tagihan SET jumlahDibayar = ?, tanggalBayarISO = ? WHERE id = ?").run(dibayarBaru, todayISO(), tagihanId);
  const santri = getSantriRow(t.santriId);
  const cf = {
    id: uid(), bulan: t.bulan, tanggalISO: todayISO(), jenis: "Masuk", kategori: "Pembayaran Santri",
    jumlah: jumlahBayar, keterangan: `Pembayaran ${t.jenis} a.n. ${santri.nama}`, dicatatOleh: dicatatOleh || null,
  };
  db.prepare(`INSERT INTO Cashflow (id, bulan, tanggalISO, jenis, kategori, jumlah, keterangan, dicatatOleh) VALUES (@id, @bulan, @tanggalISO, @jenis, @kategori, @jumlah, @keterangan, @dicatatOleh)`).run(cf);
  return { tagihan: db.prepare("SELECT * FROM Tagihan WHERE id = ?").get(tagihanId), cashflow: cf };
});

// ---- Cashflow (juga menaungi Infaq: kategori "Infaq/Donasi" adalah entri Cashflow biasa) ----
const catatCashflow = db.transaction(({ bulan, jenis, kategori, jumlah, keterangan, dicatatOleh }) => {
  if (!bulan || !jenis || !kategori || !jumlah) throw new CashlessError(400, "Bulan, jenis, kategori, dan jumlah wajib diisi.");
  if (!["Masuk", "Keluar"].includes(jenis)) throw new CashlessError(400, "Jenis cashflow harus Masuk atau Keluar.");
  if (!KATEGORI_CASHFLOW.includes(kategori)) throw new CashlessError(400, "Kategori cashflow tidak valid.");
  const row = { id: uid(), bulan, tanggalISO: todayISO(), jenis, kategori, jumlah: Number(jumlah), keterangan: keterangan || null, dicatatOleh: dicatatOleh || null };
  db.prepare(`INSERT INTO Cashflow (id, bulan, tanggalISO, jenis, kategori, jumlah, keterangan, dicatatOleh) VALUES (@id, @bulan, @tanggalISO, @jenis, @kategori, @jumlah, @keterangan, @dicatatOleh)`).run(row);
  return row;
});
function semuaCashflow() { return db.prepare("SELECT * FROM Cashflow ORDER BY createdAt DESC").all(); }
const hapusCashflow = db.transaction((id) => {
  const row = db.prepare("SELECT * FROM Cashflow WHERE id = ?").get(id);
  if (!row) throw new CashlessError(404, "Data cashflow tidak ditemukan.");
  db.prepare("DELETE FROM Cashflow WHERE id = ?").run(id);
  return row;
});

// ---- Pengajuan Anggaran (persetujuan sebelum dana dikeluarkan; realisasi tercatat otomatis ke Cashflow) ----
const STATUS_ANGGARAN = ["Diajukan", "Disetujui", "Ditolak", "Direalisasikan"];

function lampirkanRincian(pengajuan) {
  const rincian = db.prepare("SELECT id, uraian, qty, hargaSatuan, subtotal FROM RincianAnggaran WHERE pengajuanId = ?").all(pengajuan.id);
  return { ...pengajuan, rincian };
}

function semuaPengajuan() {
  return db.prepare("SELECT * FROM PengajuanAnggaran ORDER BY createdAt DESC").all().map(lampirkanRincian);
}

const ajukanAnggaran = db.transaction(({ namaKegiatan, unitPengaju, ketuaBagianNama, kategori, bulanRencana, catatan, rincian, diajukanOleh }) => {
  if (!namaKegiatan || !kategori || !bulanRencana) throw new CashlessError(400, "Nama kegiatan, kategori, dan bulan rencana wajib diisi.");
  if (!Array.isArray(rincian) || !rincian.length) throw new CashlessError(400, "Minimal satu baris rincian anggaran wajib diisi.");
  const rincianBersih = rincian.map((r) => {
    const qty = Number(r.qty), hargaSatuan = Number(r.hargaSatuan);
    if (!r.uraian || !qty || !hargaSatuan) throw new CashlessError(400, "Setiap baris rincian wajib punya uraian, jumlah, dan harga satuan.");
    return { id: uid(), uraian: r.uraian, qty, hargaSatuan, subtotal: qty * hargaSatuan };
  });
  // Total dihitung ulang di server dari rincian — tidak dipercaya mentah-mentah dari frontend.
  const totalAnggaran = rincianBersih.reduce((a, r) => a + r.subtotal, 0);
  const row = {
    id: uid(), namaKegiatan, unitPengaju: unitPengaju || null, ketuaBagianNama: ketuaBagianNama || null,
    kategori, bulanRencana, catatan: catatan || null, totalAnggaran, status: "Diajukan",
    tanggalPengajuanISO: todayISO(), diajukanOleh: diajukanOleh || null,
    tanggalKeputusanISO: null, disetujuiOleh: null, pimpinanId: null, realisasiJumlah: null, realisasiTanggalISO: null,
  };
  db.prepare(`
    INSERT INTO PengajuanAnggaran (id, namaKegiatan, unitPengaju, ketuaBagianNama, kategori, bulanRencana, catatan, totalAnggaran, status, tanggalPengajuanISO, diajukanOleh, tanggalKeputusanISO, disetujuiOleh, pimpinanId, realisasiJumlah, realisasiTanggalISO)
    VALUES (@id, @namaKegiatan, @unitPengaju, @ketuaBagianNama, @kategori, @bulanRencana, @catatan, @totalAnggaran, @status, @tanggalPengajuanISO, @diajukanOleh, @tanggalKeputusanISO, @disetujuiOleh, @pimpinanId, @realisasiJumlah, @realisasiTanggalISO)
  `).run(row);
  const insertRincian = db.prepare(`INSERT INTO RincianAnggaran (id, pengajuanId, uraian, qty, hargaSatuan, subtotal) VALUES (@id, @pengajuanId, @uraian, @qty, @hargaSatuan, @subtotal)`);
  for (const r of rincianBersih) insertRincian.run({ ...r, pengajuanId: row.id });
  return lampirkanRincian(row);
});

const hapusPengajuan = db.transaction((id) => {
  const row = db.prepare("SELECT * FROM PengajuanAnggaran WHERE id = ?").get(id);
  if (!row) throw new CashlessError(404, "Data pengajuan anggaran tidak ditemukan.");
  if (!["Diajukan", "Ditolak"].includes(row.status)) throw new CashlessError(409, "Hanya pengajuan berstatus Diajukan atau Ditolak yang boleh dihapus.");
  db.prepare("DELETE FROM RincianAnggaran WHERE pengajuanId = ?").run(id);
  db.prepare("DELETE FROM PengajuanAnggaran WHERE id = ?").run(id);
  return row;
});

const setujuiAnggaran = db.transaction(({ id, pimpinanId, disetujuiOleh }) => {
  const row = db.prepare("SELECT * FROM PengajuanAnggaran WHERE id = ?").get(id);
  if (!row) throw new CashlessError(404, "Data pengajuan anggaran tidak ditemukan.");
  if (row.status !== "Diajukan") throw new CashlessError(409, "Hanya pengajuan berstatus Diajukan yang bisa disetujui.");
  db.prepare("UPDATE PengajuanAnggaran SET status = 'Disetujui', tanggalKeputusanISO = ?, disetujuiOleh = ?, pimpinanId = ? WHERE id = ?").run(todayISO(), disetujuiOleh || null, pimpinanId || null, id);
  return lampirkanRincian(db.prepare("SELECT * FROM PengajuanAnggaran WHERE id = ?").get(id));
});

const tolakAnggaran = db.transaction(({ id, disetujuiOleh }) => {
  const row = db.prepare("SELECT * FROM PengajuanAnggaran WHERE id = ?").get(id);
  if (!row) throw new CashlessError(404, "Data pengajuan anggaran tidak ditemukan.");
  if (row.status !== "Diajukan") throw new CashlessError(409, "Hanya pengajuan berstatus Diajukan yang bisa ditolak.");
  db.prepare("UPDATE PengajuanAnggaran SET status = 'Ditolak', tanggalKeputusanISO = ?, disetujuiOleh = ? WHERE id = ?").run(todayISO(), disetujuiOleh || null, id);
  return lampirkanRincian(db.prepare("SELECT * FROM PengajuanAnggaran WHERE id = ?").get(id));
});

// Realisasi: menandai dana benar-benar dikeluarkan, DAN otomatis menambah satu baris Cashflow keluar
// dengan kategori yang sama seperti pengajuannya — dalam satu transaksi, meniru perilaku frontend lama.
const realisasikanAnggaran = db.transaction(({ id, jumlahRealisasi, dicatatOleh }) => {
  const row = db.prepare("SELECT * FROM PengajuanAnggaran WHERE id = ?").get(id);
  if (!row) throw new CashlessError(404, "Data pengajuan anggaran tidak ditemukan.");
  if (row.status !== "Disetujui") throw new CashlessError(409, "Hanya pengajuan berstatus Disetujui yang bisa direalisasikan.");
  const jumlah = Number(jumlahRealisasi) || row.totalAnggaran;
  if (!jumlah || jumlah <= 0) throw new CashlessError(400, "Jumlah realisasi tidak valid.");
  db.prepare("UPDATE PengajuanAnggaran SET status = 'Direalisasikan', realisasiJumlah = ?, realisasiTanggalISO = ? WHERE id = ?").run(jumlah, todayISO(), id);
  const cf = {
    id: uid(), bulan: row.bulanRencana, tanggalISO: todayISO(), jenis: "Keluar", kategori: row.kategori,
    jumlah, keterangan: `Realisasi Anggaran: ${row.namaKegiatan}`, dicatatOleh: dicatatOleh || null,
  };
  db.prepare(`INSERT INTO Cashflow (id, bulan, tanggalISO, jenis, kategori, jumlah, keterangan, dicatatOleh) VALUES (@id, @bulan, @tanggalISO, @jenis, @kategori, @jumlah, @keterangan, @dicatatOleh)`).run(cf);
  return { pengajuan: lampirkanRincian(db.prepare("SELECT * FROM PengajuanAnggaran WHERE id = ?").get(id)), cashflow: cf };
});

module.exports = {
  JENIS_TAGIHAN, KATEGORI_CASHFLOW, STATUS_ANGGARAN, statusTagihan,
  buatTagihan, semuaTagihan, tagihanSantri, hapusTagihan, editTagihanNominal, catatPembayaran,
  catatCashflow, semuaCashflow, hapusCashflow,
  ajukanAnggaran, semuaPengajuan, hapusPengajuan, setujuiAnggaran, tolakAnggaran, realisasikanAnggaran,
};
