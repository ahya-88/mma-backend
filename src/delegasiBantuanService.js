const crypto = require("crypto");
const XLSX = require("xlsx");
const { query, queryOne, queryAll, withTransaction } = require("./db");

/**
 * Helper menghitung usia dari tanggal lahir (YYYY-MM-DD atau DD/MM/YYYY)
 * terhadap tanggal patokan tertentu (default: hari ini).
 */
function hitungUsia(tanggalLahirStr, tanggalPatokanStr) {
  if (!tanggalLahirStr) return { tahun: null, bulan: null, label: "-" };

  let birthDate = null;
  // Coba parse YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(tanggalLahirStr)) {
    birthDate = new Date(tanggalLahirStr);
  } else if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(tanggalLahirStr)) {
    // DD-MM-YYYY
    const parts = tanggalLahirStr.split(/[-/]/);
    birthDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
  } else {
    birthDate = new Date(tanggalLahirStr);
  }

  if (isNaN(birthDate.getTime())) return { tahun: null, bulan: null, label: "-" };

  const refDate = tanggalPatokanStr ? new Date(tanggalPatokanStr) : new Date();
  if (isNaN(refDate.getTime())) return { tahun: null, bulan: null, label: "-" };

  let years = refDate.getFullYear() - birthDate.getFullYear();
  let months = refDate.getMonth() - birthDate.getMonth();
  if (refDate.getDate() < birthDate.getDate()) {
    months--;
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  return {
    tahun: Math.max(0, years),
    bulan: Math.max(0, months),
    label: `${years} thn ${months} bln`,
  };
}

/**
 * Validasi apakah string NIK valid (16 digit angka)
 */
function cekNikValid(nik) {
  if (!nik) return false;
  const clean = String(nik).trim();
  return /^\d{16}$/.test(clean);
}

/**
 * 1. Ambil data seleksi santri dengan filter cerdas
 */
