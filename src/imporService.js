const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { query, queryOne, queryAll, withTransaction } = require("./db");
const { CashlessError, getSantriRow, SANTRI_BIODATA_FIELDS } = require("./cashlessService");
const XLSX = require("xlsx");

const uid = () => crypto.randomUUID();

function generateRandomPassword(length = 8) {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let pass = "";
  for (let i = 0; i < length; i++) {
    pass += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return pass;
}

function sanitizeUsername(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, 30);
}

const INDONESIA_BULAN_MAP = {
  januari: "01", jan: "01",
  februari: "02", febuari: "02", feb: "02",
  maret: "03", mar: "03",
  april: "04", apr: "04",
  mei: "05", may: "05",
  juni: "06", jun: "06",
  juli: "07", jul: "07",
  agustus: "08", ags: "08", agust: "08",
  september: "09", septermer: "09", sep: "09", sept: "09",
  oktober: "10", okt: "10", oct: "10",
  november: "11", nopember: "11", nov: "11",
  desember: "12", des: "12", dec: "12",
};

function parseTTL(rawStr) {
  if (!rawStr || typeof rawStr !== "string") return { tempatLahir: "", tanggalLahir: "" };
  const str = rawStr.trim();
  if (!str) return { tempatLahir: "", tanggalLahir: "" };

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return { tempatLahir: "", tanggalLahir: str };
  }

  const pureDmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (pureDmy) {
    const d = pureDmy[1].padStart(2, "0");
    const m = pureDmy[2].padStart(2, "0");
    const y = pureDmy[3];
    return { tempatLahir: "", tanggalLahir: `${y}-${m}-${d}` };
  }

  const dmyEndMatch = str.match(/^(.*?)(?:,\s*|\s+)(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyEndMatch) {
    const tempat = dmyEndMatch[1].replace(/,/g, "").trim();
    const d = dmyEndMatch[2].padStart(2, "0");
    const m = dmyEndMatch[3].padStart(2, "0");
    const y = dmyEndMatch[4];
    return { tempatLahir: tempat, tanggalLahir: `${y}-${m}-${d}` };
  }

  const textDateMatch = str.match(/^(.*?)(?:,\s*|\s+)(\d{1,2})[a-zA-Z]?\s+([a-zA-Z]+)\s+(\d{4})$/);
  if (textDateMatch) {
    const tempat = textDateMatch[1].replace(/,/g, "").trim();
    const d = textDateMatch[2].padStart(2, "0");
    const bulanKey = textDateMatch[3].toLowerCase();
    const y = textDateMatch[4];
    const m = INDONESIA_BULAN_MAP[bulanKey];
    if (m) {
      return { tempatLahir: tempat, tanggalLahir: `${y}-${m}-${d}` };
    }
  }

  const monthYearMatch = str.match(/^(.*?)(?:,\s*|\s+)([a-zA-Z]+)\s+(\d{4})$/);
  if (monthYearMatch) {
    const bulanKey = monthYearMatch[2].toLowerCase();
    const m = INDONESIA_BULAN_MAP[bulanKey];
    if (m) {
      const tempat = monthYearMatch[1].replace(/,/g, "").trim();
      const y = monthYearMatch[3];
      return { tempatLahir: tempat, tanggalLahir: `${y}-${m}-01` };
    }
  }

  return { tempatLahir: str, tanggalLahir: "" };
}

function sanitizeNIK(val) {
  if (val === undefined || val === null) return null;
  const cleaned = String(val).replace(/['"\s\-]/g, "").trim();
  if (!cleaned || /tidak|ada|alm/i.test(cleaned)) return null;
  if (/^\d+$/.test(cleaned)) return cleaned;
  return null;
}

function normalizeStatusSantri(rawStatus, nama = "") {
  if (nama && /\(\s*ALM\s*\)/i.test(nama)) return "Wafat";
  if (!rawStatus || typeof rawStatus !== "string") return "Aktif";
  const s = rawStatus.trim().toLowerCase();
  if (s.includes("alumni") || s.includes("lulus") || s.includes("tamat")) return "Alumni";
  if (s.includes("keluar") || s.includes("pindah") || s.includes("mutasi") || s.includes("mundur") || s.includes("berhenti")) return "Keluar";
  if (s.includes("wafat") || s.includes("alm") || s.includes("meninggal")) return "Wafat";
  if (s.includes("aktif")) return "Aktif";
  return "Aktif";
}

function validTanggal(isoStr) {
  if (!isoStr || typeof isoStr !== "string") return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(isoStr.trim());
}

function normalisasiTanggal(str) {
  if (!str || typeof str !== "string") return "";
  const s = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, "0");
    const m = dmyMatch[2].padStart(2, "0");
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }
  const parsed = parseTTL(s);
  if (parsed.tanggalLahir) return parsed.tanggalLahir;
  return s;
}

