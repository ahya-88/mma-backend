const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("./db");
const { CashlessError } = require("./cashlessService");

const uid = () => crypto.randomUUID();

// Harus sinkron dengan DEPT_META di pesantren-app.jsx.
const DEPARTEMEN_VALID = ["admin", "pengasuhan", "pengajaran", "lptq", "administrasi", "unitusaha", "sekretariat"];

function toPublicGuru(row) {
  if (!row) return row;
  const { password, ...rest } = row;
  return rest;
}

// Username wajib unik di seluruh sistem (Guru + Wali) karena login satu pintu memakai satu
// kolom username lintas kedua tabel. `kecualiId` dipakai saat mengedit akun Guru yang sudah ada,
// supaya akun itu sendiri tidak dianggap bentrok dengan usernamenya sendiri.
function assertUsernameTersedia(username, kecualiId) {
  const adaGuru = db.prepare("SELECT id FROM Guru WHERE username = ? AND id != ?").get(username, kecualiId || "");
  const adaWali = db.prepare("SELECT id FROM Wali WHERE username = ?").get(username);
  if (adaGuru || adaWali) {
    throw new CashlessError(409, "Username itu sudah dipakai (harus unik di seluruh sistem untuk login satu pintu).");
  }
}

// ---------------- Akun Guru/Staf ----------------
function semuaGuru() {
  return db.prepare("SELECT * FROM Guru ORDER BY departemen, nama").all().map(toPublicGuru);
}

const buatGuru = db.transaction(({ nama, username, password, departemen, unit }) => {
  if (!nama || !username || !password) throw new CashlessError(400, "Nama, username, dan kata sandi wajib diisi.");
  if (!DEPARTEMEN_VALID.includes(departemen)) throw new CashlessError(400, "Departemen tidak valid.");
  if (departemen === "unitusaha" && !unit) throw new CashlessError(400, "Pilih bagian Unit Usaha (Kantin/Kopel/Dapur/BMT, dst.).");
  assertUsernameTersedia(username);
  const row = {
    id: uid(), nama, username, password: bcrypt.hashSync(password, 10),
    departemen, unit: departemen === "unitusaha" ? unit : null,
  };
  db.prepare(`INSERT INTO Guru (id, nama, username, password, departemen, unit) VALUES (@id, @nama, @username, @password, @departemen, @unit)`).run(row);
  return toPublicGuru(row);
});

const editGuru = db.transaction(({ id, nama, username, departemen, unit }) => {
  const row = db.prepare("SELECT * FROM Guru WHERE id = ?").get(id);
  if (!row) throw new CashlessError(404, "Akun tidak ditemukan.");
  if (username && username !== row.username) assertUsernameTersedia(username, id);
  const depFinal = departemen || row.departemen;
  if (!DEPARTEMEN_VALID.includes(depFinal)) throw new CashlessError(400, "Departemen tidak valid.");
  const unitFinal = depFinal === "unitusaha" ? (unit || row.unit) : null;
  if (depFinal === "unitusaha" && !unitFinal) throw new CashlessError(400, "Pilih bagian Unit Usaha (Kantin/Kopel/Dapur/BMT, dst.).");
  db.prepare(`UPDATE Guru SET nama = @nama, username = @username, departemen = @departemen, unit = @unit WHERE id = @id`).run({
    id, nama: nama || row.nama, username: username || row.username, departemen: depFinal, unit: unitFinal,
  });
  return toPublicGuru(db.prepare("SELECT * FROM Guru WHERE id = ?").get(id));
});

const editPasswordGuru = db.transaction(({ id, password }) => {
  if (!password) throw new CashlessError(400, "Kata sandi baru wajib diisi.");
  const row = db.prepare("SELECT id FROM Guru WHERE id = ?").get(id);
  if (!row) throw new CashlessError(404, "Akun tidak ditemukan.");
  db.prepare("UPDATE Guru SET password = ? WHERE id = ?").run(bcrypt.hashSync(password, 10), id);
  return { id, updated: true };
});

// `actingUserId`: mencegah admin yang sedang login menghapus akunnya sendiri (akan langsung
// kehilangan akses tanpa ada admin lain yang tahu). Juga mencegah menghapus admin terakhir.
const hapusGuru = db.transaction(({ id, actingUserId }) => {
  const row = db.prepare("SELECT * FROM Guru WHERE id = ?").get(id);
  if (!row) throw new CashlessError(404, "Akun tidak ditemukan.");
  if (id === actingUserId) throw new CashlessError(400, "Tidak bisa menghapus akun sendiri yang sedang dipakai untuk login ini.");
  if (row.departemen === "admin") {
    const jumlahAdmin = db.prepare("SELECT COUNT(*) AS n FROM Guru WHERE departemen = 'admin'").get().n;
    if (jumlahAdmin <= 1) throw new CashlessError(400, "Tidak bisa menghapus admin terakhir — sistem membutuhkan minimal satu akun Admin.");
  }
  db.prepare("DELETE FROM Guru WHERE id = ?").run(id);
  return { id, deleted: true };
});