async function ambilDataSeleksiSantri(filter = {}) {
  const {
    kelas,
    usiaMaks,
    usiaMin,
    patokanTanggal,
    hafalanMin,
    statusYatim,
    hanyaNikValid,
    hanyaAdaFoto,
    q,
  } = filter;

  // Ambil santri aktif
  const santriList = await queryAll(`
    SELECT 
      s."id", s."nama", s."kelas", s."nis", s."nisn", s."nik", s."noKk",
      s."jenisKelamin", s."tempatLahir", s."tanggalLahir", s."alamat", s."asrama",
      s."foto", s."statusSantri", s."statusYatim", s."namaAyah", s."namaIbu",
      s."nikAyah", s."nikIbu", s."pekerjaanAyah", s."pekerjaanIbu", s."penghasilanOrtuRange",
      s."noKip", s."noKks", s."namaBankBantuan", s."noRekeningBantuan", s."atasNamaRekeningBantuan",
      w."nama" AS "waliNama", w."hp" AS "waliHp"
    FROM "Santri" s
    LEFT JOIN "Wali" w ON s."waliId" = w."id"
    WHERE s."is_deleted" = FALSE AND COALESCE(s."statusSantri", 'Aktif') = 'Aktif'
    ORDER BY s."kelas" ASC, s."nama" ASC
  `);

  // Ambil ringkasan capaian hafalan santri
  let hafalanMap = {};
  try {
    const hafalanRows = await queryAll(`
      SELECT "santriId", COUNT(DISTINCT "juz") AS "totalJuz", MAX(NULLIF(regexp_replace("juz", '[^0-9]', '', 'g'), '')::int) AS "maxJuz"
      FROM "Hafalan"
      GROUP BY "santriId"
    `);
    for (const h of hafalanRows) {
      hafalanMap[h.santriId] = {
        totalJuz: Number(h.totalJuz) || 0,
        maxJuz: Number(h.maxJuz) || 0,
      };
    }
  } catch (_) {}

  // Filter & Enrich di memori untuk fleksibilitas kalkulasi usia dinamis
  const filtered = santriList.map((s) => {
    const usia = hitungUsia(s.tanggalLahir, patokanTanggal);
    const hafalan = hafalanMap[s.id] || { totalJuz: 0, maxJuz: 0 };
    const nikValid = cekNikValid(s.nik);
    const adaFoto = !!(s.foto && s.foto.trim() !== "");

    return {
      ...s,
      usiaTahun: usia.tahun,
      usiaBulan: usia.bulan,
      usiaLabel: usia.label,
      totalJuzHafalan: hafalan.totalJuz,
      maxJuzHafalan: hafalan.maxJuz,
      isNikValid: nikValid,
      isAdaFoto: adaFoto,
    };
  }).filter((s) => {
    // Filter Kelas
    if (kelas && kelas !== "Semua" && s.kelas !== kelas) {
      return false;
    }

    // Filter Usia Maksimal
    if (usiaMaks !== undefined && usiaMaks !== null && usiaMaks !== "") {
      const maxAge = Number(usiaMaks);
      if (s.usiaTahun === null || s.usiaTahun > maxAge) return false;
    }

    // Filter Usia Minimal
    if (usiaMin !== undefined && usiaMin !== null && usiaMin !== "") {
      const minAge = Number(usiaMin);
      if (s.usiaTahun === null || s.usiaTahun < minAge) return false;
    }

    // Filter Hafalan Minimal
    if (hafalanMin !== undefined && hafalanMin !== null && hafalanMin !== "") {
      const minHaf = Number(hafalanMin);
      if (s.totalJuzHafalan < minHaf && s.maxJuzHafalan < minHaf) return false;
    }

    // Filter Status Yatim
    if (statusYatim && statusYatim !== "Semua") {
      const sy = (s.statusYatim || "Lengkap").toLowerCase();
      if (sy !== statusYatim.toLowerCase()) return false;
    }

    // Filter Hanya NIK Valid
    if (hanyaNikValid === true || hanyaNikValid === "true") {
      if (!s.isNikValid) return false;
    }

    // Filter Hanya Ada Foto
    if (hanyaAdaFoto === true || hanyaAdaFoto === "true") {
      if (!s.isAdaFoto) return false;
    }

    // Filter Pencarian Keyword (Nama, NIS, NISN, NIK)
    if (q && q.trim()) {
      const kw = q.trim().toLowerCase();
      const match =
        (s.nama && s.nama.toLowerCase().includes(kw)) ||
        (s.nis && s.nis.toLowerCase().includes(kw)) ||
        (s.nisn && s.nisn.toLowerCase().includes(kw)) ||
        (s.nik && s.nik.toLowerCase().includes(kw));
      if (!match) return false;
    }

    return true;
  });

  return filtered;
}

/**
 * 2. Ambil data seleksi guru/asatidz
 */
async function ambilDataSeleksiGuru(filter = {}) {
  const { statusKepegawaian, q, hanyaNikValid } = filter;

  const guruList = await queryAll(`
    SELECT 
      g."id", g."nip", g."nuptk", g."nik", g."noKk", g."nama", g."gelarDepan", g."gelarBelakang",
      g."jenisKelamin", g."tempatLahir", g."tanggalLahir", g."noHp", g."email", g."alamat",
      g."pendidikanTerakhir", g."jurusanPendidikan", g."almamater", g."statusKepegawaian",
      g."statusAktif", g."statusSertifikasi", g."tanggalMulaiTugas", g."foto", g."kodeGuru",
      g."namaBankBantuan", g."noRekeningBantuan", g."atasNamaRekeningBantuan",
      a."username", a."departemen"
    FROM "MasterGuru" g
    LEFT JOIN "Guru" a ON g."akunId" = a."id"
    WHERE COALESCE(g."statusAktif", 'Aktif') = 'Aktif'
    ORDER BY g."nama" ASC
  `);

  return guruList.map((g) => {
    const usia = hitungUsia(g.tanggalLahir);
    const nikValid = cekNikValid(g.nik);
    const adaFoto = !!(g.foto && g.foto.trim() !== "");

    return {
      ...g,
      usiaTahun: usia.tahun,
      usiaBulan: usia.bulan,
      usiaLabel: usia.label,
      isNikValid: nikValid,
      isAdaFoto: adaFoto,
    };
  }).filter((g) => {
    if (statusKepegawaian && statusKepegawaian !== "Semua" && g.statusKepegawaian !== statusKepegawaian) {
      return false;
    }
    if (hanyaNikValid === true || hanyaNikValid === "true") {
      if (!g.isNikValid) return false;
    }
    if (q && q.trim()) {
      const kw = q.trim().toLowerCase();
      const match =
        (g.nama && g.nama.toLowerCase().includes(kw)) ||
        (g.nip && g.nip.toLowerCase().includes(kw)) ||
        (g.nuptk && g.nuptk.toLowerCase().includes(kw)) ||
        (g.nik && g.nik.toLowerCase().includes(kw));
      if (!match) return false;
    }
    return true;
  });
}