function buatTemplateImporCSV() {
  const headers = [
    "nama", "nis", "nisn", "kelas", "jenisKelamin", "nik",
    "tempatLahir", "tanggalLahir", "alamat", "asrama",
    "namaWali", "hpWali", "namaAyah", "nikAyah", "namaIbu", "nikIbu", "angkatan", "tahunMasuk", "status"
  ];
  const contohBaris1 = [
    "Ahmad Ridwan", "1001", "0012345678", "7A", "L", "3201012345670001",
    "Jakarta", "2012-05-15", "Jl. Pondok Pesantren No. 1, RT 01/RW 02", "Asrama Sunan Giri",
    "Bpk. Ridwan", "081234567890", "H. Ridwan Abdullah", "3201011122330001", "Hj. Siti Aminah", "3201014455660002", "1", "2018", "Aktif"
  ];
  const contohBaris2 = [
    "Siti Fatimah", "1002", "0087654321", "7B", "P", "3202022345670002",
    "Surabaya", "2012-08-20", "Jl. Pesantren No. 5, Surabaya", "Asrama Khadijah",
    "Ibu Fatimah", "081987654321", "Bpk. Ahmad Fauzi", "3202021122330003", "Ibu Fatimah Zahra", "3202024455660004", "1", "2018", "Aktif"
  ];
  const contohBaris3 = [
    "Muhammad Farhan", "1003", "0091122334", "8A", "L", "3203032345670003",
    "Bandung", "2011-11-10", "Jl. Al-Falah No. 17, Bandung", "Asrama Imam Nawawi",
    "Bpk. Hendra Gunawan", "082133445566", "Hendra Gunawan", "3203031122330005", "Dewi Sartika", "3203034455660006", "2", "2019", "Alumni"
  ];

  const toCSVRow = (arr) => arr.map((item) => `"${String(item).replace(/"/g, '""')}"`).join(",");
  return "\uFEFF" + [headers.join(","), toCSVRow(contohBaris1), toCSVRow(contohBaris2), toCSVRow(contohBaris3)].join("\r\n") + "\r\n";
}

