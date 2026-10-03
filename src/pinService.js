const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { query, queryOne, withTransaction } = require("./db");
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

async function setPin(santriId, pin) {
  if (!validasiPin(pin)) throw new CashlessError(400, "PIN harus terdiri dari 4 sampai 6 digit angka.");
  const pinHash = bcrypt.hashSync(normalisasiPin(pin), 10);
  const result = await query(`UPDATE "Santri" SET "pinHash" = $1, "pinGagal" = 0, "pinKunciSampai" = NULL,
    "updatedAt" = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE "id" = $2`, [pinHash, santriId]);
  if (!result.rowCount) throw new CashlessError(404, "Santri tidak ditemukan.");
}

function hasilPin(status, message, details) {
  return { status, message, details };
}

async function verifikasiPin(santri, pin, { unit, petugasId }) {
  const log = async (hasil) => query('INSERT INTO "LogPin" ("santriId", "unit", "petugasId", "hasil") VALUES ($1, $2, $3, $4)',
    [santri.id, unit, petugasId, hasil]);
  if (!santri.pinHash) {
    await log("belum_diatur");
    return hasilPin(409, "PIN santri belum diatur.", { kode: "PIN_BELUM_DIATUR" });
  }

  const now = Date.now();
  const lockUntil = santri.pinKunciSampai ? Date.parse(santri.pinKunciSampai) : 0;
  if (lockUntil > now) {
    await log("terkunci");
    return hasilPin(423, "PIN terkunci. Silakan coba lagi setelah waktu kunci berakhir.", { kode: "PIN_TERKUNCI", sampai: santri.pinKunciSampai });
  }

  const pinNormal = normalisasiPin(pin);
  if (/^\d{4,6}$/.test(pinNormal) && bcrypt.compareSync(pinNormal, santri.pinHash)) {
    await query('UPDATE "Santri" SET "pinGagal" = 0, "pinKunciSampai" = NULL WHERE "id" = $1', [santri.id]);
    await log("berhasil");
    return null;
  }

  const gagalSebelumnya = lockUntil && lockUntil <= now ? 0 : Number(santri.pinGagal || 0);
  const pinGagal = gagalSebelumnya + 1;
  if (pinGagal >= BATAS_GAGAL_PIN) {
    const sampai = new Date(now + DURASI_KUNCI_MS).toISOString();
    await query('UPDATE "Santri" SET "pinGagal" = $1, "pinKunciSampai" = $2 WHERE "id" = $3', [pinGagal, sampai, santri.id]);
    await log("terkunci");
    return hasilPin(423, "PIN salah 3 kali. PIN dikunci selama 15 menit.", { kode: "PIN_TERKUNCI", sampai });
  }

  await query('UPDATE "Santri" SET "pinGagal" = $1, "pinKunciSampai" = NULL WHERE "id" = $2', [pinGagal, santri.id]);
  await log("salah");
  return hasilPin(422, "PIN yang dimasukkan salah.", { kode: "PIN_SALAH", sisaPercobaan: BATAS_GAGAL_PIN - pinGagal });
}

async function buatTokenUnik() {
  let token;
  do {
    token = crypto.randomBytes(16).toString("base64url");
  } while (await queryOne('SELECT 1 FROM "Santri" WHERE "kartuToken" = $1', [token]));
  return token;
}

async function terbitkanKartu(santriId) {
  return withTransaction(async () => {
    const santri = await queryOne('SELECT "id" FROM "Santri" WHERE "id" = $1 FOR UPDATE', [santriId]);
    if (!santri) throw new CashlessError(404, "Santri tidak ditemukan.");
    const kartuToken = await buatTokenUnik();
    const kartuTerbit = new Date().toISOString();
    await query(`UPDATE "Santri" SET "kartuToken" = $1, "kartuTerbit" = $2,
      "updatedAt" = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE "id" = $3`,
    [kartuToken, kartuTerbit, santriId]);
    return { kartuToken, kartuTerbit };
  });
}

module.exports = { normalisasiPin, validasiPin, setPin, verifikasiPin, terbitkanKartu, buatTokenUnik, uid };