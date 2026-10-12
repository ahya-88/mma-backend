const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("./db");
const { CashlessError } = require("./cashlessService");

const uid = () => crypto.randomUUID();

// ==================== DATA INDUK GURU PENDIDIK (NON-STAF) ====================

async function semuaMasterGuru({ statusAktif, q, statusKepegawaian } = {}) {
  const conditions = [];
  const params = [];

  if (statusAktif && statusAktif !== "Semua") {
    params.push(statusAktif);
    conditions.push(`mg."statusAktif" = $${params.length}`);
  }

  if (statusKepegawaian && statusKepegawaian !== "Semua") {
    params.push(statusKepegawaian);
    conditions.push(`mg."statusKepegawaian" = $${params.length}`);
  }

  if (q && q.trim()) {
    params.push(`%${q.trim().toLowerCase()}%`);
    conditions.push(`(LOWER(mg."nama") LIKE $${params.length} OR LOWER(COALESCE(mg."nip", '')) LIKE $${params.length} OR LOWER(COALESCE(mg."noHp", '')) LIKE $${params.length})`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  return queryAll(`
    SELECT mg.*,
      g."username" AS "usernameAkun",
      (SELECT COUNT(*)::int FROM "GuruMapel" gm WHERE gm."guruId" = mg."id") AS "totalPenugasan",
      (SELECT COUNT(DISTINCT gm."kelas")::int FROM "GuruMapel" gm WHERE gm."guruId" = mg."id") AS "totalKelasAjar",
      (SELECT COUNT(*)::int FROM "MasterKelas" mk WHERE mk."waliKelasId" = mg."id") AS "totalWaliKelas"
    FROM "MasterGuru" mg
    LEFT JOIN "Guru" g ON mg."akunId" = g."id"
    ${whereClause}
    ORDER BY mg."nama" ASC
  `, params);
}

async function getMasterGuru(id) {
  const guru = await queryOne(`
    SELECT mg.*, g."username" AS "usernameAkun", g."statusAkun" AS "statusAkunLogin"
    FROM "MasterGuru" mg
    LEFT JOIN "Guru" g ON mg."akunId" = g."id"
    WHERE mg."id" = $1
  `, [id]);

  if (!guru) throw new CashlessError(404, "Data guru tidak ditemukan.");

  const [penugasan, waliKelas] = await Promise.all([
    queryAll(`
      SELECT gm.*, mm."nama" AS "namaMapel", mm."kodeMapel", mm."kategori" AS "kategoriMapel",
        (SELECT COUNT(*)::int FROM "JadwalPelajaran" jp WHERE jp."penugasanId" = gm."id") AS "jumlahJadwal"
      FROM "GuruMapel" gm
      JOIN "MasterMapel" mm ON gm."mapelId" = mm."id"
      WHERE gm."guruId" = $1
      ORDER BY gm."tahunAjaran" DESC, gm."semester" ASC, gm."kelas" ASC
    `, [id]),
    queryAll(`
      SELECT mk."id", mk."nama", mk."tingkat"
      FROM "MasterKelas" mk
      WHERE mk."waliKelasId" = $1
      ORDER BY mk."nama" ASC
    `, [id]),
  ]);

  return {
    ...guru,
    penugasan,
    waliKelas,
  };
}

async function tambahMasterGuru(data = {}) {
  const {
    nip, nuptk, nik, nama, gelarDepan, gelarBelakang, jenisKelamin = "L",
    tempatLahir, tanggalLahir, noHp, email, alamat, pendidikanTerakhir,
    jurusanPendidikan, almamater, statusKepegawaian = "Tetap", statusAktif = "Aktif",
    tanggalMulaiTugas, foto, akunId, kodeGuru, keterangan,
  } = data;

  if (!nama || !nama.trim()) throw new CashlessError(400, "Nama guru wajib diisi.");

  const cleanNip = nip && nip.trim() ? nip.trim() : null;
  if (cleanNip) {
    const existingNip = await queryOne('SELECT "id" FROM "MasterGuru" WHERE "nip" = $1', [cleanNip]);
    if (existingNip) throw new CashlessError(400, `Guru dengan NIP "${cleanNip}" sudah terdaftar.`);
  }

  const id = uid();
  const jk = (jenisKelamin || "L").toUpperCase().startsWith("P") ? "P" : "L";

  await query(`
    INSERT INTO "MasterGuru" (
      "id", "nip", "nuptk", "nik", "nama", "gelarDepan", "gelarBelakang",
      "jenisKelamin", "tempatLahir", "tanggalLahir", "noHp", "email", "alamat",
      "pendidikanTerakhir", "jurusanPendidikan", "almamater", "statusKepegawaian",
      "statusAktif", "tanggalMulaiTugas", "foto", "akunId", "kodeGuru", "keterangan"
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12, $13,
      $14, $15, $16, $17,
      $18, $19, $20, $21, $22, $23
    )
  `, [
    id, cleanNip, nuptk ? nuptk.trim() : null, nik ? nik.trim() : null,
    nama.trim(), gelarDepan ? gelarDepan.trim() : null, gelarBelakang ? gelarBelakang.trim() : null,
    jk, tempatLahir ? tempatLahir.trim() : null, tanggalLahir || null,
    noHp ? noHp.trim() : null, email ? email.trim() : null, alamat ? alamat.trim() : null,
    pendidikanTerakhir || null, jurusanPendidikan || null, almamater || null,
    statusKepegawaian || "Tetap", statusAktif || "Aktif", tanggalMulaiTugas || null,
    foto || null, akunId || null,
    kodeGuru ? kodeGuru.trim() : null, keterangan ? keterangan.trim() : null,
  ]);

  return getMasterGuru(id);
}

async function ubahMasterGuru(id, data = {}) {
  const existing = await queryOne('SELECT * FROM "MasterGuru" WHERE "id" = $1', [id]);
  if (!existing) throw new CashlessError(404, "Data guru tidak ditemukan.");

  const {
    nip, nuptk, nik, nama, gelarDepan, gelarBelakang, jenisKelamin,
    tempatLahir, tanggalLahir, noHp, email, alamat, pendidikanTerakhir,
    jurusanPendidikan, almamater, statusKepegawaian, statusAktif,
    tanggalMulaiTugas, foto, akunId, kodeGuru, keterangan,
  } = data;

  const newNama = nama !== undefined ? (nama ? nama.trim() : existing.nama) : existing.nama;
  if (!newNama) throw new CashlessError(400, "Nama guru tidak boleh kosong.");

  let newNip = existing.nip;
  if (nip !== undefined) {
    newNip = nip && nip.trim() ? nip.trim() : null;
    if (newNip && newNip !== existing.nip) {
      const dupNip = await queryOne('SELECT "id" FROM "MasterGuru" WHERE "nip" = $1 AND "id" != $2', [newNip, id]);
      if (dupNip) throw new CashlessError(400, `NIP "${newNip}" sudah digunakan oleh guru lain.`);
    }
  }

  let jk = existing.jenisKelamin;
  if (jenisKelamin !== undefined) {
    jk = jenisKelamin.toUpperCase().startsWith("P") ? "P" : "L";
  }

  await query(`
    UPDATE "MasterGuru" SET
      "nip" = $1, "nuptk" = $2, "nik" = $3, "nama" = $4, "gelarDepan" = $5, "gelarBelakang" = $6,
      "jenisKelamin" = $7, "tempatLahir" = $8, "tanggalLahir" = $9, "noHp" = $10, "email" = $11,
      "alamat" = $12, "pendidikanTerakhir" = $13, "jurusanPendidikan" = $14, "almamater" = $15,
      "statusKepegawaian" = $16, "statusAktif" = $17, "tanggalMulaiTugas" = $18, "foto" = $19,
      "akunId" = $20, "kodeGuru" = $21, "keterangan" = $22,
      "updatedAt" = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    WHERE "id" = $23
  `, [
    newNip,
    nuptk !== undefined ? (nuptk ? nuptk.trim() : null) : existing.nuptk,
    nik !== undefined ? (nik ? nik.trim() : null) : existing.nik,
    newNama,
    gelarDepan !== undefined ? (gelarDepan ? gelarDepan.trim() : null) : existing.gelarDepan,
    gelarBelakang !== undefined ? (gelarBelakang ? gelarBelakang.trim() : null) : existing.gelarBelakang,
    jk,
    tempatLahir !== undefined ? (tempatLahir ? tempatLahir.trim() : null) : existing.tempatLahir,
    tanggalLahir !== undefined ? tanggalLahir : existing.tanggalLahir,
    noHp !== undefined ? (noHp ? noHp.trim() : null) : existing.noHp,
    email !== undefined ? (email ? email.trim() : null) : existing.email,
    alamat !== undefined ? (alamat ? alamat.trim() : null) : existing.alamat,
    pendidikanTerakhir !== undefined ? pendidikanTerakhir : existing.pendidikanTerakhir,
    jurusanPendidikan !== undefined ? jurusanPendidikan : existing.jurusanPendidikan,
    almamater !== undefined ? almamater : existing.almamater,
    statusKepegawaian !== undefined ? statusKepegawaian : existing.statusKepegawaian,
    statusAktif !== undefined ? statusAktif : existing.statusAktif,
    tanggalMulaiTugas !== undefined ? tanggalMulaiTugas : existing.tanggalMulaiTugas,
    foto !== undefined ? foto : existing.foto,
    akunId !== undefined ? (akunId || null) : existing.akunId,
    kodeGuru !== undefined ? (kodeGuru ? kodeGuru.trim() : null) : existing.kodeGuru,
    keterangan !== undefined ? (keterangan ? keterangan.trim() : null) : existing.keterangan,
    id,
  ]);

  return getMasterGuru(id);
}

async function hapusMasterGuru(id) {
  const existing = await queryOne('SELECT * FROM "MasterGuru" WHERE "id" = $1', [id]);
  if (!existing) throw new CashlessError(404, "Data guru tidak ditemukan.");

  await withTransaction(async (client) => {
    // Nullify waliKelasId di MasterKelas
    await client.query('UPDATE "MasterKelas" SET "waliKelasId" = NULL WHERE "waliKelasId" = $1', [id]);
    await client.query('DELETE FROM "MasterGuru" WHERE "id" = $1', [id]);
  });

  return { ok: true, id, message: `Data guru ${existing.nama} berhasil dihapus.` };
}

// ==================== MASTER MATA PELAJARAN (MAPEL) ====================

async function semuaMasterMapel({ kategori, aktif, q } = {}) {
  const conditions = [];
  const params = [];

  if (kategori && kategori !== "Semua") {
    params.push(kategori);
    conditions.push(`"kategori" = $${params.length}`);
  }

  if (aktif !== undefined && aktif !== null && aktif !== "Semua") {
    const isAktif = String(aktif) === "true" || Number(aktif) === 1;
    params.push(isAktif);
    conditions.push(`"aktif" = $${params.length}`);
  }

  if (q && q.trim()) {
    params.push(`%${q.trim().toLowerCase()}%`);
    conditions.push(`(LOWER("nama") LIKE $${params.length} OR LOWER("kodeMapel") LIKE $${params.length})`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  return queryAll(`
    SELECT mm.*,
      (SELECT COUNT(*)::int FROM "GuruMapel" gm WHERE gm."mapelId" = mm."id") AS "totalPengajar"
    FROM "MasterMapel" mm
    ${whereClause}
    ORDER BY mm."kategori" ASC, mm."nama" ASC
  `, params);
}

async function getMasterMapel(id) {
  const row = await queryOne('SELECT * FROM "MasterMapel" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Mata pelajaran tidak ditemukan.");
  return row;
}

async function tambahMasterMapel(data = {}) {
  const { kodeMapel, nama, kategori = "Diniyah", tingkat, kkm = 75, aktif = true } = data;

  if (!kodeMapel || !kodeMapel.trim()) throw new CashlessError(400, "Kode mata pelajaran wajib diisi.");
  if (!nama || !nama.trim()) throw new CashlessError(400, "Nama mata pelajaran wajib diisi.");

  const cleanKode = kodeMapel.trim().toUpperCase();
  const dup = await queryOne('SELECT "id" FROM "MasterMapel" WHERE "kodeMapel" = $1', [cleanKode]);
  if (dup) throw new CashlessError(400, `Mata pelajaran dengan kode "${cleanKode}" sudah ada.`);

  const id = uid();
  await query(`
    INSERT INTO "MasterMapel" ("id", "kodeMapel", "nama", "kategori", "tingkat", "kkm", "aktif")
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [id, cleanKode, nama.trim(), kategori || "Diniyah", tingkat || null, Number(kkm) || 75, Boolean(aktif)]);

  return getMasterMapel(id);
}

async function ubahMasterMapel(id, data = {}) {
  const existing = await queryOne('SELECT * FROM "MasterMapel" WHERE "id" = $1', [id]);
  if (!existing) throw new CashlessError(404, "Mata pelajaran tidak ditemukan.");

  const { kodeMapel, nama, kategori, tingkat, kkm, aktif } = data;

  let newKode = existing.kodeMapel;
  if (kodeMapel !== undefined) {
    newKode = kodeMapel ? kodeMapel.trim().toUpperCase() : existing.kodeMapel;
    if (newKode !== existing.kodeMapel) {
      const dup = await queryOne('SELECT "id" FROM "MasterMapel" WHERE "kodeMapel" = $1 AND "id" != $2', [newKode, id]);
      if (dup) throw new CashlessError(400, `Kode mapel "${newKode}" sudah digunakan.`);
    }
  }

  const newNama = nama !== undefined ? (nama ? nama.trim() : existing.nama) : existing.nama;

  await query(`
    UPDATE "MasterMapel" SET
      "kodeMapel" = $1, "nama" = $2, "kategori" = $3, "tingkat" = $4, "kkm" = $5, "aktif" = $6
    WHERE "id" = $7
  `, [
    newKode,
    newNama,
    kategori !== undefined ? kategori : existing.kategori,
    tingkat !== undefined ? tingkat : existing.tingkat,
    kkm !== undefined ? Number(kkm) : existing.kkm,
    aktif !== undefined ? Boolean(aktif) : existing.aktif,
    id,
  ]);

  return getMasterMapel(id);
}

async function hapusMasterMapel(id) {
  const existing = await queryOne('SELECT * FROM "MasterMapel" WHERE "id" = $1', [id]);
  if (!existing) throw new CashlessError(404, "Mata pelajaran tidak ditemukan.");

  await query('DELETE FROM "MasterMapel" WHERE "id" = $1', [id]);
  return { ok: true, id, message: `Mata pelajaran ${existing.nama} berhasil dihapus.` };
}

// ==================== PENUGASAN GURU MAPEL (SK MENGAJAR) ====================

async function semuaPenugasanGuru({ guruId, mapelId, kelas, tahunAjaran, semester } = {}) {
  const conditions = [];
  const params = [];

  if (guruId) {
    params.push(guruId);
    conditions.push(`gm."guruId" = $${params.length}`);
  }

  if (mapelId) {
    params.push(mapelId);
    conditions.push(`gm."mapelId" = $${params.length}`);
  }

  if (kelas) {
    params.push(kelas);
    conditions.push(`gm."kelas" = $${params.length}`);
  }

  if (tahunAjaran) {
    params.push(tahunAjaran);
    conditions.push(`gm."tahunAjaran" = $${params.length}`);
  }

  if (semester) {
    params.push(semester);
    conditions.push(`gm."semester" = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  return queryAll(`
    SELECT gm.*,
      mg."nama" AS "namaGuru", mg."nip" AS "nipGuru", mg."gelarDepan", mg."gelarBelakang",
      mm."nama" AS "namaMapel", mm."kodeMapel", mm."kategori" AS "kategoriMapel", mm."kkm",
      (SELECT COUNT(*)::int FROM "JadwalPelajaran" jp WHERE jp."penugasanId" = gm."id") AS "totalJadwal"
    FROM "GuruMapel" gm
    JOIN "MasterGuru" mg ON gm."guruId" = mg."id"
    JOIN "MasterMapel" mm ON gm."mapelId" = mm."id"
    ${whereClause}
    ORDER BY gm."tahunAjaran" DESC, gm."semester" ASC, gm."kelas" ASC, mm."nama" ASC
  `, params);
}

async function tambahPenugasanGuru(data = {}) {
  const { guruId, mapelId, kelas, tahunAjaran, semester = "Ganjil", bebanJamMingguan = 2 } = data;

  if (!guruId) throw new CashlessError(400, "Guru wajib dipilih.");
  if (!mapelId) throw new CashlessError(400, "Mata pelajaran wajib dipilih.");
  if (!kelas || !kelas.trim()) throw new CashlessError(400, "Kelas wajib diisi.");
  if (!tahunAjaran || !tahunAjaran.trim()) throw new CashlessError(400, "Tahun ajaran wajib diisi.");

  const guru = await queryOne('SELECT "id", "nama" FROM "MasterGuru" WHERE "id" = $1', [guruId]);
  if (!guru) throw new CashlessError(404, "Guru tidak ditemukan.");

  const mapel = await queryOne('SELECT "id", "nama" FROM "MasterMapel" WHERE "id" = $1', [mapelId]);
  if (!mapel) throw new CashlessError(404, "Mata pelajaran tidak ditemukan.");

  const dup = await queryOne(`
    SELECT "id" FROM "GuruMapel"
    WHERE "guruId" = $1 AND "mapelId" = $2 AND "kelas" = $3 AND "tahunAjaran" = $4 AND "semester" = $5
  `, [guruId, mapelId, kelas.trim(), tahunAjaran.trim(), semester]);

  if (dup) throw new CashlessError(400, `Penugasan untuk guru ${guru.nama} pada mapel ${mapel.nama} kelas ${kelas} sudah ada.`);

  const id = uid();
  await query(`
    INSERT INTO "GuruMapel" ("id", "guruId", "mapelId", "kelas", "tahunAjaran", "semester", "bebanJamMingguan")
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [id, guruId, mapelId, kelas.trim(), tahunAjaran.trim(), semester, Number(bebanJamMingguan) || 2]);

  return queryOne(`
    SELECT gm.*, mg."nama" AS "namaGuru", mm."nama" AS "namaMapel", mm."kodeMapel"
    FROM "GuruMapel" gm
    JOIN "MasterGuru" mg ON gm."guruId" = mg."id"
    JOIN "MasterMapel" mm ON gm."mapelId" = mm."id"
    WHERE gm."id" = $1
  `, [id]);
}

async function hapusPenugasanGuru(id) {
  const existing = await queryOne('SELECT * FROM "GuruMapel" WHERE "id" = $1', [id]);
  if (!existing) throw new CashlessError(404, "Penugasan mengajar tidak ditemukan.");

  await query('DELETE FROM "GuruMapel" WHERE "id" = $1', [id]);
  return { ok: true, id, message: "Penugasan mengajar berhasil dihapus." };
}

// ==================== JADWAL PELAJARAN (KBM HARIAN) ====================

async function semuaJadwalPelajaran({ kelas, guruId, hari, tahunAjaran, semester } = {}) {
  const conditions = [];
  const params = [];

  if (kelas) {
    params.push(kelas);
    conditions.push(`gm."kelas" = $${params.length}`);
  }

  if (guruId) {
    params.push(guruId);
    conditions.push(`gm."guruId" = $${params.length}`);
  }

  if (hari) {
    params.push(hari);
    conditions.push(`jp."hari" = $${params.length}`);
  }

  if (tahunAjaran) {
    params.push(tahunAjaran);
    conditions.push(`gm."tahunAjaran" = $${params.length}`);
  }

  if (semester) {
    params.push(semester);
    conditions.push(`gm."semester" = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  return queryAll(`
    SELECT jp.*,
      gm."kelas", gm."tahunAjaran", gm."semester",
      mg."id" AS "guruId", mg."nama" AS "namaGuru", mg."gelarDepan", mg."gelarBelakang",
      mm."id" AS "mapelId", mm."nama" AS "namaMapel", mm."kodeMapel", mm."kategori" AS "kategoriMapel"
    FROM "JadwalPelajaran" jp
    JOIN "GuruMapel" gm ON jp."penugasanId" = gm."id"
    JOIN "MasterGuru" mg ON gm."guruId" = mg."id"
    JOIN "MasterMapel" mm ON gm."mapelId" = mm."id"
    ${whereClause}
    ORDER BY 
      CASE jp."hari"
        WHEN 'Senin' THEN 1
        WHEN 'Selasa' THEN 2
        WHEN 'Rabu' THEN 3
        WHEN 'Kamis' THEN 4
        WHEN 'Jumat' THEN 5
        WHEN 'Sabtu' THEN 6
        WHEN 'Ahad' THEN 7
        ELSE 8
      END,
      jp."jamMulai" ASC
  `, params);
}

async function tambahJadwalPelajaran(data = {}) {
  const { penugasanId, hari, jamMulai, jamSelesai, ruangan } = data;

  if (!penugasanId) throw new CashlessError(400, "Penugasan mengajar wajib dipilih.");
  if (!hari) throw new CashlessError(400, "Hari jadwal wajib diisi.");
  if (!jamMulai || !jamSelesai) throw new CashlessError(400, "Jam mulai dan jam selesai wajib diisi.");

  const penugasan = await queryOne('SELECT * FROM "GuruMapel" WHERE "id" = $1', [penugasanId]);
  if (!penugasan) throw new CashlessError(404, "Penugasan mengajar tidak ditemukan.");

  // Validasi tabrakan jadwal kelas pada hari dan jam yang sama
  const tabrakanKelas = await queryOne(`
    SELECT jp.*, mm."nama" AS "namaMapel"
    FROM "JadwalPelajaran" jp
    JOIN "GuruMapel" gm ON jp."penugasanId" = gm."id"
    JOIN "MasterMapel" mm ON gm."mapelId" = mm."id"
    WHERE gm."kelas" = $1 AND gm."tahunAjaran" = $2 AND gm."semester" = $3
      AND jp."hari" = $4
      AND NOT (jp."jamSelesai" <= $5 OR jp."jamMulai" >= $6)
    LIMIT 1
  `, [penugasan.kelas, penugasan.tahunAjaran, penugasan.semester, hari, jamMulai, jamSelesai]);

  if (tabrakanKelas) {
    throw new CashlessError(400, `Tabrakan jadwal kelas ${penugasan.kelas} pada hari ${hari} jam ${tabrakanKelas.jamMulai}-${tabrakanKelas.jamSelesai} (${tabrakanKelas.namaMapel}).`);
  }

  // Validasi tabrakan jadwal guru pada hari dan jam yang sama
  const tabrakanGuru = await queryOne(`
    SELECT jp.*, gm."kelas", mm."nama" AS "namaMapel"
    FROM "JadwalPelajaran" jp
    JOIN "GuruMapel" gm ON jp."penugasanId" = gm."id"
    JOIN "MasterMapel" mm ON gm."mapelId" = mm."id"
    WHERE gm."guruId" = $1 AND gm."tahunAjaran" = $2 AND gm."semester" = $3
      AND jp."hari" = $4
      AND NOT (jp."jamSelesai" <= $5 OR jp."jamMulai" >= $6)
    LIMIT 1
  `, [penugasan.guruId, penugasan.tahunAjaran, penugasan.semester, hari, jamMulai, jamSelesai]);

  if (tabrakanGuru) {
    throw new CashlessError(400, `Guru sudah memiliki jadwal mengajar lain di kelas ${tabrakanGuru.kelas} (${tabrakanGuru.namaMapel}) pada hari ${hari} jam ${tabrakanGuru.jamMulai}-${tabrakanGuru.jamSelesai}.`);
  }

  const id = uid();
  await query(`
    INSERT INTO "JadwalPelajaran" ("id", "penugasanId", "hari", "jamMulai", "jamSelesai", "ruangan")
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [id, penugasanId, hari, jamMulai, jamSelesai, ruangan ? ruangan.trim() : null]);

  const rows = await semuaJadwalPelajaran();
  return rows.find((r) => r.id === id);
}

async function ubahJadwalPelajaran(id, data = {}) {
  const existing = await queryOne('SELECT * FROM "JadwalPelajaran" WHERE "id" = $1', [id]);
  if (!existing) throw new CashlessError(404, "Jadwal pelajaran tidak ditemukan.");

  const { hari = existing.hari, jamMulai = existing.jamMulai, jamSelesai = existing.jamSelesai, ruangan } = data;

  await query(`
    UPDATE "JadwalPelajaran" SET
      "hari" = $1, "jamMulai" = $2, "jamSelesai" = $3, "ruangan" = $4
    WHERE "id" = $5
  `, [hari, jamMulai, jamSelesai, ruangan !== undefined ? (ruangan ? ruangan.trim() : null) : existing.ruangan, id]);

  const rows = await semuaJadwalPelajaran();
  return rows.find((r) => r.id === id);
}

async function hapusJadwalPelajaran(id) {
  const existing = await queryOne('SELECT * FROM "JadwalPelajaran" WHERE "id" = $1', [id]);
  if (!existing) throw new CashlessError(404, "Jadwal pelajaran tidak ditemukan.");

  await query('DELETE FROM "JadwalPelajaran" WHERE "id" = $1', [id]);
  return { ok: true, id, message: "Jadwal pelajaran berhasil dihapus." };
}

module.exports = {
  semuaMasterGuru,
  getMasterGuru,
  tambahMasterGuru,
  ubahMasterGuru,
  hapusMasterGuru,
  semuaMasterMapel,
  getMasterMapel,
  tambahMasterMapel,
  ubahMasterMapel,
  hapusMasterMapel,
  semuaPenugasanGuru,
  tambahPenugasanGuru,
  hapusPenugasanGuru,
  semuaJadwalPelajaran,
  tambahJadwalPelajaran,
  ubahJadwalPelajaran,
  hapusJadwalPelajaran,
};