function buatTemplateImporExcelBuffer() {
  const headers = [
    "nama", "nis", "nisn", "kelas", "jenisKelamin", "nik",
    "tempatLahir", "tanggalLahir", "alamat", "asrama",
    "namaWali", "hpWali", "namaAyah", "nikAyah", "namaIbu", "nikIbu", "angkatan", "tahunMasuk", "status"
  ];
  const data = [
    headers,
    [
      "Ahmad Ridwan", "1001", "0012345678", "7A", "L", "3201012345670001",
      "Jakarta", "2012-05-15", "Jl. Pondok Pesantren No. 1, RT 01/RW 02", "Asrama Sunan Giri",
      "Bpk. Ridwan", "081234567890", "H. Ridwan Abdullah", "3201011122330001", "Hj. Siti Aminah", "3201014455660002", "1", "2018", "Aktif"
    ],
    [
      "Siti Fatimah", "1002", "0087654321", "7B", "P", "3202022345670002",
      "Surabaya", "2012-08-20", "Jl. Pesantren No. 5, Surabaya", "Asrama Khadijah",
      "Ibu Fatimah", "081987654321", "Bpk. Ahmad Fauzi", "3202021122330003", "Ibu Fatimah Zahra", "3202024455660004", "1", "2018", "Aktif"
    ],
    [
      "Muhammad Farhan", "1003", "0091122334", "8A", "L", "3203032345670003",
      "Bandung", "2011-11-10", "Jl. Al-Falah No. 17, Bandung", "Asrama Imam Nawawi",
      "Bpk. Hendra Gunawan", "082133445566", "Hendra Gunawan", "3203031122330005", "Dewi Sartika", "3203034455660006", "2", "2019", "Alumni"
    ]
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);

  ws["!cols"] = [
    { wch: 25 }, // nama
    { wch: 12 }, // nis
    { wch: 15 }, // nisn
    { wch: 10 }, // kelas
    { wch: 14 }, // jenisKelamin
    { wch: 20 }, // nik
    { wch: 18 }, // tempatLahir
    { wch: 15 }, // tanggalLahir
    { wch: 38 }, // alamat
    { wch: 22 }, // asrama
    { wch: 24 }, // namaWali
    { wch: 18 }, // hpWali
    { wch: 24 }, // namaAyah
    { wch: 20 }, // nikAyah
    { wch: 24 }, // namaIbu
    { wch: 20 }, // nikIbu
    { wch: 10 }, // angkatan
    { wch: 12 }, // tahunMasuk
    { wch: 12 }, // status
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Data Santri");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

async function prosesDryRunImpor(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new CashlessError(400, "Data impor kosong. Sediakan minimal satu baris data.");
  }

  const rowsValid = rows.filter((r) => {
    if (!r) return false;
    const values = Object.values(r).map((v) => String(v || "").trim()).filter(Boolean);
    return values.length > 0;
  });

  if (!rowsValid.length) {
    throw new CashlessError(400, "Data impor kosong. Sediakan minimal satu baris data.");
  }

  const detailGagal = [];
  const nisInBatch = new Set();
  const nisnInBatch = new Set();
  let jumlahValid = 0;

  for (let i = 0; i < rowsValid.length; i++) {
    const baris = rowsValid[i] || {};
    const noBaris = i + 1;
    const pesans = [];

    const nama = (baris.nama || baris["NAMA LENGKAP"] || baris["NAMA"] || "").trim();
    const stambuk = String(baris.noStambuk || baris["No. STAMBUK"] || baris["NO. STAMBUK"] || baris["No Stambuk"] || baris["NO STAMBUK"] || baris.stambuk || baris.nis || "").trim();
    const nis = stambuk;
    const nisn = (baris.nisn || baris["NISN"] || "").trim();
    const angkatan = baris.angkatan || baris["ANGKATAN"] ? Number(baris.angkatan || baris["ANGKATAN"]) : null;
    const rawKelas = (baris.kelas || baris["KELAS"] || "").trim();
    const kelas = rawKelas || (angkatan ? `Angkatan ${angkatan}` : "Belum Ditentukan");

    let jenisKelamin = (baris.jenisKelamin || baris["JK"] || baris["JENIS KELAMIN"] || "").trim().toUpperCase();
    if (jenisKelamin.startsWith("L") || jenisKelamin.includes("LAKI")) jenisKelamin = "L";
    else if (jenisKelamin.startsWith("P") || jenisKelamin.includes("PEREMPUAN")) jenisKelamin = "P";

    const rawTTL = (baris.ttl || baris["TTL"] || "").trim();
    let rawTanggal = (baris.tanggalLahir || "").trim();
    if (!rawTanggal && rawTTL) {
      const parsed = parseTTL(rawTTL);
      rawTanggal = parsed.tanggalLahir;
    }
    const tanggalLahir = normalisasiTanggal(rawTanggal);

    if (!nama) pesans.push("Nama santri wajib diisi");
    if (!nis) pesans.push("Nomor Stambuk / NIS wajib diisi");

    if (jenisKelamin && !["L", "P", "LAKI-LAKI", "PEREMPUAN"].includes(jenisKelamin)) {
      pesans.push("Jenis kelamin harus 'L', 'P', 'Laki-laki', atau 'Perempuan'");
    }

    if (tanggalLahir && !validTanggal(tanggalLahir)) {
      pesans.push("Format tanggal lahir harus YYYY-MM-DD");
    }

    if (nis) {
      if (nisInBatch.has(nis)) {
        pesans.push(`Nomor Stambuk / NIS '${nis}' duplikat dalam berkas impor ini`);
      } else {
        nisInBatch.add(nis);
      }
    }

    if (nisn) {
      if (nisnInBatch.has(nisn)) {
        pesans.push(`NISN '${nisn}' duplikat dalam berkas impor ini`);
      } else {
        nisnInBatch.add(nisn);
      }
    }

    if (pesans.length) {
      detailGagal.push({ baris: noBaris, nama: nama || "(Kosong)", nis, alasan: pesans.join("; ") });
    } else {
      jumlahValid++;
    }
  }

  const existingNis = await queryAll('SELECT "nis", "noStambuk" FROM "Santri" WHERE ("nis" IS NOT NULL AND "nis" != \'\') OR ("noStambuk" IS NOT NULL AND "noStambuk" != \'\')');
  const existingNisSet = new Set(existingNis.map((r) => r.noStambuk || r.nis).filter(Boolean));
  const existingNisn = await queryAll('SELECT "nisn" FROM "Santri" WHERE "nisn" IS NOT NULL AND "nisn" != \'\'');
  const existingNisnSet = new Set(existingNisn.map((r) => r.nisn).filter(Boolean));

  const updateList = [];
  const baruList = [];

  for (let i = 0; i < rowsValid.length; i++) {
    const baris = rowsValid[i] || {};
    const stambuk = String(baris.noStambuk || baris["No. STAMBUK"] || baris["NO. STAMBUK"] || baris["No Stambuk"] || baris["NO STAMBUK"] || baris.stambuk || baris.nis || "").trim();
    const nisn = (baris.nisn || baris["NISN"] || "").trim();
    if (!stambuk) continue;
    if (existingNisSet.has(stambuk) || (nisn && existingNisnSet.has(nisn))) {
      updateList.push(stambuk);
    } else {
      baruList.push(stambuk);
    }
  }

  return {
    valid: detailGagal.length === 0,
    totalBaris: rowsValid.length,
    jumlahValid,
    jumlahGagal: detailGagal.length,
    jumlahBaru: baruList.length,
    jumlahUpdate: updateList.length,
    detailGagal,
  };
}

async function eksekusiImporBatch({ namaBatch, rows, aktorId, aktorNama }) {
  const rowsValid = (rows || []).filter((r) => {
    if (!r) return false;
    const values = Object.values(r).map((v) => String(v || "").trim()).filter(Boolean);
    return values.length > 0;
  });

  const validation = await prosesDryRunImpor(rowsValid);
  if (!validation.valid) {
    throw new CashlessError(400, `Validasi impor gagal pada ${validation.jumlahGagal} baris data.`, { detailGagal: validation.detailGagal });
  }

  return withTransaction(async () => {
    const batchId = uid();
    await query(
      'INSERT INTO "BatchImpor" ("id", "namaBatch", "sumber", "jumlahSantri", "jumlahWali", "status", "dibuatOleh") VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [batchId, namaBatch || `Impor ${new Date().toISOString().slice(0, 10)}`, "excel", rowsValid.length, 0, "Berhasil", aktorNama || null],
    );

    const daftarKredensialAwal = [];
    let waliBaruCount = 0;
    const waliByNikMap = new Map();

    for (const baris of rowsValid) {
      const nama = (baris.nama || baris["NAMA LENGKAP"] || baris["NAMA"] || "").trim();
      const stambuk = String(baris.noStambuk || baris["No. STAMBUK"] || baris["NO. STAMBUK"] || baris["No Stambuk"] || baris["NO STAMBUK"] || baris.stambuk || baris.nis || "").trim();
      const nis = stambuk;
      const nisn = (baris.nisn || baris["NISN"] || "").trim() || null;
      const angkatan = baris.angkatan || baris["ANGKATAN"] ? Number(baris.angkatan || baris["ANGKATAN"]) : null;
      const tahunMasuk = (baris.tahunMasuk || baris["PPSB TAHUN"] || baris.ppsbTahun || "").trim() || null;
      const rawKelas = (baris.kelas || baris["KELAS"] || "").trim();
      const kelas = rawKelas || (angkatan ? `Angkatan ${angkatan}` : "Belum Ditentukan");

      const nikSantri = sanitizeNIK(baris.nik || baris["NIK"] || baris["NIK SANTRI"] || baris["nikSantri"]);
      const namaAyah = (baris.namaAyah || baris["NAMA AYAH"] || baris["Nama Ayah"] || baris["nama_ayah"] || baris["NAMA AYAH KANDUNG"] || baris.ayah || "").trim() || null;
      const nikAyah = sanitizeNIK(baris.nikAyah || baris["NIK AYAH"] || baris["NIK Ayah"] || baris["nik_ayah"]);
      const namaIbu = (baris.namaIbu || baris["NAMA IBU"] || baris["Nama Ibu"] || baris["nama_ibu"] || baris["NAMA IBU KANDUNG"] || baris.ibu || "").trim() || null;
      const nikIbu = sanitizeNIK(baris.nikIbu || baris["NIK IBU"] || baris["NIK Ibu"] || baris["nik_ibu"]);
      const alamat = (baris.alamat || baris["ALAMAT"] || "").trim() || null;

      let jk = (baris.jenisKelamin || baris["JK"] || baris["JENIS KELAMIN"] || "").trim().toUpperCase();
      if (jk.startsWith("L") || jk.includes("LAKI")) jk = "L";
      else if (jk.startsWith("P") || jk.includes("PEREMPUAN")) jk = "P";

      const rawTTL = (baris.ttl || baris["TTL"] || "").trim();
      let tempatLahir = (baris.tempatLahir || "").trim();
      let tanggalLahir = (baris.tanggalLahir || "").trim();
      if (rawTTL) {
        const parsed = parseTTL(rawTTL);
        if (!tempatLahir && parsed.tempatLahir) tempatLahir = parsed.tempatLahir;
        if (!tanggalLahir && parsed.tanggalLahir) tanggalLahir = parsed.tanggalLahir;
      }
      tanggalLahir = normalisasiTanggal(tanggalLahir) || null;
      tempatLahir = tempatLahir || null;

      const rawStatus = baris.statusSantri || baris.status || baris["STATUS"] || baris["STATUS SANTRI"] || "";
      const statusSantri = normalizeStatusSantri(rawStatus, nama);

      const namaWaliRaw = (baris.namaWali || namaAyah || namaIbu || "").trim();
      const hpWali = (baris.hpWali || baris.noDarurat || "").trim() || null;

      // ---- Family Clustering & Wali Deduplication ----
      let waliId = null;
      if (nikAyah && waliByNikMap.has(nikAyah)) {
        waliId = waliByNikMap.get(nikAyah);
      } else if (nikIbu && waliByNikMap.has(nikIbu)) {
        waliId = waliByNikMap.get(nikIbu);
      }

      if (!waliId && (nikAyah || nikIbu)) {
        let existingWali = null;
        if (nikAyah) {
          existingWali = await queryOne('SELECT "id" FROM "Wali" WHERE "nik" = $1 OR "nikAyah" = $1', [nikAyah]);
        }
        if (!existingWali && nikIbu) {
          existingWali = await queryOne('SELECT "id" FROM "Wali" WHERE "nik" = $1 OR "nikIbu" = $1', [nikIbu]);
        }
        if (existingWali) {
          waliId = existingWali.id;
          if (nikAyah) waliByNikMap.set(nikAyah, waliId);
          if (nikIbu) waliByNikMap.set(nikIbu, waliId);
        }
      }

      if (!waliId && namaWaliRaw) {
        let existingWali = await queryOne('SELECT * FROM "Wali" WHERE "nama" = $1 AND ("hp" = $2 OR "hp" IS NULL)', [namaWaliRaw, hpWali]);
        if (existingWali) {
          waliId = existingWali.id;
          if (nikAyah) waliByNikMap.set(nikAyah, waliId);
          if (nikIbu) waliByNikMap.set(nikIbu, waliId);
        } else {
          const usernameBase = `wali.${stambuk || sanitizeUsername(namaWaliRaw)}`;
          let username = usernameBase;
          let counter = 1;
          while (await queryOne('SELECT "id" FROM "Wali" WHERE "username" = $1', [username])) {
            username = `${usernameBase}.${counter++}`;
          }

          const rawPass = generateRandomPassword(8);
          const hashPass = await bcrypt.hash(rawPass, 10);
          waliId = uid();
          const namaFinalWali = namaWaliRaw || namaAyah || namaIbu || `Wali ${nama}`;

          await query(
            'INSERT INTO "Wali" ("id", "nama", "hp", "nik", "nikAyah", "nikIbu", "namaAyah", "namaIbu", "username", "password", "mustChangePassword", "statusAkun", "importBatchId") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, \'Belum Aktivasi\', $11)',
            [waliId, namaFinalWali, hpWali, nikAyah || nikIbu || null, nikAyah, nikIbu, namaAyah, namaIbu, username, hashPass, batchId],
          );

          waliBaruCount++;
          if (nikAyah) waliByNikMap.set(nikAyah, waliId);
          if (nikIbu) waliByNikMap.set(nikIbu, waliId);
          daftarKredensialAwal.push({ waliId, namaWali: namaFinalWali, username, passwordAwal: rawPass, santriNama: nama, kelas });
        }
      }

      const existingSantri = await queryOne(
        'SELECT * FROM "Santri" WHERE ("noStambuk" IS NOT NULL AND "noStambuk" = $1) OR ("nis" IS NOT NULL AND "nis" = $1) OR ("nisn" IS NOT NULL AND "nisn" = $2)',
        [stambuk, nisn]
      );
      const santriId = existingSantri ? existingSantri.id : uid();

      const biodataToSet = {
        noStambuk: stambuk,
        statusSantri,
      };
      if (angkatan) biodataToSet.angkatan = angkatan;
      if (tahunMasuk) biodataToSet.tahunMasuk = tahunMasuk;
      if (nikSantri) biodataToSet.nik = nikSantri;
      if (namaAyah) biodataToSet.namaAyah = namaAyah;
      if (nikAyah) biodataToSet.nikAyah = nikAyah;
      if (namaIbu) biodataToSet.namaIbu = namaIbu;
      if (nikIbu) biodataToSet.nikIbu = nikIbu;
      if (alamat) biodataToSet.alamat = alamat;
      if (tempatLahir) biodataToSet.tempatLahir = tempatLahir;
      if (tanggalLahir) biodataToSet.tanggalLahir = tanggalLahir;
      if (jk) biodataToSet.jenisKelamin = jk;

      for (const field of SANTRI_BIODATA_FIELDS) {
        if (field in baris && baris[field] !== undefined && baris[field] !== null && String(baris[field]).trim() !== "") {
          let val = String(baris[field]).trim();
          if (field === "tanggalLahir") val = normalisasiTanggal(val);
          if (field === "jenisKelamin") {
            const up = val.toUpperCase();
            if (up.startsWith("L") || up.includes("LAKI")) val = "L";
            else if (up.startsWith("P") || up.includes("PEREMPUAN")) val = "P";
          }
          biodataToSet[field] = val;
        }
      }

      if (existingSantri) {
        const sets = ['"nama" = $1', '"kelas" = $2', '"nis" = $3', '"importBatchId" = $4'];
        const values = [nama, kelas, stambuk, batchId];

        if (nisn) { sets.push(`"nisn" = $${values.length + 1}`); values.push(nisn); }
        if (waliId) { sets.push(`"waliId" = $${values.length + 1}`); values.push(waliId); }

        for (const [key, val] of Object.entries(biodataToSet)) {
          sets.push(`"${key}" = $${values.length + 1}`);
          values.push(val);
        }

        values.push(santriId);
        await query(`UPDATE "Santri" SET ${sets.join(", ")} WHERE "id" = $${values.length}`, values);
      } else {
        const cols = ["id", "nama", "kelas", "nis", "nisn", "waliId", "saldo", "importBatchId", ...Object.keys(biodataToSet)];
        const vals = [santriId, nama, kelas, stambuk, nisn, waliId, 0, batchId, ...Object.values(biodataToSet)];
        await query(
          `INSERT INTO "Santri" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${vals.map((_, idx) => `$${idx + 1}`).join(", ")})`,
          vals,
        );
      }
    }

    await query('UPDATE "BatchImpor" SET "jumlahWali" = $1 WHERE "id" = $2', [waliBaruCount, batchId]);

    await query(
      `INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
       VALUES ($1, $2, 'guru', 'impor.batch_executed', 'BatchImpor', $3, $4::jsonb)`,
      [uid(), aktorId || null, batchId, JSON.stringify({ namaBatch, jumlahSantri: rowsValid.length, jumlahWaliBaru: waliBaruCount })],
    );

    return {
      batchId,
      totalSantri: rowsValid.length,
      totalWaliBaru: waliBaruCount,
      daftarKredensialAwal,
    };
  });
}

async function rollbackBatchImpor(batchId, aktorId) {
  return withTransaction(async () => {
    const batch = await queryOne('SELECT * FROM "BatchImpor" WHERE "id" = $1 FOR UPDATE', [batchId]);
    if (!batch) throw new CashlessError(404, "Batch impor tidak ditemukan.");

    const santriBatch = await queryAll('SELECT "id" FROM "Santri" WHERE "importBatchId" = $1', [batchId]);
    const ids = santriBatch.map((s) => s.id);

    if (ids.length) {
      await query('DELETE FROM "Absensi" WHERE "santriId" = ANY($1::text[])', [ids]);
      await query('DELETE FROM "Perizinan" WHERE "santriId" = ANY($1::text[])', [ids]);
      await query('DELETE FROM "Pelanggaran" WHERE "santriId" = ANY($1::text[])', [ids]);
      await query('DELETE FROM "Nilai" WHERE "santriId" = ANY($1::text[])', [ids]);
      await query('DELETE FROM "Prestasi" WHERE "santriId" = ANY($1::text[])', [ids]);
      await query('DELETE FROM "Hafalan" WHERE "santriId" = ANY($1::text[])', [ids]);
      await query('DELETE FROM "PenilaianUbudiyah" WHERE "santriId" = ANY($1::text[])', [ids]);
      await query('DELETE FROM "Tagihan" WHERE "santriId" = ANY($1::text[])', [ids]);
      await query('DELETE FROM "Ledger" WHERE "santriId" = ANY($1::text[])', [ids]);
      await query('DELETE FROM "TransaksiCashless" WHERE "santriId" = ANY($1::text[])', [ids]);
      await query('DELETE FROM "PermintaanBMT" WHERE "santriId" = ANY($1::text[])', [ids]);
      await query('DELETE FROM "FaceTemplate" WHERE "santriId" = ANY($1::text[])', [ids]);
      await query('DELETE FROM "LogPin" WHERE "santriId" = ANY($1::text[])', [ids]);
      await query('DELETE FROM "QueueOfflineKasir" WHERE "santriId" = ANY($1::text[])', [ids]);
      await query('DELETE FROM "Santri" WHERE "importBatchId" = $1', [batchId]);
    }

    await query('DELETE FROM "Wali" WHERE "importBatchId" = $1', [batchId]);
    await query('UPDATE "BatchImpor" SET "status" = \'Di-rollback\' WHERE "id" = $1', [batchId]);

    await query(
      `INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
       VALUES ($1, $2, 'guru', 'impor.batch_rolled_back', 'BatchImpor', $3, '{}'::jsonb)`,
      [uid(), aktorId || null, batchId],
    );

    return { batchId, rolledBack: true };
  });
}

async function provisionAkunWali({ santriIds, batchId, aktorId }) {
  return withTransaction(async () => {
    let santris = [];
    if (Array.isArray(santriIds) && santriIds.length) {
      santris = await queryAll('SELECT * FROM "Santri" WHERE "id" = ANY($1::text[])', [santriIds]);
    } else if (batchId) {
      santris = await queryAll('SELECT * FROM "Santri" WHERE "importBatchId" = $1', [batchId]);
    } else {
      santris = await queryAll('SELECT * FROM "Santri" WHERE "waliId" IS NULL OR "waliId" IN (SELECT "id" FROM "Wali" WHERE "mustChangePassword" = TRUE)');
    }

    const hasilCredentials = [];
    let diprosesCount = 0;

    for (const santri of santris) {
      let wali = santri.waliId ? await queryOne('SELECT * FROM "Wali" WHERE "id" = $1', [santri.waliId]) : null;

      if (!wali) {
        const namaWali = santri.namaAyah || santri.namaIbu || `Wali ${santri.nama}`;
        const usernameBase = `wali.${santri.nis || sanitizeUsername(santri.nama)}`;
        let username = usernameBase;
        let counter = 1;
        while (await queryOne('SELECT "id" FROM "Wali" WHERE "username" = $1', [username])) {
          username = `${usernameBase}.${counter++}`;
        }

        const rawPass = generateRandomPassword(8);
        const hashPass = await bcrypt.hash(rawPass, 10);
        const newWaliId = uid();

        await query(
          'INSERT INTO "Wali" ("id", "nama", "hp", "username", "password", "mustChangePassword", "statusAkun") VALUES ($1, $2, $3, $4, $5, TRUE, \'Belum Aktivasi\')',
          [newWaliId, namaWali, santri.noDarurat || null, username, hashPass],
        );

        await query('UPDATE "Santri" SET "waliId" = $1 WHERE "id" = $2', [newWaliId, santri.id]);
        diprosesCount++;
        hasilCredentials.push({ waliId: newWaliId, namaWali, username, passwordAwal: rawPass, santriNama: santri.nama, kelas: santri.kelas });
      } else if (wali.mustChangePassword) {
        const rawPass = generateRandomPassword(8);
        const hashPass = await bcrypt.hash(rawPass, 10);
        await query('UPDATE "Wali" SET "password" = $1, "mustChangePassword" = TRUE, "statusAkun" = \'Belum Aktivasi\' WHERE "id" = $2', [hashPass, wali.id]);
        diprosesCount++;
        hasilCredentials.push({ waliId: wali.id, namaWali: wali.nama, username: wali.username, passwordAwal: rawPass, santriNama: santri.nama, kelas: santri.kelas });
      }
    }

    await query(
      `INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
       VALUES ($1, $2, 'guru', 'wali.accounts_provisioned', 'WaliBatch', NULL, $3::jsonb)`,
      [uid(), aktorId || null, JSON.stringify({ diprosesCount })],
    );

    return { diprosesCount, hasilCredentials };
  });
}

async function tautkanAnakKeWali({ santriId, waliId, aktorId }) {
  return withTransaction(async () => {
    const santri = await getSantriRow(santriId);
    const wali = await queryOne('SELECT "id", "nama" FROM "Wali" WHERE "id" = $1', [waliId]);
    if (!wali) throw new CashlessError(404, "Data wali tidak ditemukan.");

    await query('UPDATE "Santri" SET "waliId" = $1 WHERE "id" = $2', [waliId, santriId]);

    await query(
      `INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
       VALUES ($1, $2, 'guru', 'sekretariat.sibling_linked', 'Santri', $3, $4::jsonb)`,
      [uid(), aktorId || null, santriId, JSON.stringify({ waliId, waliNama: wali.nama, santriNama: santri.nama })],
    );

    return { santriId, waliId, waliNama: wali.nama };
  });
}

async function rekonsiliasiSaldoDanTagihan({ batchId, tipe, items, totalKasTarget, aktorId, dicatatOleh }) {
  if (!batchId || !tipe || !Array.isArray(items) || !items.length) {
    throw new CashlessError(400, "Parameter batchId, tipe, dan item impor wajib diisi.");
  }

  const totalInput = items.reduce((acc, curr) => acc + Number(curr.nominal || curr.jumlah || 0), 0);
  const target = Number(totalKasTarget || 0);
  const selisih = totalInput - target;
  const status = selisih === 0 ? "Cocok" : "Tidak Cocok";

  if (selisih !== 0) {
    throw new CashlessError(400, `Rekonsiliasi gagal: Total input (Rp ${totalInput.toLocaleString("id-ID")}) tidak cocok dengan target kas/bank (Rp ${target.toLocaleString("id-ID")}). Selisih: Rp ${selisih.toLocaleString("id-ID")}. Impor ditolak.`);
  }

  return withTransaction(async () => {
    const rekonId = uid();
    await query(
      'INSERT INTO "RekonsiliasiImpor" ("id", "batchId", "tipe", "totalNominalInput", "totalNominalTerproses", "jumlahRecord", "selisih", "status", "catatan") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [rekonId, batchId, tipe, totalInput, totalInput, items.length, 0, status, dicatatOleh || null],
    );

    if (tipe === "Saldo Awal Cashless") {
      for (const item of items) {
        if (!item.santriId && !item.nis) continue;
        const santriBase = item.santriId
          ? await getSantriRow(item.santriId)
          : await queryOne('SELECT "id" FROM "Santri" WHERE "nis" = $1', [item.nis]);
        if (santriBase) {
          const santri = await queryOne('SELECT "id", "saldo" FROM "Santri" WHERE "id" = $1 FOR UPDATE', [santriBase.id]);
          const nominal = Number(item.nominal || item.jumlah || 0);
          const saldoSekarang = Number(santri?.saldo || 0);
          const saldoBaru = saldoSekarang + nominal;

          await query(
            `INSERT INTO "Ledger" ("id", "santriId", "jenis", "jumlah", "saldoSetelah", "referensi", "pelaku", "waktu")
             VALUES ($1, $2, 'Saldo Awal', $3, $4, $5, $6, $7)`,
            [uid(), santri.id, nominal, saldoBaru, `Batch ${batchId}`, dicatatOleh || aktorId || "sistem", new Date().toISOString()]
          );

          await query('UPDATE "Santri" SET "saldo" = $1 WHERE "id" = $2', [saldoBaru, santri.id]);
          await query(
            'INSERT INTO "TransaksiCashless" ("id", "santriId", "unit", "jenis", "jumlah", "saldoSetelah", "saldoSebelum", "saldoSesudah", "tanggalISO", "tanggalLabel", "bulan", "keterangan") VALUES ($1, $2, \'BMT\', \'Kredit\', $3, $4, $5, $6, $7, $8, $9, $10)',
            [uid(), santri.id, nominal, saldoBaru, saldoSekarang, saldoBaru, new Date().toISOString().slice(0, 10), new Date().toLocaleDateString("id-ID"), new Date().toISOString().slice(0, 7), `Saldo Awal Batch ${batchId}`],
          );
        }
      }
    }

    await query(
      `INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
       VALUES ($1, $2, 'guru', 'impor.reconciliation_recorded', 'RekonsiliasiImpor', $3, $4::jsonb)`,
      [uid(), aktorId || null, rekonId, JSON.stringify({ batchId, tipe, totalInput, status })],
    );

    return { id: rekonId, batchId, tipe, totalInput, totalRecords: items.length, status: "Cocok" };
  });
}

async function kelengkapanDataSekretariat() {
  const santriList = await queryAll('SELECT "id", "nama", "kelas", "nis", "nisn", "waliId", "foto" FROM "Santri"');
  const waliList = await queryAll('SELECT "id", "mustChangePassword", "statusAkun" FROM "Wali"');
  const waliMap = new Map(waliList.map((w) => [w.id, w]));

  const perKelasMap = new Map();

  for (const s of santriList) {
    const k = s.kelas || "Belum ditentukan";
    if (!perKelasMap.has(k)) {
      perKelasMap.set(k, { kelas: k, total: 0, adaWali: 0, waliAktif: 0, adaFoto: 0, adaNisn: 0, dataLengkap: 0 });
    }
    const stat = perKelasMap.get(k);
    stat.total++;

    const wali = s.waliId ? waliMap.get(s.waliId) : null;
    if (s.waliId) stat.adaWali++;
    if (wali && (!wali.mustChangePassword || wali.statusAkun === "Aktif")) stat.waliAktif++;
    if (s.foto && s.foto.trim() !== "") stat.adaFoto++;
    if (s.nisn && s.nisn.trim() !== "") stat.adaNisn++;

    if (s.waliId && s.nisn && s.foto) stat.dataLengkap++;
  }

  const perKelas = Array.from(perKelasMap.values()).map((st) => ({
    ...st,
    persenWali: st.total ? Math.round((st.adaWali / st.total) * 100) : 0,
    persenWaliAktif: st.total ? Math.round((st.waliAktif / st.total) * 100) : 0,
    persenFoto: st.total ? Math.round((st.adaFoto / st.total) * 100) : 0,
    persenDataLengkap: st.total ? Math.round((st.dataLengkap / st.total) * 100) : 0,
  }));

  const santriBelumLengkap = santriList
    .filter((s) => !s.waliId || !s.nisn || !s.foto)
    .map((s) => ({ id: s.id, nama: s.nama, kelas: s.kelas, belumWali: !s.waliId, belumNisn: !s.nisn, belumFoto: !s.foto }));

  const waliBelumAktivasi = waliList
    .filter((w) => w.mustChangePassword || w.statusAkun === "Belum Aktivasi")
    .map((w) => ({ id: w.id }));

  return {
    totalSantri: santriList.length,
    totalWali: waliList.length,
    perKelas,
    santriBelumLengkapLimit: santriBelumLengkap.slice(0, 50),
    totalSantriBelumLengkap: santriBelumLengkap.length,
    totalWaliBelumAktivasi: waliBelumAktivasi.length,
  };
}

async function bersihkanDataDemo({ konfirmasi, aktorId }) {
  if (konfirmasi !== true) {
    throw new CashlessError(400, "Konfirmasi pembersihan data demo wajib disetujui (konfirmasi = true).");
  }

  return withTransaction(async () => {
    const tablesToClear = [
      "QueueOfflineKasir",
      "TransaksiCashlessIdempotency",
      "TransaksiCashless",
      "Ledger",
      "PermintaanBMT",
      "Tagihan",
      "Cashflow",
      "PengajuanAnggaran",
      "RincianAnggaran",
      "TransaksiUnitUsaha",
      "Absensi",
      "Perizinan",
      "Pelanggaran",
      "Nilai",
      "Prestasi",
      "Hafalan",
      "PenilaianUbudiyah",
      "PenilaianKegiatan",
      "RaportAkademik",
      "RaportMental",
      "RaportTahfidz",
      "PendaftaranUlang",
      "FaceTemplate",
      "LogPin",
      "LogWajah",
      "Santri",
      "Wali",
      "RekonsiliasiImpor",
      "BatchImpor",
    ];

    let existingTableNames = new Set(tablesToClear);
    try {
      const existingTablesRes = await query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
      );
      if (existingTablesRes && existingTablesRes.rows) {
        existingTableNames = new Set(existingTablesRes.rows.map((r) => r.table_name));
      }
    } catch (_) {}

    let totalSantriDihapus = 0;
    for (const table of tablesToClear) {
      if (existingTableNames.has(table)) {
        try {
          const res = await query(`DELETE FROM "${table}"`);
          if (table === "Santri") totalSantriDihapus = Number(res.rowCount || 0);
        } catch (_) {}
      }
    }

    await query(
      `INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
       VALUES ($1, $2, 'guru', 'admin.demo_data_cleaned', 'Database', NULL, $3::jsonb)`,
      [uid(), aktorId || null, JSON.stringify({ jumlahSantriDemoDihapus: totalSantriDihapus })],
    );

    return { jumlahSantriDemoDihapus: totalSantriDihapus, cleaned: true };
  });
}

module.exports = {
  buatTemplateImporCSV,
  buatTemplateImporExcelBuffer,
  prosesDryRunImpor,
  eksekusiImporBatch,
  rollbackBatchImpor,
  provisionAkunWali,
  tautkanAnakKeWali,
  rekonsiliasiSaldoDanTagihan,
  kelengkapanDataSekretariat,
  bersihkanDataDemo,
  parseTTL,
  sanitizeNIK,
  normalizeStatusSantri,
};
