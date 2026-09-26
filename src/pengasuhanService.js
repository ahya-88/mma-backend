const crypto = require("crypto");
const db = require("./db");
const { CashlessError, getSantriRow, todayISO, todayLabel } = require("./cashlessService");

const uid = () => crypto.randomUUID();
const STATUS_ABSENSI = ["Hadir", "Sakit", "Izin", "Alpa"];
const STATUS_PERIZINAN = ["Menunggu", "Disetujui", "Ditolak", "Selesai"];

// ---- Absensi ----
const catatAbsensi = db.transaction(({ santriId, tanggalISO, status, keterangan, dicatatOleh }) => {
  getSantriRow(santriId); // validasi santri ada, lempar 404 jika tidak
  if (!STATUS_ABSENSI.includes(status)) throw new CashlessError(400, "Status absensi tidak valid.");
  const tanggal = tanggalISO || todayISO();
  // Satu santri hanya boleh punya satu catatan absensi per tanggal — timpa jika sudah ada (koreksi).
  const ada = db.prepare("SELECT id FROM Absensi WHERE santriId = ? AND tanggalISO = ?").get(santriId, tanggal);
  if (ada) {
    db.prepare("UPDATE Absensi SET status = ?, keterangan = ?, dicatatOleh = ? WHERE id = ?").run(status, keterangan || null, dicatatOleh || null, ada.id);
    return db.prepare("SELECT * FROM Absensi WHERE id = ?").get(ada.id);
  }
  const row = { id: uid(), santriId, tanggalISO: tanggal, status, keterangan: keterangan || null, dicatatOleh: dicatatOleh || null };
  db.prepare(`INSERT INTO Absensi (id, santriId, tanggalISO, status, keterangan, dicatatOleh) VALUES (@id, @santriId, @tanggalISO, @status, @keterangan, @dicatatOleh)`).run(row);
  return db.prepare("SELECT * FROM Absensi WHERE id = ?").get(row.id);
});

function riwayatAbsensi(santriId) {
  getSantriRow(santriId);
  const rows = db.prepare("SELECT * FROM Absensi WHERE santriId = ? ORDER BY tanggalISO DESC").all(santriId);
  const rekap = Object.fromEntries(STATUS_ABSENSI.map((s) => [s, rows.filter((r) => r.status === s).length]));
  return { rows, rekap };
}

// Snapshot absensi seluruh santri pada satu tanggal (untuk UI ambil-absen harian per kelas).
function absensiPadaTanggal(tanggalISO) {
  return db.prepare("SELECT * FROM Absensi WHERE tanggalISO = ?").all(tanggalISO || todayISO());
}

// ---- Perizinan ----
const ajukanPerizinan = db.transaction(({ santriId, jenis, tanggalKeluar, tanggalKembali, alasan, diajukanOleh }) => {
  getSantriRow(santriId);
  if (!jenis || !tanggalKeluar) throw new CashlessError(400, "Jenis izin dan tanggal keluar wajib diisi.");
  const row = {
    id: uid(), santriId, jenis, tanggalKeluar, tanggalKembali: tanggalKembali || null, alasan: alasan || null,
    status: "Menunggu", diajukanOleh: diajukanOleh || null, disetujuiOleh: null, tanggalProses: null,
  };
  db.prepare(`
    INSERT INTO Perizinan (id, santriId, jenis, tanggalKeluar, tanggalKembali, alasan, status, diajukanOleh, disetujuiOleh, tanggalProses)
    VALUES (@id, @santriId, @jenis, @tanggalKeluar, @tanggalKembali, @alasan, @status, @diajukanOleh, @disetujuiOleh, @tanggalProses)
  `).run(row);
  return db.prepare("SELECT * FROM Perizinan WHERE id = ?").get(row.id);
});

const prosesPerizinan = db.transaction(({ id, statusBaru, disetujuiOleh }) => {
  if (!STATUS_PERIZINAN.includes(statusBaru)) throw new CashlessError(400, "Status perizinan tidak valid.");
  const p = db.prepare("SELECT * FROM Perizinan WHERE id = ?").get(id);
  if (!p) throw new CashlessError(404, "Data perizinan tidak ditemukan.");
  db.prepare("UPDATE Perizinan SET status = ?, disetujuiOleh = ?, tanggalProses = ? WHERE id = ?").run(statusBaru, disetujuiOleh || null, todayLabel(), id);
  return db.prepare("SELECT * FROM Perizinan WHERE id = ?").get(id);
});

function daftarPerizinan({ santriId, status } = {}) {
  let sql = "SELECT * FROM Perizinan WHERE 1=1";
  const params = [];
  if (santriId) { sql += " AND santriId = ?"; params.push(santriId); }
  if (status && status !== "Semua") { sql += " AND status = ?"; params.push(status); }
  sql += " ORDER BY createdAt DESC";
  return db.prepare(sql).all(...params);
}

// ---- Pelanggaran ----
const catatPelanggaran = db.transaction(({ santriId, jenis, poin, tanggalISO, keterangan, dicatatOleh }) => {
  getSantriRow(santriId);
  if (!jenis) throw new CashlessError(400, "Jenis pelanggaran wajib diisi.");
  const row = { id: uid(), santriId, jenis, poin: Number(poin) || 0, tanggalISO: tanggalISO || todayISO(), keterangan: keterangan || null, dicatatOleh: dicatatOleh || null };
  db.prepare(`INSERT INTO Pelanggaran (id, santriId, jenis, poin, tanggalISO, keterangan, dicatatOleh) VALUES (@id, @santriId, @jenis, @poin, @tanggalISO, @keterangan, @dicatatOleh)`).run(row);
  return db.prepare("SELECT * FROM Pelanggaran WHERE id = ?").get(row.id);
});

function riwayatPelanggaran(santriId) {
  getSantriRow(santriId);
  const rows = db.prepare("SELECT * FROM Pelanggaran WHERE santriId = ? ORDER BY createdAt DESC").all(santriId);
  const totalPoin = rows.reduce((a, r) => a + r.poin, 0);
  return { rows, totalPoin };
}

function semuaPelanggaran() {
  return db.prepare("SELECT * FROM Pelanggaran ORDER BY createdAt DESC").all();
}

const hapusPelanggaran = db.transaction((id) => {
  const row = db.prepare("SELECT * FROM Pelanggaran WHERE id = ?").get(id);
  if (!row) throw new CashlessError(404, "Data pelanggaran tidak ditemukan.");
  db.prepare("DELETE FROM Pelanggaran WHERE id = ?").run(id);
  return row;
});

// ---- Profil ringkas untuk panel Pengasuhan (Master Data Santri) ----
function profilPengasuhan(santriId) {
  const santri = getSantriRow(santriId);
  const { rekap } = riwayatAbsensi(santriId);
  const { totalPoin } = riwayatPelanggaran(santriId);
  const perizinanAktif = db.prepare("SELECT * FROM Perizinan WHERE santriId = ? AND status IN ('Menunggu','Disetujui') ORDER BY createdAt DESC").all(santriId);
  return { santri: { id: santri.id, nama: santri.nama, kelas: santri.kelas, nis: santri.nis, nisn: santri.nisn }, rekapAbsensi: rekap, totalPoinPelanggaran: totalPoin, perizinanAktif };
}

module.exports = {
  STATUS_ABSENSI, STATUS_PERIZINAN,
  catatAbsensi, riwayatAbsensi, absensiPadaTanggal,
  ajukanPerizinan, prosesPerizinan, daftarPerizinan,
  catatPelanggaran, riwayatPelanggaran, semuaPelanggaran, hapusPelanggaran,
  profilPengasuhan,
};