/**
 * 3. Ambil daftar event delegasi dan bantuan
 */
async function ambilDaftarEvent() {
  const events = await queryAll(`
    SELECT 
      e.*,
      COUNT(p."id")::int AS "totalPeserta",
      COUNT(CASE WHEN p."tipeSubjek" = 'santri' THEN 1 END)::int AS "totalSantri",
      COUNT(CASE WHEN p."tipeSubjek" = 'guru' THEN 1 END)::int AS "totalGuru"
    FROM "EventDelegasiBantuan" e
    LEFT JOIN "PesertaDelegasiBantuan" p ON e."id" = p."eventId"
    GROUP BY e."id"
    ORDER BY e."createdAt" DESC
  `);
  return events;
}

/**
 * 4. Ambil detail event beserta daftar peserta
 */
async function ambilDetailEvent(eventId) {
  const event = await queryOne(`SELECT * FROM "EventDelegasiBantuan" WHERE "id" = $1`, [eventId]);
  if (!event) return null;

  const pesertaList = await queryAll(`
    SELECT 
      p.*,
      COALESCE(s."nama", g."nama") AS "namaSubjek",
      COALESCE(s."kelas", g."statusKepegawaian") AS "subjekInfo",
      COALESCE(s."nik", g."nik") AS "nik",
      COALESCE(w."hp", s."noDarurat", g."noHp") AS "noHp",
      COALESCE(s."foto", g."foto") AS "foto",
      s."nisn", g."nip", g."nuptk"
    FROM "PesertaDelegasiBantuan" p
    LEFT JOIN "Santri" s ON p."tipeSubjek" = 'santri' AND p."subjekId" = s."id"
    LEFT JOIN "Wali" w ON s."waliId" = w."id"
    LEFT JOIN "MasterGuru" g ON p."tipeSubjek" = 'guru' AND p."subjekId" = g."id"
    WHERE p."eventId" = $1
    ORDER BY p."tipeSubjek" DESC, p."peran" ASC
  `, [eventId]);

  return {
    ...event,
    peserta: pesertaList,
  };
}

/**
 * 5. Simpan event baru / ubah event beserta pesertanya
 */
