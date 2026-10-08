const bcrypt = require("bcryptjs");
const { query, queryOne, withTransaction } = require("./db");

const MAX_PIN_FAILURES = 3;
const PIN_LOCK_MS = 15 * 60 * 1000;

async function verifikasiPin(santri, pin, { unit = "Kantin", petugasId = null } = {}) {
  if (!santri.pinHash || !santri.pinHash.trim()) {
    return null; // Memungkinkan transaksi tanpa PIN jika belum di-set
  }

  if (santri.pinKunciSampai && Date.parse(santri.pinKunciSampai) > Date.now()) {
    await query(
      'INSERT INTO "LogPin" ("santriId", "unit", "petugasId", "hasil") VALUES ($1, $2, $3, \'LOCKED\')',
      [santri.id, unit, petugasId || null],
    );
    return "PIN terblokir sementara karena 3 kali salah. Silakan coba lagi nanti.";
  }

  if (typeof pin !== "string" || !pin.trim()) {
    return "PIN santri wajib diisi.";
  }

  const isMatch = await bcrypt.compare(pin.trim(), santri.pinHash);

  if (!isMatch) {
    const pinGagalBaru = Number(santri.pinGagal || 0) + 1;
    const terkunci = pinGagalBaru >= MAX_PIN_FAILURES;
    const kunciSampaiISO = terkunci
      ? new Date(Date.now() + PIN_LOCK_MS).toISOString()
      : null;

    await query(
      `UPDATE "Santri" SET "pinGagal" = $1, "pinKunciSampai" = $2 WHERE "id" = $3`,
      [pinGagalBaru, kunciSampaiISO, santri.id],
    );

    await query(
      'INSERT INTO "LogPin" ("santriId", "unit", "petugasId", "hasil") VALUES ($1, $2, $3, \'FAILED\')',
      [santri.id, unit, petugasId || null],
    );

    if (terkunci) {
      return "PIN salah 3 kali. Akses PIN terblokir sementara selama 15 menit.";
    }
    return `PIN tidak sesuai. Percobaan ke-${pinGagalBaru} dari ${MAX_PIN_FAILURES}.`;
  }

  await query(
    `UPDATE "Santri" SET "pinGagal" = 0, "pinKunciSampai" = NULL WHERE "id" = $1`,
    [santri.id],
  );

  await query(
    'INSERT INTO "LogPin" ("santriId", "unit", "petugasId", "hasil") VALUES ($1, $2, $3, \'SUCCESS\')',
    [santri.id, unit, petugasId || null],
  );

  return null;
}

module.exports = {
  verifikasiPin,
};
