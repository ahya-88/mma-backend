const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("./db");
const { CashlessError } = require("./cashlessService");

const uid = () => crypto.randomUUID();

const HARI_VALID = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const JAM_VALID = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// Definisi Jam Pelajaran Default MMA
const PENGATURAN_JAM_DEFAULT = {
  jumlahJam: 4,
  durasiMenit: 35,
  jamMulai: "08:00",
  adaIstirahat: true,
  setelahJamKe: 2,
  durasiIstirahatMenit: 30,
  daftarJam: [
    { jamKe: 1, label: "Jam 1", mulai: "08.00", selesai: "08.35", waktu: "08.00 - 08.35", durasi: "35 Menit" },
    { jamKe: 2, label: "Jam 2", mulai: "08.35", selesai: "09.10", waktu: "08.35 - 09.10", durasi: "35 Menit" },
    { jamKe: "istirahat", label: "Istirahat", mulai: "09.10", selesai: "09.40", waktu: "09.10 - 09.40", durasi: "30 Menit" },
    { jamKe: 3, label: "Jam 3", mulai: "09.40", selesai: "10.15", waktu: "09.40 - 10.15", durasi: "35 Menit" },
    { jamKe: 4, label: "Jam 4", mulai: "10.15", selesai: "10.50", waktu: "10.15 - 10.50", durasi: "35 Menit" },
  ],
};
const JAM_PELAJARAN_MMA = PENGATURAN_JAM_DEFAULT.daftarJam;

function generateDaftarJamKBM({
  jumlahJam = 4,
  durasiMenit = 35,
  jamMulai = "08:00",
  adaIstirahat = true,
  setelahJamKe = 2,
  durasiIstirahatMenit = 30,
} = {}) {
  const list = [];
  const cleanJamMulai = (jamMulai || "08:00").replace(".", ":");
  const [startHourStr, startMinStr] = cleanJamMulai.split(":");
  let currentMinutes = (parseInt(startHourStr, 10) || 8) * 60 + (parseInt(startMinStr, 10) || 0);

  const formatTime = (mins) => {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    const hh = String(h).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    return `${hh}.${mm}`;
  };

  const durJam = Math.max(15, parseInt(durasiMenit, 10) || 35);
  const durIst = Math.max(5, parseInt(durasiIstirahatMenit, 10) || 30);
  const maxJam = Math.min(12, Math.max(1, parseInt(jumlahJam, 10) || 4));
  const breakAfter = parseInt(setelahJamKe, 10) || 2;

  for (let j = 1; j <= maxJam; j++) {
    const startMins = currentMinutes;
    const endMins = currentMinutes + durJam;
    currentMinutes = endMins;

    list.push({
      jamKe: j,
      label: `Jam ${j}`,
      mulai: formatTime(startMins),
      selesai: formatTime(endMins),
      waktu: `${formatTime(startMins)} - ${formatTime(endMins)}`,
      durasi: `${durJam} Menit`,
    });

    if (adaIstirahat && j === breakAfter && j < maxJam) {
      const breakStart = currentMinutes;
      const breakEnd = currentMinutes + durIst;
      currentMinutes = breakEnd;
      list.push({
        jamKe: "istirahat",
        label: "Istirahat",
        mulai: formatTime(breakStart),
        selesai: formatTime(breakEnd),
        waktu: `${formatTime(breakStart)} - ${formatTime(breakEnd)}`,
        durasi: `${durIst} Menit`,
      });
    }
  }

  return list;
}

async function ambilPengaturanJamKBM() {
  const row = await queryOne('SELECT "nilai" FROM "Pengaturan" WHERE "kunci" = $1', ["pengaturan_jam_kbm"]);
  if (row && row.nilai) {
    try {
      const parsed = JSON.parse(row.nilai);
      if (parsed && Array.isArray(parsed.daftarJam) && parsed.daftarJam.length > 0) {
        return parsed;
      }
    } catch {}
  }
  return PENGATURAN_JAM_DEFAULT;
}

async function simpanPengaturanJamKBM(data = {}) {
  const jumlahJam = Math.min(12, Math.max(1, parseInt(data.jumlahJam, 10) || 4));
  const durasiMenit = Math.max(15, parseInt(data.durasiMenit, 10) || 35);
  const jamMulai = (data.jamMulai || "08:00").trim();
  const adaIstirahat = data.adaIstirahat !== false;
  const setelahJamKe = Math.max(1, parseInt(data.setelahJamKe, 10) || 2);
  const durasiIstirahatMenit = Math.max(5, parseInt(data.durasiIstirahatMenit, 10) || 30);

  let daftarJam = Array.isArray(data.daftarJam) && data.daftarJam.length > 0
    ? data.daftarJam
    : generateDaftarJamKBM({ jumlahJam, durasiMenit, jamMulai, adaIstirahat, setelahJamKe, durasiIstirahatMenit });

  daftarJam = daftarJam.map((d, idx) => ({
    jamKe: d.jamKe,
    label: d.label || (typeof d.jamKe === "number" ? `Jam ${d.jamKe}` : "Istirahat"),
    mulai: d.mulai || "",
    selesai: d.selesai || "",
    waktu: d.waktu || (d.mulai && d.selesai ? `${d.mulai} - ${d.selesai}` : ""),
    durasi: d.durasi || (typeof d.jamKe === "number" ? `${durasiMenit} Menit` : `${durasiIstirahatMenit} Menit`),
  }));

  const payload = {
    jumlahJam,
    durasiMenit,
    jamMulai,
    adaIstirahat,
    setelahJamKe,
    durasiIstirahatMenit,
    daftarJam,
    updatedAt: new Date().toISOString(),
  };

  await query(`
    INSERT INTO "Pengaturan" ("kunci", "nilai")
    VALUES ($1, $2)
    ON CONFLICT ("kunci")
    DO UPDATE SET "nilai" = EXCLUDED."nilai"
  `, ["pengaturan_jam_kbm", JSON.stringify(payload)]);

  return payload;
}

