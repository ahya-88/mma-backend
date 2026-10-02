const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("./db");
const { CashlessError, uid } = require("./cashlessService");

const BATAS_GAGAL_PIN = 3;
const DURASI_KUNCI_MS = 15 * 60 * 1000;

function normalisasiPin(pin) {
  if (typeof pin === "string") return pin;
  if (typeof pin === "number" && Number.isSafeInteger(pin)) return String(pin);
  return "";
}

function validasiPin(pin) {
  return /^\d{4,6}$/.test(normalisasiPin(pin));
}

function setPin(santriId, pin) {
  if (!validasiPin(pin)) throw new CashlessError(400, "PIN harus terdiri dari 4 sampai 6 digit angka.");
  const pinHash = bcrypt.hashSync(normalisasiPin(pin), 10);
  const result = db.prepare(`
    UPDATE Santri SET pinHash = ?, pinGagal = 0, pinKunciSampai = NULL, updatedAt = datetime('now')
    WHERE id = ?
  `).run(pinHash, santriId);
  if (!result.changes) throw new CashlessError(404, "Santri tidak ditemukan.");
}

function hasilPin(status, message, details) {
  return { status, message, details };
}

// Dipanggil di dalam transaksi debit. Hasil gagal dikembalikan agar catatan percobaan
// tersimpan sebelum CashlessError dilempar oleh pemanggil di luar transaksi DB.
function verifikasiPin(santri, pin, { unit, petugasId }) {
  const log = db.prepare("INSERT INTO LogPin (santriId, unit, petugasId, hasil) VALUES (?, ?, ?, ?)");
  if (!santri.pinHash) {
    log.run(santri.id, unit, petugasId, "belum_diatur");
    return hasilPin(409, "PIN santri belum diatur.", { kode: "PIN_BELUM_DIATUR" });
  }

  const now = Date.now();
  const lockUntil = santri.pinKunciSampai ? Date.parse(santri.pinKunciSampai) : 0;
  if (lockUntil > now) {
    log.run(santri.id, unit, petugasId, "terkunci");
    return hasilPin(423, "PIN terkunci. Silakan coba lagi setelah waktu kunci berakhir.", {
      kode: "PIN_TERKUNCI",
      sampai: santri.pinKunciSampai,
    });
  }

  const pinNormal = normalisasiPin(pin);
  if (/^\d{4,6}$/.test(pinNormal) && bcrypt.compareSync(pinNormal, santri.pinHash)) {
    db.prepare("UPDATE Santri SET pinGagal = 0, pinKunciSampai = NULL WHERE id = ?").run(santri.id);
    log.run(santri.id, unit, petugasId, "berhasil");
    return null;
  }

  const gagalSebelumnya = lockUntil && lockUntil <= now ? 0 : Number(santri.pinGagal || 0);
  const pinGagal = gagalSebelumnya + 1;
  if (pinGagal >= BATAS_GAGAL_PIN) {
    const sampai = new Date(now + DURASI_KUNCI_MS).toISOString();
    db.prepare("UPDATE Santri SET pinGagal = ?, pinKunciSampai = ? WHERE id = ?").run(pinGagal, sampai, santri.id);
    log.run(santri.id, unit, petugasId, "terkunci");
    return hasilPin(423, "PIN salah 3 kali. PIN dikunci selama 15 menit.", { kode: "PIN_TERKUNCI", sampai });
  }

  db.prepare("UPDATE Santri SET pinGagal = ?, pinKunciSampai = NULL WHERE id = ?").run(pinGagal, santri.id);
  log.run(santri.id, unit, petugasId, "salah");
  return hasilPin(422, "PIN yang dimasukkan salah.", { kode: "PIN_SALAH", sisaPercobaan: BATAS_GAGAL_PIN - pinGagal });
}

function buatTokenUnik() {
  let token;
  do {
    token = crypto.randomBytes(16).toString("base64url");
  } while (db.prepare("SELECT 1 FROM Santri WHERE kartuToken = ?").get(token));
  return token;
}

function terbitkanKartu(santriId) {
  const santri = db.prepare("SELECT id FROM Santri WHERE id = ?").get(santriId);
  if (!santri) throw new CashlessError(404, "Santri tidak ditemukan.");
  const kartuToken = buatTokenUnik();
  const kartuTerbit = new Date().toISOString();
  db.prepare("UPDATE Santri SET kartuToken = ?, kartuTerbit = ?, updatedAt = datetime('now') WHERE id = ?")
    .run(kartuToken, kartuTerbit, santriId);
  return { kartuToken, kartuTerbit };
}

module.exports = { normalisasiPin, validasiPin, setPin, verifikasiPin, terbitkanKartu, buatTokenUnik, uid };