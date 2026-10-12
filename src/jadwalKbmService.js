const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("./db");
const { CashlessError } = require("./cashlessService");

const uid = () => crypto.randomUUID();

const HARI_VALID = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const JAM_VALID = [1, 2, 3, 4];

// Definisi Jam Pelajaran Resmi MMA
const JAM_PELAJARAN_MMA = [
  { jamKe: 1, label: "Jam 1", mulai: "08.00", selesai: "08.35", durasi: "35 Menit" },
  { jamKe: 2, label: "Jam 2", mulai: "08.35", selesai: "09.10", durasi: "35 Menit" },
  { jamKe: "istirahat", label: "Istirahat", mulai: "09.10", selesai: "09.40", durasi: "30 Menit" },
  { jamKe: 3, label: "Jam 3", mulai: "09.40", selesai: "10.15", durasi: "35 Menit" },
  { jamKe: 4, label: "Jam 4", mulai: "10.15", selesai: "10.50", durasi: "35 Menit" },
];

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

  return {
    tahunAjaran,
    semester,
    jamPelajaran: JAM_PELAJARAN_MMA,
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
  if (!JAM_VALID.includes(jamNum)) throw new CashlessError(400, `Jam ke tidak valid (harus 1-4): ${jamKe}`);
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
  ambilSemuaJadwalKBM,
  simpanSlotJadwalKBM,
  simpanBatchJadwalKBM,
  hapusSlotJadwalKBM,
};
