const crypto = require("crypto");
const db = require("./db");
const { CashlessError, getSantriRow, todayISO } = require("./cashlessService");

const uid = () => crypto.randomUUID();
const PREDIKAT_LIST = ["Sangat Baik", "Baik", "Cukup", "Perlu Bimbingan"];

// ---- Nilai (Pengajaran) ----
const catatNilai = db.transaction(({ santriId, mapel, nilai, dicatatOleh }) => {
  getSantriRow(santriId);
  if (!mapel || nilai === undefined || nilai === null || nilai === "") throw new CashlessError(400, "Mata pelajaran dan nilai wajib diisi.");
  const row = { id: uid(), santriId, mapel, nilai: Number(nilai), tanggalISO: todayISO(), dicatatOleh: dicatatOleh || null };
  db.prepare(`INSERT INTO Nilai (id, santriId, mapel, nilai, tanggalISO, dicatatOleh) VALUES (@id, @santriId, @mapel, @nilai, @tanggalISO, @dicatatOleh)`).run(row);
  return row;
});
function semuaNilai() { return db.prepare("SELECT * FROM Nilai ORDER BY createdAt DESC").all(); }
const hapusNilai = db.transaction((id) => {
  const row = db.prepare("SELECT * FROM Nilai WHERE id = ?").get(id);
  if (!row) throw new CashlessError(404, "Data nilai tidak ditemukan.");
  db.prepare("DELETE FROM Nilai WHERE id = ?").run(id);
  return row;
});

// ---- Prestasi (Pengajaran) ----
const catatPrestasi = db.transaction(({ santriId, judul, tingkat, dicatatOleh }) => {
  getSantriRow(santriId);
  if (!judul) throw new CashlessError(400, "Judul prestasi wajib diisi.");
  const row = { id: uid(), santriId, judul, tingkat: tingkat || null, tanggalISO: todayISO(), dicatatOleh: dicatatOleh || null };
  db.prepare(`INSERT INTO Prestasi (id, santriId, judul, tingkat, tanggalISO, dicatatOleh) VALUES (@id, @santriId, @judul, @tingkat, @tanggalISO, @dicatatOleh)`).run(row);
  return row;
});
function semuaPrestasi() { return db.prepare("SELECT * FROM Prestasi ORDER BY createdAt DESC").all(); }
const hapusPrestasi = db.transaction((id) => {
  const row = db.prepare("SELECT * FROM Prestasi WHERE id = ?").get(id);
  if (!row) throw new CashlessError(404, "Data prestasi tidak ditemukan.");
  db.prepare("DELETE FROM Prestasi WHERE id = ?").run(id);
  return row;
});

// ---- Hafalan (LPTQ) ----
const catatHafalan = db.transaction(({ santriId, juz, dicatatOleh }) => {
  getSantriRow(santriId);
  if (!juz) throw new CashlessError(400, "Juz/Surah/materi wajib diisi.");
  const row = { id: uid(), santriId, juz, tanggalISO: todayISO(), dicatatOleh: dicatatOleh || null };
  db.prepare(`INSERT INTO Hafalan (id, santriId, juz, tanggalISO, dicatatOleh) VALUES (@id, @santriId, @juz, @tanggalISO, @dicatatOleh)`).run(row);
  return row;
});
function semuaHafalan() { return db.prepare("SELECT * FROM Hafalan ORDER BY createdAt DESC").all(); }
const hapusHafalan = db.transaction((id) => {
  const row = db.prepare("SELECT * FROM Hafalan WHERE id = ?").get(id);
  if (!row) throw new CashlessError(404, "Data hafalan tidak ditemukan.");
  db.prepare("DELETE FROM Hafalan WHERE id = ?").run(id);
  return row;
});

// ---- Penilaian Ubudiyah & Doa (LPTQ) ----
const catatUbudiyah = db.transaction(({ santriId, jenis, materi, predikat, catatan, dicatatOleh }) => {
  getSantriRow(santriId);
  if (!jenis || !predikat) throw new CashlessError(400, "Jenis dan predikat wajib diisi.");
  if (!PREDIKAT_LIST.includes(predikat)) throw new CashlessError(400, "Predikat tidak valid.");
  const row = { id: uid(), santriId, jenis, materi: materi || null, predikat, catatan: catatan || null, tanggalISO: todayISO(), dicatatOleh: dicatatOleh || null };
  db.prepare(`INSERT INTO PenilaianUbudiyah (id, santriId, jenis, materi, predikat, catatan, tanggalISO, dicatatOleh) VALUES (@id, @santriId, @jenis, @materi, @predikat, @catatan, @tanggalISO, @dicatatOleh)`).run(row);
  return row;
});
function semuaUbudiyah() { return db.prepare("SELECT * FROM PenilaianUbudiyah ORDER BY createdAt DESC").all(); }
const hapusUbudiyah = db.transaction((id) => {
  const row = db.prepare("SELECT * FROM PenilaianUbudiyah WHERE id = ?").get(id);
  if (!row) throw new CashlessError(404, "Data penilaian ubudiyah tidak ditemukan.");
  db.prepare("DELETE FROM PenilaianUbudiyah WHERE id = ?").run(id);
  return row;
});

module.exports = {
  PREDIKAT_LIST,
  catatNilai, semuaNilai, hapusNilai,
  catatPrestasi, semuaPrestasi, hapusPrestasi,
  catatHafalan, semuaHafalan, hapusHafalan,
  catatUbudiyah, semuaUbudiyah, hapusUbudiyah,
};