async function simpanEventDelegasi(data, aktorNama = "Sekretariat") {
  const {
    id,
    kategori,
    namaEvent,
    penyelenggara,
    tanggalPelaksanaan,
    tahunAjaran,
    status,
    keterangan,
    suratTugasId,
    pesertaList = [],
  } = data;

  if (!namaEvent || !penyelenggara) {
    throw new Error("Nama event dan penyelenggara wajib diisi.");
  }

  const eventId = id || crypto.randomUUID();

  return await withTransaction(async (client) => {
    if (id) {
      await client.query(`
        UPDATE "EventDelegasiBantuan"
        SET "kategori" = $1, "namaEvent" = $2, "penyelenggara" = $3,
            "tanggalPelaksanaan" = $4, "tahunAjaran" = $5, "status" = $6,
            "keterangan" = $7, "suratTugasId" = $8
        WHERE "id" = $9
      `, [
        kategori || "Lomba",
        namaEvent.trim(),
        penyelenggara.trim(),
        tanggalPelaksanaan || null,
        tahunAjaran || "2026/2027",
        status || "Draft",
        keterangan || null,
        suratTugasId || null,
        eventId,
      ]);
      // Bersihkan peserta lama untuk di-insert ulang
      await client.query(`DELETE FROM "PesertaDelegasiBantuan" WHERE "eventId" = $1`, [eventId]);
    } else {
      await client.query(`
        INSERT INTO "EventDelegasiBantuan"
          ("id", "kategori", "namaEvent", "penyelenggara", "tanggalPelaksanaan",
           "tahunAjaran", "status", "keterangan", "suratTugasId", "dibuatOleh")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        eventId,
        kategori || "Lomba",
        namaEvent.trim(),
        penyelenggara.trim(),
        tanggalPelaksanaan || null,
        tahunAjaran || "2026/2027",
        status || "Draft",
        keterangan || null,
        suratTugasId || null,
        aktorNama,
      ]);
    }

    // Insert rincian peserta
    for (const p of pesertaList) {
      if (!p.subjekId) continue;
      await client.query(`
        INSERT INTO "PesertaDelegasiBantuan"
          ("id", "eventId", "tipeSubjek", "subjekId", "peran", "bidangCabang", "nominalBantuan", "prestasiHasil", "catatan")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        crypto.randomUUID(),
        eventId,
        p.tipeSubjek || "santri",
        p.subjekId,
        p.peran || "Peserta",
        p.bidangCabang || null,
        Number(p.nominalBantuan) || 0,
        p.prestasiHasil || null,
        p.catatan || null,
      ]);
    }

    return { ok: true, id: eventId, message: "Event berhasil disimpan." };
  });
}

/**
 * 6. Hapus event delegasi
 */
async function hapusEventDelegasi(eventId) {
  await query(`DELETE FROM "EventDelegasiBantuan" WHERE "id" = $1`, [eventId]);
  return { ok: true, message: "Event berhasil dihapus." };
}

/**
 * 7. Generator Excel Berbagai Format Standar (SheetJS)
 */