// ---------------- Unit Usaha ----------------
function semuaUnitUsaha() { return db.prepare("SELECT * FROM UnitUsaha ORDER BY nama").all(); }

const tambahUnitUsaha = db.transaction((namaMentah) => {
  const nama = (namaMentah || "").trim();
  if (!nama) throw new CashlessError(400, "Nama unit usaha wajib diisi.");
  if (db.prepare("SELECT id FROM UnitUsaha WHERE nama = ?").get(nama)) throw new CashlessError(409, "Unit usaha itu sudah ada.");
  const row = { id: uid(), nama };
  db.prepare("INSERT INTO UnitUsaha (id, nama) VALUES (@id, @nama)").run(row);
  return row;
});

const hapusUnitUsaha = db.transaction((id) => {
  const row = db.prepare("SELECT * FROM UnitUsaha WHERE id = ?").get(id);
  if (!row) throw new CashlessError(404, "Unit usaha tidak ditemukan.");
  const dipakai = db.prepare("SELECT COUNT(*) AS n FROM Guru WHERE departemen = 'unitusaha' AND unit = ?").get(row.nama).n;
  if (dipakai > 0) throw new CashlessError(409, "Unit usaha ini masih dipakai oleh akun staf — pindahkan akun tersebut ke unit lain dahulu.");
  db.prepare("DELETE FROM UnitUsaha WHERE id = ?").run(id);
  return row;
});

// ---------------- Tahun Ajaran ----------------
function semuaTahunAjaran() {
  return db.prepare("SELECT * FROM TahunAjaran ORDER BY tahunMulai DESC").all().map((r) => ({ ...r, aktif: !!r.aktif }));
}

const tambahTahunAjaran = db.transaction((tahunMulaiMentah) => {
  const tahunMulai = Number(tahunMulaiMentah);
  if (!tahunMulai || tahunMulai < 2000) throw new CashlessError(400, "Masukkan tahun mulai yang valid, mis. 2027.");
  if (db.prepare("SELECT id FROM TahunAjaran WHERE tahunMulai = ?").get(tahunMulai)) throw new CashlessError(409, "Tahun ajaran itu sudah ada.");
  const row = { id: uid(), tahunMulai, aktif: 0 };
  db.prepare("INSERT INTO TahunAjaran (id, tahunMulai, aktif) VALUES (@id, @tahunMulai, @aktif)").run(row);
  return { ...row, aktif: false };
});

const aktifkanTahunAjaran = db.transaction((id) => {
  const row = db.prepare("SELECT id FROM TahunAjaran WHERE id = ?").get(id);
  if (!row) throw new CashlessError(404, "Tahun ajaran tidak ditemukan.");
  db.prepare("UPDATE TahunAjaran SET aktif = 0").run();
  db.prepare("UPDATE TahunAjaran SET aktif = 1 WHERE id = ?").run(id);
  return { id, aktif: true };
});

const hapusTahunAjaran = db.transaction((id) => {
  const row = db.prepare("SELECT * FROM TahunAjaran WHERE id = ?").get(id);
  if (!row) throw new CashlessError(404, "Tahun ajaran tidak ditemukan.");
  db.prepare("DELETE FROM TahunAjaran WHERE id = ?").run(id);
  return row;
});

// ---------------- Tampilan Aplikasi ----------------
const TAMPILAN_DEFAULT = {
  logoUrl: "", buildingPhotoUrl: "", namaAplikasi: "Ma'had Mudaiyatul Anwar",
  warnaPrimer: "#29AAE1", warnaSekunder: "#0C4A6E", warnaAksenBg: "#7C3AED",
  warnaTeks: "#17242E", warnaTeksMuted: "#5B7C93", warnaBorder: "#CFE3F0",
  warnaLatarHalaman: "#F4F8FB", fontJudul: "Fraunces", fontIsi: "Inter", gayaBackground: "aurora",
};

function ambilTampilan() {
  const row = db.prepare("SELECT nilai FROM Pengaturan WHERE kunci = 'tampilan'").get();
  if (!row) return { ...TAMPILAN_DEFAULT };
  try { return { ...TAMPILAN_DEFAULT, ...JSON.parse(row.nilai) }; } catch { return { ...TAMPILAN_DEFAULT }; }
}

const simpanTampilan = db.transaction((tampilan) => {
  const nilai = JSON.stringify({ ...TAMPILAN_DEFAULT, ...(tampilan || {}) });
  db.prepare(
    "INSERT INTO Pengaturan (kunci, nilai) VALUES ('tampilan', @nilai) ON CONFLICT(kunci) DO UPDATE SET nilai = @nilai"
  ).run({ nilai });
  return ambilTampilan();
});

module.exports = {
  semuaGuru, buatGuru, editGuru, editPasswordGuru, hapusGuru,
  semuaUnitUsaha, tambahUnitUsaha, hapusUnitUsaha,
  semuaTahunAjaran, tambahTahunAjaran, aktifkanTahunAjaran, hapusTahunAjaran,
  ambilTampilan, simpanTampilan, TAMPILAN_DEFAULT,
};