/**
 * Mengambil semua jadwal KBM beserta evaluasi bentrok real-time
 */
async function ambilSemuaJadwalKBM({ tahunAjaran = "2026/2027", semester = "Ganjil" } = {}) {
  const rows = await queryAll(`
    SELECT j.*, k."lokasiKelas", k."waliKelasId", COALESCE(mg."nama", g."nama") AS "namaWaliKelas"
    FROM "JadwalKBM" j
    LEFT JOIN "MasterKelas" k ON j."kelas" = k."nama"
    LEFT JOIN "MasterGuru" mg ON k."waliKelasId" = mg."id"
    LEFT JOIN "Guru" g ON k."waliKelasId" = g."id"
    WHERE j."tahunAjaran" = $1 AND j."semester" = $2
    ORDER BY 
      CASE j."hari"
        WHEN 'Senin' THEN 1
        WHEN 'Selasa' THEN 2
        WHEN 'Rabu' THEN 3
        WHEN 'Kamis' THEN 4
        WHEN 'Jumat' THEN 5
        WHEN 'Sabtu' THEN 6
        ELSE 7
      END,
      j."jamKe" ASC,
      j."kelas" ASC
  `, [tahunAjaran, semester]);

  // Evaluasi bentrok real-time (Cek bila guru yang sama mengajar di lebih dari 1 kelas pada hari & jam yang sama)
  const slotGuruMap = {}; // key: "hari_jamKe_guru" -> array of { kelas, slotId }
  for (const r of rows) {
    const namaGuru = (r.namaGuru || "").trim();
    const kodeGuru = (r.kodeGuru || "").trim();
    const isSpecial = !namaGuru || namaGuru.toUpperCase() === "HALAQOH TAHFIDZ" || namaGuru.toUpperCase() === "PROGRAM UNGGULAN";
    if (isSpecial) continue;

    const guruKey = (kodeGuru || namaGuru).toLowerCase();
    const key = `${r.hari}_${r.jamKe}_${guruKey}`;
    if (!slotGuruMap[key]) slotGuruMap[key] = [];
    slotGuruMap[key].push({ id: r.id, kelas: r.kelas, namaGuru: r.namaGuru, hari: r.hari, jamKe: r.jamKe });
  }

  const bentrokList = [];
  const errorMap = {}; // key: "hari_jamKe_kelas" -> string error

  for (const [key, entries] of Object.entries(slotGuruMap)) {
    if (entries.length > 1) {
      const kelasList = entries.map((e) => e.kelas);
      const errText = `Bentrok: ${entries[0].namaGuru} mengajar di kelas ${kelasList.join(" & ")} pada ${entries[0].hari} Jam ${entries[0].jamKe}`;
      bentrokList.push({
        hari: entries[0].hari,
        jamKe: entries[0].jamKe,
        guru: entries[0].namaGuru,
        kelasList,
        pesan: errText,
      });

      for (const e of entries) {
        const slotKey = `${e.hari}_${e.jamKe}_${e.kelas}`;
        const otherKelas = kelasList.filter((k) => k !== e.kelas).join(", ");
        errorMap[slotKey] = `Bentrok: ${e.namaGuru} sudah mengajar di Kelas ${otherKelas}`;
      }
    }
  }

  const pengaturanJam = await ambilPengaturanJamKBM();
  const jamPelajaran = (pengaturanJam && Array.isArray(pengaturanJam.daftarJam) && pengaturanJam.daftarJam.length > 0)
    ? pengaturanJam.daftarJam
    : JAM_PELAJARAN_MMA;

  return {
    tahunAjaran,
    semester,
    pengaturanJam,
    jamPelajaran,
    totalSlot: rows.length,
    totalBentrok: bentrokList.length,
    bentrokList,
    errorMap,
    slots: rows.map((r) => {
      const slotKey = `${r.hari}_${r.jamKe}_${r.kelas}`;
      const isBentrok = !!errorMap[slotKey];
      return {
        ...r,
        status: isBentrok ? "BENTROK" : "OK",
        keteranganError: errorMap[slotKey] || "",
      };
    }),
  };
}