function buatBufferExcelDelegasi({ formatTipe, dataRows, meta = {} }) {
  const wb = XLSX.utils.book_new();
  let headers = [];
  let mappedData = [];

  if (formatTipe === "lomba") {
    // Format Khusus Panitia Perlombaan / Kontingen
    mappedData = dataRows.map((d, idx) => ({
      "No": idx + 1,
      "Nama Lengkap": d.nama || "",
      "Peran / Cabang Lomba": d.bidangCabang || d.peran || "Peserta",
      "Kelas / Tingkat": d.kelas || d.statusKepegawaian || "-",
      "Jenis Kelamin": d.jenisKelamin === "P" ? "Perempuan" : "Laki-laki",
      "Tempat Lahir": d.tempatLahir || "-",
      "Tanggal Lahir": d.tanggalLahir || "-",
      "Usia": d.usiaLabel || (d.usiaTahun ? `${d.usiaTahun} Thn` : "-"),
      "NISN": d.nisn || "-",
      "NIK": d.nik || "-",
      "Capaian Tahfidz": d.totalJuzHafalan ? `${d.totalJuzHafalan} Juz` : "-",
      "Asrama / Saung": d.asrama || "-",
      "Nama Wali / Ortu": d.waliNama || d.namaAyah || "-",
      "No Kontak / HP": d.waliHp || d.noHp || "-",
    }));
  } else if (formatTipe === "pip") {
    // Format Usulan PIP / Kemenag / EMIS
    mappedData = dataRows.map((d, idx) => ({
      "No": idx + 1,
      "Nama Santri": d.nama || "",
      "NISN": d.nisn || "",
      "NIK Santri": d.nik || "",
      "No KK": d.noKk || "",
      "Tempat Lahir": d.tempatLahir || "",
      "Tanggal Lahir": d.tanggalLahir || "",
      "Jenis Kelamin": d.jenisKelamin === "P" ? "P" : "L",
      "Kelas": d.kelas || "",
      "Nama Ibu Kandung": d.namaIbu || "",
      "NIK Ibu": d.nikIbu || "",
      "Pekerjaan Ibu": d.pekerjaanIbu || "-",
      "Nama Ayah": d.namaAyah || "",
      "NIK Ayah": d.nikAyah || "",
      "Pekerjaan Ayah": d.pekerjaanAyah || "-",
      "Penghasilan Ortu": d.penghasilanOrtuRange || "-",
      "Status Yatim/Piatu": d.statusYatim || "Lengkap",
      "No KIP": d.noKip || "-",
      "No KKS/PKH": d.noKks || "-",
      "Alamat Lengkap": d.alamat || "-",
      "Bank Penyalur": d.namaBankBantuan || "BSI",
      "No Rekening": d.noRekeningBantuan || "-",
      "Atas Nama": d.atasNamaRekeningBantuan || d.nama || "",
    }));
  } else if (formatTipe === "baznas") {
    // Format Advokasi BAZNAS / Lembaga Zakat / Dhuafa
    mappedData = dataRows.map((d, idx) => ({
      "No": idx + 1,
      "Nama Santri": d.nama || "",
      "Status Sosial": d.statusYatim || "Dhuafa",
      "Kelas": d.kelas || "",
      "NIK": d.nik || "",
      "No KK": d.noKk || "",
      "Nama Wali / Orang Tua": d.waliNama || d.namaIbu || d.namaAyah || "-",
      "Penghasilan Bulanan": d.penghasilanOrtuRange || "< 1 Juta",
      "Alamat": d.alamat || "-",
      "Kontak HP": d.waliHp || "-",
      "Bank": d.namaBankBantuan || "BSI",
      "No Rekening": d.noRekeningBantuan || "-",
      "Atas Nama": d.atasNamaRekeningBantuan || d.nama || "",
      "Rekomendasi Bantuan (Rp)": Number(d.nominalBantuan || 0).toLocaleString("id-ID"),
    }));
  } else if (formatTipe === "guru") {
    // Format Bantuan / Pendataan Asatidz (BSU / Simpatika)
    mappedData = dataRows.map((d, idx) => ({
      "No": idx + 1,
      "Nama Lengkap & Gelar": `${d.gelarDepan ? d.gelarDepan + " " : ""}${d.nama}${d.gelarBelakang ? ", " + d.gelarBelakang : ""}`,
      "NIP": d.nip || "-",
      "NUPTK": d.nuptk || "-",
      "NIK": d.nik || "-",
      "No KK": d.noKk || "-",
      "Tempat Lahir": d.tempatLahir || "-",
      "Tanggal Lahir": d.tanggalLahir || "-",
      "Jenis Kelamin": d.jenisKelamin === "P" ? "P" : "L",
      "Pendidikan Terakhir": d.pendidikanTerakhir || "-",
      "Jurusan": d.jurusanPendidikan || "-",
      "Almamater": d.almamater || "-",
      "Status Kepegawaian": d.statusKepegawaian || "Tetap",
      "Status Sertifikasi": d.statusSertifikasi || "Belum",
      "No HP": d.noHp || "-",
      "Email": d.email || "-",
      "Bank Penyalur": d.namaBankBantuan || "BSI",
      "No Rekening": d.noRekeningBantuan || "-",
      "Atas Nama": d.atasNamaRekeningBantuan || d.nama || "",
    }));
  } else {
    // Format Default Lengkap
    mappedData = dataRows.map((d, idx) => ({
      "No": idx + 1,
      "Nama": d.nama || "",
      "Kelas / Tugas": d.kelas || d.statusKepegawaian || "-",
      "NISN": d.nisn || "-",
      "NIK": d.nik || "-",
      "TTL": `${d.tempatLahir || "-"}, ${d.tanggalLahir || "-"}`,
      "Usia": d.usiaLabel || "-",
      "Status NIK": d.isNikValid ? "Valid (16 Digit)" : "Belum Valid",
      "Alamat": d.alamat || "-",
      "Kontak": d.waliHp || d.noHp || "-",
    }));
  }

  const ws = XLSX.utils.json_to_sheet(mappedData);
  const sheetName = (meta.judulSheet || "Data_Export").substring(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

module.exports = {
  hitungUsia,
  cekNikValid,
  ambilDataSeleksiSantri,
  ambilDataSeleksiGuru,
  ambilDaftarEvent,
  ambilDetailEvent,
  simpanEventDelegasi,
  hapusEventDelegasi,
  buatBufferExcelDelegasi,
};
