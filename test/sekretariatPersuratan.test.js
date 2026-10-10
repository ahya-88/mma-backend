const test = require("node:test");
const assert = require("node:assert");

// Helper fungsi penomoran surat
const NAMA_BULAN_HIJRI = [
  "Muharram", "Safar", "Rabi'ul Awwal", "Rabi'ul Akhir",
  "Jumadil Awwal", "Jumadil Akhir", "Rajab", "Sya'ban",
  "Ramadhan", "Syawwal", "Dzulqa'dah", "Dzulhijjah",
];

const ROMAWI_BULAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const romawiBulan = (index0) => ROMAWI_BULAN[Math.max(0, Math.min(11, index0))] || "I";

const masehiKeHijri = (d = new Date()) => {
  const gYear = d.getFullYear(), gMonth = d.getMonth(), gDay = d.getDate();
  const jd = Math.floor((1461 * (gYear + 4800 + Math.floor((gMonth - 9) / 12))) / 4) +
    Math.floor((367 * (gMonth - 9 - 12 * Math.floor((gMonth - 9) / 12))) / 12) -
    Math.floor((3 * Math.floor((gYear + 4900 + Math.floor((gMonth - 9) / 12)) / 100)) / 4) +
    gDay - 32075;
  const l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const l1 = l - 10631 * n + 354;
  const j = (Math.floor((10985 - l1) / 5316)) * (Math.floor((50 * l1) / 17719)) +
    (Math.floor(l1 / 5670)) * (Math.floor((43 * l1) / 15238));
  const l2 = l1 - (Math.floor((30 - j) / 15)) * (Math.floor((17719 * j) / 50)) -
    (Math.floor(j / 16)) * (Math.floor((15238 * j) / 43)) + 29;
  const m = Math.floor((24 * l2) / 709);
  const dH = l2 - Math.floor((709 * m) / 24);
  const y = 30 * n + j - 30;
  return { tanggal: dH, bulan: m, tahun: y, namaBulan: NAMA_BULAN_HIJRI[m - 1] || "" };
};

const formatNomorSurat = (urut, k) => {
  const urutStr = String(urut).padStart(2, "0");
  const bulanRomawi = romawiBulan(k.hijri.bulan - 1);
  return `${urutStr}/${k.kodeOrganisasi}/${k.kodeJabatan}-${k.kodeSurat}/${bulanRomawi}/${k.hijri.tahun}`;
};

test("SEKRETARIAT: Konversi Kalender Hijriyah dan Romawi Bulan Valid", () => {
  assert.strictEqual(romawiBulan(0), "I");
  assert.strictEqual(romawiBulan(9), "X");
  assert.strictEqual(romawiBulan(11), "XII");

  const hijri = masehiKeHijri(new Date("2026-10-10"));
  assert.strictEqual(typeof hijri.tahun, "number");
  assert.ok(hijri.tahun >= 1445);
  assert.ok(hijri.bulan >= 1 && hijri.bulan <= 12);
  assert.ok(hijri.tanggal >= 1 && hijri.tanggal <= 30);
});

test("SEKRETARIAT: Format Nomor Surat Standar Pesantren Terbentuk Sempurna", () => {
  const k = {
    kodeOrganisasi: "OPPM",
    kodeJabatan: "A",
    kodeSurat: "f",
    hijri: { bulan: 4, tahun: 1448 },
  };

  const no1 = formatNomorSurat(1, k);
  assert.strictEqual(no1, "01/OPPM/A-f/IV/1448");

  const no15 = formatNomorSurat(15, k);
  assert.strictEqual(no15, "15/OPPM/A-f/IV/1448");
});

test("SEKRETARIAT: Validasi Alur Status Surat Keluar", () => {
  const validStatusTransitions = {
    "Draft": ["Diajukan"],
    "Diajukan": ["Disetujui", "Ditolak"],
    "Disetujui": ["Terkirim"],
    "Terkirim": ["Diarsipkan"],
    "Ditolak": ["Draft"],
  };

  const canTransition = (current, next) => (validStatusTransitions[current] || []).includes(next);

  assert.strictEqual(canTransition("Draft", "Diajukan"), true);
  assert.strictEqual(canTransition("Diajukan", "Disetujui"), true);
  assert.strictEqual(canTransition("Diajukan", "Ditolak"), true);
  assert.strictEqual(canTransition("Disetujui", "Terkirim"), true);
  assert.strictEqual(canTransition("Terkirim", "Diarsipkan"), true);
  assert.strictEqual(canTransition("Draft", "Terkirim"), false);
});