/**
 * Menyimpan atau memperbarui 1 slot jadwal KBM
 */
async function simpanSlotJadwalKBM({
  hari, jamKe, kelas, kodeMapel, namaMapel, kodeGuru, namaGuru,
  tahunAjaran = "2026/2027", semester = "Ganjil",
}) {
  if (!HARI_VALID.includes(hari)) throw new CashlessError(400, `Hari tidak valid: ${hari}`);
  const jamNum = Number(jamKe);
  if (!Number.isInteger(jamNum) || jamNum < 1 || jamNum > 12) {
    throw new CashlessError(400, `Jam ke tidak valid (harus 1-12): ${jamKe}`);
  }
  if (!kelas || !kelas.trim()) throw new CashlessError(400, "Kelas wajib diisi.");

  const id = uid();
  const cKodeMapel = kodeMapel ? kodeMapel.trim() : null;
  const cNamaMapel = namaMapel ? namaMapel.trim() : null;
  const cKodeGuru = kodeGuru ? kodeGuru.trim() : null;
  const cNamaGuru = namaGuru ? namaGuru.trim() : null;

  await query(`
    INSERT INTO "JadwalKBM" (
      "id", "hari", "jamKe", "kelas", "kodeMapel", "namaMapel", "kodeGuru", "namaGuru",
      "tahunAjaran", "semester", "updatedAt"
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
    ON CONFLICT ("hari", "jamKe", "kelas", "tahunAjaran", "semester")
    DO UPDATE SET
      "kodeMapel" = EXCLUDED."kodeMapel",
      "namaMapel" = EXCLUDED."namaMapel",
      "kodeGuru" = EXCLUDED."kodeGuru",
      "namaGuru" = EXCLUDED."namaGuru",
      "updatedAt" = EXCLUDED."updatedAt"
  `, [id, hari, jamNum, kelas.trim(), cKodeMapel, cNamaMapel, cKodeGuru, cNamaGuru, tahunAjaran, semester]);

  return ambilSemuaJadwalKBM({ tahunAjaran, semester });
}

/**
 * Menyimpan banyak slot sekaligus (Batch Save)
 */
async function simpanBatchJadwalKBM(slots = [], { tahunAjaran = "2026/2027", semester = "Ganjil" } = {}) {
  if (!Array.isArray(slots) || !slots.length) return ambilSemuaJadwalKBM({ tahunAjaran, semester });

  await withTransaction(async (client) => {
    for (const s of slots) {
      if (!HARI_VALID.includes(s.hari)) continue;
      const jamNum = Number(s.jamKe);
      if (!JAM_VALID.includes(jamNum)) continue;
      if (!s.kelas || !s.kelas.trim()) continue;

      const id = uid();
      await client.query(`
        INSERT INTO "JadwalKBM" (
          "id", "hari", "jamKe", "kelas", "kodeMapel", "namaMapel", "kodeGuru", "namaGuru",
          "tahunAjaran", "semester", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )
        ON CONFLICT ("hari", "jamKe", "kelas", "tahunAjaran", "semester")
        DO UPDATE SET
          "kodeMapel" = EXCLUDED."kodeMapel",
          "namaMapel" = EXCLUDED."namaMapel",
          "kodeGuru" = EXCLUDED."kodeGuru",
          "namaGuru" = EXCLUDED."namaGuru",
          "updatedAt" = EXCLUDED."updatedAt"
      `, [
        id, s.hari, jamNum, s.kelas.trim(),
        s.kodeMapel ? s.kodeMapel.trim() : null,
        s.namaMapel ? s.namaMapel.trim() : null,
        s.kodeGuru ? s.kodeGuru.trim() : null,
        s.namaGuru ? s.namaGuru.trim() : null,
        tahunAjaran, semester,
      ]);
    }
  });

  return ambilSemuaJadwalKBM({ tahunAjaran, semester });
}

/**
 * Menghapus/mengosongkan 1 slot
 */
async function hapusSlotJadwalKBM({ hari, jamKe, kelas, tahunAjaran = "2026/2027", semester = "Ganjil" }) {
  await query(`
    DELETE FROM "JadwalKBM"
    WHERE "hari" = $1 AND "jamKe" = $2 AND "kelas" = $3 AND "tahunAjaran" = $4 AND "semester" = $5
  `, [hari, Number(jamKe), kelas, tahunAjaran, semester]);

  return ambilSemuaJadwalKBM({ tahunAjaran, semester });
}

module.exports = {
  HARI_VALID,
  JAM_VALID,
  JAM_PELAJARAN_MMA,
  PENGATURAN_JAM_DEFAULT,
  generateDaftarJamKBM,
  ambilPengaturanJamKBM,
  simpanPengaturanJamKBM,
  ambilSemuaJadwalKBM,
  simpanSlotJadwalKBM,
  simpanBatchJadwalKBM,
  hapusSlotJadwalKBM,
};
