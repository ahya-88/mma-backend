const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { query, queryOne, queryAll, withTransaction } = require("../db");
const { requireAuth, requireSekretariat } = require("../auth");
const asyncHandler = require("../asyncHandler");

// Helper konversi tanggal Masehi -> Hijriyah untuk penomoran surat otomatis
const romawiBulan = (idx) => ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"][idx];
const masehiKeHijri = (tanggal) => {
  const d = new Date(tanggal || Date.now());
  const day = d.getDate(), month = d.getMonth() + 1, year = d.getFullYear();
  const jd = Math.floor((1461 * (year + 4800 + Math.floor((month - 14) / 12))) / 4) +
    Math.floor((367 * (month - 2 - 12 * Math.floor((month - 14) / 12))) / 12) -
    Math.floor((3 * Math.floor((year + 4900 + Math.floor((month - 14) / 12)) / 100)) / 4) +
    day - 32075;
  const l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const l1 = l - 10631 * n + 354;
  const j = (Math.floor((10985 - l1) / 5316)) * (Math.floor((50 * l1) / 17719)) +
    (Math.floor(l1 / 5670)) * (Math.floor((43 * l1) / 15238));
  const l2 = l1 - (Math.floor((30 - j) / 15)) * (Math.floor((17719 * j) / 50)) -
    (Math.floor(j / 16)) * (Math.floor((15238 * j) / 43)) + 29;
  const hBulan = Math.floor((24 * l2) / 709);
  const hHari = l2 - Math.floor((709 * hBulan) / 24);
  const hTahun = 30 * n + j - 30;
  return { tahun: hTahun, bulan: hBulan, hari: hHari };
};

const formatNomorSurat = (urut, k) =>
  `${String(urut).padStart(2, "0")}/${k.kodeOrganisasi}/${k.kodeJabatan}-${k.kodeSurat}/${romawiBulan(k.hijri.bulan - 1)}/${k.hijri.tahun}`;

// Semua rute persuratan membutuhkan login staf Sekretariat atau Superadmin
router.use(requireAuth, requireSekretariat);

// 1. GET /api/sekretariat/data - Mengambil seluruh data persuratan dan master sekretariat
router.get("/data", asyncHandler(async (req, res) => {
  const [
    kopSuratRes,
    bagianList,
    kepanitiaanList,
    jenisSurat,
    pimpinanList,
    suratKeluar,
    suratMasuk,
    arsipManual,
    countersRes,
    nomorSuratLog,
  ] = await Promise.all([
    queryOne('SELECT * FROM "KopSurat" WHERE "id" = $1', ["default"]),
    queryAll('SELECT * FROM "MasterBagian" ORDER BY "kode" ASC'),
    queryAll('SELECT * FROM "MasterKepanitiaan" ORDER BY "kode" ASC'),
    queryAll('SELECT * FROM "MasterJenisSurat" ORDER BY "nama" ASC'),
    queryAll('SELECT * FROM "MasterPimpinan" ORDER BY "nama" ASC'),
    queryAll('SELECT * FROM "SuratKeluar" ORDER BY "createdAt" ASC'),
    queryAll('SELECT * FROM "SuratMasuk" ORDER BY "createdAt" ASC'),
    queryAll('SELECT * FROM "ArsipDokumen" ORDER BY "createdAt" ASC'),
    queryAll('SELECT * FROM "NomorSuratCounter"'),
    queryAll('SELECT * FROM "NomorSuratLog" ORDER BY "createdAt" ASC'),
  ]);

  const nomorSuratCounter = {};
  for (const c of countersRes) {
    nomorSuratCounter[c.key] = c.urut;
  }

  // Parse riwayatStatus JSONB jika perlu
  const suratKeluarParsed = suratKeluar.map((s) => ({
    ...s,
    riwayatStatus: Array.isArray(s.riwayatStatus) ? s.riwayatStatus : (typeof s.riwayatStatus === "string" ? JSON.parse(s.riwayatStatus || "[]") : []),
  }));

  res.json({
    kopSurat: kopSuratRes || null,
    bagianList: bagianList || [],
    kepanitiaanList: kepanitiaanList || [],
    jenisSurat: jenisSurat || [],
    pimpinanList: pimpinanList || [],
    suratKeluar: suratKeluarParsed,
    suratMasuk: suratMasuk || [],
    arsipManual: arsipManual || [],
    nomorSuratCounter,
    nomorSuratLog: nomorSuratLog || [],
  });
}));

// 2. POST /api/sekretariat/kop - Simpan atau perbarui Kop Surat
router.post("/kop", asyncHandler(async (req, res) => {
  const {
    namaLembaga, alamat, kontak, kota, kodeOrganisasi, tagline, motto,
    namaPenandatangan, jabatanPenandatangan, logoUrl,
  } = req.body;

  if (!namaLembaga) return res.status(400).json({ error: "Nama lembaga wajib diisi." });

  const now = new Date().toISOString();
  await query(`
    INSERT INTO "KopSurat" ("id", "namaLembaga", "alamat", "kontak", "kota", "kodeOrganisasi", "tagline", "motto", "namaPenandatangan", "jabatanPenandatangan", "logoUrl", "updatedAt")
    VALUES ('default', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT ("id") DO UPDATE SET
      "namaLembaga" = EXCLUDED."namaLembaga",
      "alamat" = EXCLUDED."alamat",
      "kontak" = EXCLUDED."kontak",
      "kota" = EXCLUDED."kota",
      "kodeOrganisasi" = EXCLUDED."kodeOrganisasi",
      "tagline" = EXCLUDED."tagline",
      "motto" = EXCLUDED."motto",
      "namaPenandatangan" = EXCLUDED."namaPenandatangan",
      "jabatanPenandatangan" = EXCLUDED."jabatanPenandatangan",
      "logoUrl" = EXCLUDED."logoUrl",
      "updatedAt" = EXCLUDED."updatedAt";
  `, [
    namaLembaga, alamat || "", kontak || "", kota || "", kodeOrganisasi || "MMA",
    tagline || "", motto || "", namaPenandatangan || "", jabatanPenandatangan || "",
    logoUrl || "", now,
  ]);

  const updated = await queryOne('SELECT * FROM "KopSurat" WHERE "id" = $1', ["default"]);
  res.json({ message: "Kop surat berhasil disimpan.", kopSurat: updated });
}));

// 3. POST /api/sekretariat/surat-keluar - Buat Surat Keluar baru
router.post("/surat-keluar", asyncHandler(async (req, res) => {
  const {
    jenisId, bagianId, kepanitiaanId, judulKustom, perihal, tujuan, tempatTujuan,
    isi, menimbang, mengingat, memutuskan, namaPihak, identitasPihak, keperluan,
    jumlahLampiran, namaPenandatangan, jabatanPenandatangan, namaPenyetuju, jabatanPenyetuju,
  } = req.body;

  if (!jenisId || !bagianId || !perihal) {
    return res.status(400).json({ error: "Jenis surat, Bagian penerbit, dan Perihal wajib diisi." });
  }

  const id = crypto.randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  const petugas = req.user.nama || req.user.username || "Sekretariat";
  const riwayatAwal = [{ status: "Draft", tanggal: today, oleh: petugas }];

  await query(`
    INSERT INTO "SuratKeluar" (
      "id", "jenisId", "bagianId", "kepanitiaanId", "judulKustom", "perihal", "tujuan", "tempatTujuan",
      "isi", "menimbang", "mengingat", "memutuskan", "namaPihak", "identitasPihak", "keperluan",
      "jumlahLampiran", "namaPenandatangan", "jabatanPenandatangan", "namaPenyetuju", "jabatanPenyetuju",
      "status", "nomorSurat", "dibuatOleh", "tanggalDibuat", "tanggalDisetujui", "riwayatStatus"
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
      $16, $17, $18, $19, $20, 'Draft', NULL, $21, $22, NULL, $23::jsonb
    );
  `, [
    id, jenisId, bagianId, kepanitiaanId || null, judulKustom || null, perihal, tujuan || null, tempatTujuan || null,
    isi || null, menimbang || null, mengingat || null, memutuskan || null, namaPihak || null, identitasPihak || null, keperluan || null,
    Number(jumlahLampiran) || 0, namaPenandatangan || null, jabatanPenandatangan || null, namaPenyetuju || null, jabatanPenyetuju || null,
    petugas, today, JSON.stringify(riwayatAwal),
  ]);

  const created = await queryOne('SELECT * FROM "SuratKeluar" WHERE "id" = $1', [id]);
  res.status(201).json({ message: "Draft surat keluar berhasil dibuat.", surat: created });
}));

// 4. PUT /api/sekretariat/surat-keluar/:id - Perbarui isi Surat Keluar
router.put("/surat-keluar/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await queryOne('SELECT * FROM "SuratKeluar" WHERE "id" = $1', [id]);
  if (!existing) return res.status(404).json({ error: "Surat tidak ditemukan." });

  const {
    jenisId, bagianId, kepanitiaanId, judulKustom, perihal, tujuan, tempatTujuan,
    isi, menimbang, mengingat, memutuskan, namaPihak, identitasPihak, keperluan,
    jumlahLampiran, namaPenandatangan, jabatanPenandatangan, namaPenyetuju, jabatanPenyetuju,
  } = req.body;

  const now = new Date().toISOString();
  await query(`
    UPDATE "SuratKeluar" SET
      "jenisId" = $1, "bagianId" = $2, "kepanitiaanId" = $3, "judulKustom" = $4, "perihal" = $5,
      "tujuan" = $6, "tempatTujuan" = $7, "isi" = $8, "menimbang" = $9, "mengingat" = $10,
      "memutuskan" = $11, "namaPihak" = $12, "identitasPihak" = $13, "keperluan" = $14,
      "jumlahLampiran" = $15, "namaPenandatangan" = $16, "jabatanPenandatangan" = $17,
      "namaPenyetuju" = $18, "jabatanPenyetuju" = $19, "updatedAt" = $20
    WHERE "id" = $21;
  `, [
    jenisId || existing.jenisId, bagianId || existing.bagianId, kepanitiaanId || null,
    judulKustom || null, perihal || existing.perihal, tujuan || null, tempatTujuan || null,
    isi || null, menimbang || null, mengingat || null, memutuskan || null,
    namaPihak || null, identitasPihak || null, keperluan || null,
    Number(jumlahLampiran) ?? existing.jumlahLampiran,
    namaPenandatangan || null, jabatanPenandatangan || null,
    namaPenyetuju || null, jabatanPenyetuju || null,
    now, id,
  ]);

  const updated = await queryOne('SELECT * FROM "SuratKeluar" WHERE "id" = $1', [id]);
  res.json({ message: "Surat keluar berhasil diperbarui.", surat: updated });
}));

// 5. POST /api/sekretariat/surat-keluar/:id/status - Alur status surat (Ajukan -> Setujui -> Kirim -> Arsipkan)
router.post("/surat-keluar/:id/status", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status: statusBaru } = req.body;
  const validStatus = ["Draft", "Diajukan", "Disetujui", "Ditolak", "Terkirim", "Diarsipkan"];
  if (!validStatus.includes(statusBaru)) {
    return res.status(400).json({ error: "Status surat tidak valid." });
  }

  const existing = await queryOne('SELECT * FROM "SuratKeluar" WHERE "id" = $1', [id]);
  if (!existing) return res.status(404).json({ error: "Surat tidak ditemukan." });

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const petugas = req.user.nama || req.user.username || "Sekretariat";

  let nomorSurat = existing.nomorSurat;
  let tanggalDisetujui = existing.tanggalDisetujui;

  await withTransaction(async (client) => {
    // Jika berubah jadi Disetujui dan belum ada nomor, terbitkan nomor secara atomik
    if (statusBaru === "Disetujui" && !nomorSurat) {
      tanggalDisetujui = today;

      const [bagian, kepanitiaan, jenis, kop] = await Promise.all([
        queryOne('SELECT * FROM "MasterBagian" WHERE "id" = $1', [existing.bagianId]),
        existing.kepanitiaanId ? queryOne('SELECT * FROM "MasterKepanitiaan" WHERE "id" = $1', [existing.kepanitiaanId]) : null,
        queryOne('SELECT * FROM "MasterJenisSurat" WHERE "id" = $1', [existing.jenisId]),
        queryOne('SELECT * FROM "KopSurat" WHERE "id" = $1', ["default"]),
      ]);

      const kodeOrganisasi = kepanitiaan?.kode || bagian?.organisasi || kop?.kodeOrganisasi || "MMA";
      const kodeJabatan = bagian?.kode || "A";
      const kodeSurat = jenis?.kode || "f";
      const hijri = masehiKeHijri(new Date());
      const counterKey = `${kodeOrganisasi}-${kodeJabatan}-${hijri.tahun}`;

      // Atomic counter increment
      const counterRes = await client.query(`
        INSERT INTO "NomorSuratCounter" ("key", "urut", "updatedAt")
        VALUES ($1, 1, $2)
        ON CONFLICT ("key") DO UPDATE SET
          "urut" = "NomorSuratCounter"."urut" + 1,
          "updatedAt" = EXCLUDED."updatedAt"
        RETURNING "urut";
      `, [counterKey, now]);

      const urutBaru = counterRes.rows[0].urut;
      nomorSurat = formatNomorSurat(urutBaru, { kodeOrganisasi, kodeJabatan, kodeSurat, hijri });
    }

    const riwayat = Array.isArray(existing.riwayatStatus) ? existing.riwayatStatus : (typeof existing.riwayatStatus === "string" ? JSON.parse(existing.riwayatStatus || "[]") : []);
    riwayat.push({ status: statusBaru, tanggal: today, oleh: petugas });

    await client.query(`
      UPDATE "SuratKeluar" SET
        "status" = $1,
        "nomorSurat" = $2,
        "tanggalDisetujui" = $3,
        "riwayatStatus" = $4::jsonb,
        "updatedAt" = $5
      WHERE "id" = $6;
    `, [statusBaru, nomorSurat, tanggalDisetujui, JSON.stringify(riwayat), now, id]);
  });

  const updated = await queryOne('SELECT * FROM "SuratKeluar" WHERE "id" = $1', [id]);
  res.json({ message: `Status surat berhasil diubah menjadi ${statusBaru}.`, surat: updated });
}));

// 6. POST /api/sekretariat/surat-keluar/:id/edit-nomor - Edit manual nomor surat dengan audit log
router.post("/surat-keluar/:id/edit-nomor", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { nomorSuratBaru } = req.body;
  if (!nomorSuratBaru || !nomorSuratBaru.trim()) {
    return res.status(400).json({ error: "Nomor surat baru wajib diisi." });
  }

  const existing = await queryOne('SELECT * FROM "SuratKeluar" WHERE "id" = $1', [id]);
  if (!existing) return res.status(404).json({ error: "Surat tidak ditemukan." });

  const nomorLama = existing.nomorSurat || "(kosong)";
  const nomorBaru = nomorSuratBaru.trim();
  const today = new Date().toISOString().slice(0, 10);
  const petugas = req.user.nama || req.user.username || "Sekretariat";

  await withTransaction(async (client) => {
    await client.query('UPDATE "SuratKeluar" SET "nomorSurat" = $1 WHERE "id" = $2', [nomorBaru, id]);
    await client.query(`
      INSERT INTO "NomorSuratLog" ("id", "suratId", "perihal", "nomorLama", "nomorBaru", "oleh", "tanggal")
      VALUES ($1, $2, $3, $4, $5, $6, $7);
    `, [crypto.randomUUID(), id, existing.perihal, nomorLama, nomorBaru, petugas, today]);
  });

  const updated = await queryOne('SELECT * FROM "SuratKeluar" WHERE "id" = $1', [id]);
  res.json({ message: "Nomor surat berhasil diperbarui dan dicatat di audit log.", surat: updated });
}));

// 7. DELETE /api/sekretariat/surat-keluar/:id - Hapus Surat Keluar
router.delete("/surat-keluar/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await queryOne('SELECT * FROM "SuratKeluar" WHERE "id" = $1', [id]);
  if (!existing) return res.status(404).json({ error: "Surat tidak ditemukan." });

  await query('DELETE FROM "SuratKeluar" WHERE "id" = $1', [id]);
  res.json({ message: "Surat keluar berhasil dihapus." });
}));

// 8. POST /api/sekretariat/surat-masuk - Catat Surat Masuk
router.post("/surat-masuk", asyncHandler(async (req, res) => {
  const {
    nomorSuratAsal, pengirim, perihal, kategori, tujuan, tanggalSurat,
    catatan, lampiranUrl, lampiranNama,
  } = req.body;

  if (!pengirim || !perihal || !kategori || !tujuan) {
    return res.status(400).json({ error: "Pengirim, Perihal, Kategori, dan Tujuan Disposisi wajib diisi." });
  }

  const id = crypto.randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  const petugas = req.user.nama || req.user.username || "Sekretariat";

  await query(`
    INSERT INTO "SuratMasuk" (
      "id", "nomorSuratAsal", "pengirim", "perihal", "kategori", "tujuan",
      "tanggalSurat", "tanggalTerima", "dicatatOleh", "status", "catatan",
      "lampiranUrl", "lampiranNama"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Baru', $10, $11, $12);
  `, [
    id, nomorSuratAsal || "", pengirim, perihal, kategori, tujuan,
    tanggalSurat || "", today, petugas, catatan || "",
    lampiranUrl || null, lampiranNama || null,
  ]);

  const created = await queryOne('SELECT * FROM "SuratMasuk" WHERE "id" = $1', [id]);
  res.status(201).json({ message: "Surat masuk berhasil dicatat.", surat: created });
}));

// 9. PUT /api/sekretariat/surat-masuk/:id - Edit Surat Masuk
router.put("/surat-masuk/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await queryOne('SELECT * FROM "SuratMasuk" WHERE "id" = $1', [id]);
  if (!existing) return res.status(404).json({ error: "Surat masuk tidak ditemukan." });

  const {
    nomorSuratAsal, pengirim, perihal, kategori, tujuan, tanggalSurat,
    catatan, lampiranUrl, lampiranNama, status,
  } = req.body;

  const now = new Date().toISOString();
  await query(`
    UPDATE "SuratMasuk" SET
      "nomorSuratAsal" = $1, "pengirim" = $2, "perihal" = $3, "kategori" = $4,
      "tujuan" = $5, "tanggalSurat" = $6, "catatan" = $7, "lampiranUrl" = $8,
      "lampiranNama" = $9, "status" = $10, "updatedAt" = $11
    WHERE "id" = $12;
  `, [
    nomorSuratAsal ?? existing.nomorSuratAsal,
    pengirim || existing.pengirim,
    perihal || existing.perihal,
    kategori || existing.kategori,
    tujuan || existing.tujuan,
    tanggalSurat ?? existing.tanggalSurat,
    catatan ?? existing.catatan,
    lampiranUrl !== undefined ? lampiranUrl : existing.lampiranUrl,
    lampiranNama !== undefined ? lampiranNama : existing.lampiranNama,
    status || existing.status,
    now, id,
  ]);

  const updated = await queryOne('SELECT * FROM "SuratMasuk" WHERE "id" = $1', [id]);
  res.json({ message: "Surat masuk berhasil diperbarui.", surat: updated });
}));

// 10. POST /api/sekretariat/surat-masuk/:id/status - Ubah status surat masuk
router.post("/surat-masuk/:id/status", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!["Baru", "Diproses", "Selesai"].includes(status)) {
    return res.status(400).json({ error: "Status surat masuk tidak valid." });
  }

  const existing = await queryOne('SELECT * FROM "SuratMasuk" WHERE "id" = $1', [id]);
  if (!existing) return res.status(404).json({ error: "Surat masuk tidak ditemukan." });

  await query('UPDATE "SuratMasuk" SET "status" = $1 WHERE "id" = $2', [status, id]);
  res.json({ message: `Status surat masuk berhasil diubah menjadi ${status}.` });
}));

// 11. DELETE /api/sekretariat/surat-masuk/:id - Hapus Surat Masuk
router.delete("/surat-masuk/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await queryOne('SELECT * FROM "SuratMasuk" WHERE "id" = $1', [id]);
  if (!existing) return res.status(404).json({ error: "Surat masuk tidak ditemukan." });

  await query('DELETE FROM "SuratMasuk" WHERE "id" = $1', [id]);
  res.json({ message: "Surat masuk berhasil dihapus." });
}));

// 12. POST /api/sekretariat/arsip-dokumen - Tambah dokumen manual
router.post("/arsip-dokumen", asyncHandler(async (req, res) => {
  const { judul, kategori, nomorReferensi, bagianId, keterangan, lampiranUrl, lampiranNama } = req.body;
  if (!judul || !kategori) {
    return res.status(400).json({ error: "Judul dan Kategori dokumen wajib diisi." });
  }

  const id = crypto.randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  const petugas = req.user.nama || req.user.username || "Sekretariat";

  await query(`
    INSERT INTO "ArsipDokumen" ("id", "judul", "kategori", "nomorReferensi", "bagianId", "keterangan", "lampiranUrl", "lampiranNama", "ditambahkanOleh", "tanggalCatat")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);
  `, [id, judul, kategori, nomorReferensi || "", bagianId || null, keterangan || "", lampiranUrl || null, lampiranNama || null, petugas, today]);

  const created = await queryOne('SELECT * FROM "ArsipDokumen" WHERE "id" = $1', [id]);
  res.status(201).json({ message: "Dokumen berhasil diarsipkan.", arsip: created });
}));

// 13. DELETE /api/sekretariat/arsip-dokumen/:id - Hapus arsip dokumen
router.delete("/arsip-dokumen/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  await query('DELETE FROM "ArsipDokumen" WHERE "id" = $1', [id]);
  res.json({ message: "Dokumen berhasil dihapus dari arsip." });
}));

// 14. Master Bagian (CRUD)
router.post("/bagian", asyncHandler(async (req, res) => {
  const { id, kode, nama, organisasi, deskripsi } = req.body;
  if (!kode || !nama) return res.status(400).json({ error: "Kode dan Nama bagian wajib diisi." });

  const kodeUpper = kode.toUpperCase().trim();
  const orgUpper = (organisasi || "MMA").toUpperCase().trim();

  if (id) {
    await query(`
      UPDATE "MasterBagian" SET "kode" = $1, "nama" = $2, "organisasi" = $3, "deskripsi" = $4
      WHERE "id" = $5;
    `, [kodeUpper, nama.trim(), orgUpper, deskripsi || "", id]);
  } else {
    await query(`
      INSERT INTO "MasterBagian" ("id", "kode", "nama", "organisasi", "deskripsi", "aktif", "dihapus")
      VALUES ($1, $2, $3, $4, $5, TRUE, FALSE);
    `, [crypto.randomUUID(), kodeUpper, nama.trim(), orgUpper, deskripsi || ""]);
  }

  const list = await queryAll('SELECT * FROM "MasterBagian" ORDER BY "kode" ASC');
  res.json({ message: "Master bagian berhasil disimpan.", bagianList: list });
}));

router.delete("/bagian/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Soft delete
  await query('UPDATE "MasterBagian" SET "dihapus" = TRUE, "aktif" = FALSE WHERE "id" = $1', [id]);
  const list = await queryAll('SELECT * FROM "MasterBagian" ORDER BY "kode" ASC');
  res.json({ message: "Master bagian berhasil dinonaktifkan.", bagianList: list });
}));

router.post("/bagian/:id/pulihkan", asyncHandler(async (req, res) => {
  const { id } = req.params;
  await query('UPDATE "MasterBagian" SET "dihapus" = FALSE, "aktif" = TRUE WHERE "id" = $1', [id]);
  const list = await queryAll('SELECT * FROM "MasterBagian" ORDER BY "kode" ASC');
  res.json({ message: "Master bagian berhasil dipulihkan.", bagianList: list });
}));

// 15. Master Kepanitiaan (CRUD)
router.post("/kepanitiaan", asyncHandler(async (req, res) => {
  const { id, kode, nama } = req.body;
  if (!kode || !nama) return res.status(400).json({ error: "Kode dan Nama kepanitiaan wajib diisi." });

  const kodeUpper = kode.toUpperCase().trim();
  if (id) {
    await query('UPDATE "MasterKepanitiaan" SET "kode" = $1, "nama" = $2 WHERE "id" = $3', [kodeUpper, nama.trim(), id]);
  } else {
    await query('INSERT INTO "MasterKepanitiaan" ("id", "kode", "nama") VALUES ($1, $2, $3)', [crypto.randomUUID(), kodeUpper, nama.trim()]);
  }

  const list = await queryAll('SELECT * FROM "MasterKepanitiaan" ORDER BY "kode" ASC');
  res.json({ message: "Master kepanitiaan berhasil disimpan.", kepanitiaanList: list });
}));

router.delete("/kepanitiaan/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  await query('DELETE FROM "MasterKepanitiaan" WHERE "id" = $1', [id]);
  const list = await queryAll('SELECT * FROM "MasterKepanitiaan" ORDER BY "kode" ASC');
  res.json({ message: "Master kepanitiaan berhasil dihapus.", kepanitiaanList: list });
}));

// 16. Master Jenis Surat (CRUD)
router.post("/jenis-surat", asyncHandler(async (req, res) => {
  const { id, kode, nama, formatTataLetak, tipeIsi } = req.body;
  if (!kode || !nama) return res.status(400).json({ error: "Kode dan Nama jenis surat wajib diisi." });

  const kodeLower = kode.toLowerCase().trim();
  if (id) {
    await query(`
      UPDATE "MasterJenisSurat" SET "kode" = $1, "nama" = $2, "formatTataLetak" = $3, "tipeIsi" = $4
      WHERE "id" = $5;
    `, [kodeLower, nama.trim(), formatTataLetak || "Berperihal", tipeIsi || "Bebas", id]);
  } else {
    await query(`
      INSERT INTO "MasterJenisSurat" ("id", "kode", "nama", "kategori", "formatTataLetak", "tipeIsi")
      VALUES ($1, $2, $3, 'Keluar', $4, $5);
    `, [crypto.randomUUID(), kodeLower, nama.trim(), formatTataLetak || "Berperihal", tipeIsi || "Bebas"]);
  }

  const list = await queryAll('SELECT * FROM "MasterJenisSurat" ORDER BY "nama" ASC');
  res.json({ message: "Master jenis surat berhasil disimpan.", jenisSurat: list });
}));

router.delete("/jenis-surat/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  await query('DELETE FROM "MasterJenisSurat" WHERE "id" = $1', [id]);
  const list = await queryAll('SELECT * FROM "MasterJenisSurat" ORDER BY "nama" ASC');
  res.json({ message: "Master jenis surat berhasil dihapus.", jenisSurat: list });
}));

// 17. Master Pimpinan (CRUD)
router.post("/pimpinan", asyncHandler(async (req, res) => {
  const { id, nama, jabatan } = req.body;
  if (!nama || !jabatan) return res.status(400).json({ error: "Nama dan Jabatan pimpinan wajib diisi." });

  if (id) {
    await query('UPDATE "MasterPimpinan" SET "nama" = $1, "jabatan" = $2 WHERE "id" = $3', [nama.trim(), jabatan.trim(), id]);
  } else {
    await query('INSERT INTO "MasterPimpinan" ("id", "nama", "jabatan") VALUES ($1, $2, $3)', [crypto.randomUUID(), nama.trim(), jabatan.trim()]);
  }

  const list = await queryAll('SELECT * FROM "MasterPimpinan" ORDER BY "nama" ASC');
  res.json({ message: "Daftar pimpinan berhasil disimpan.", pimpinanList: list });
}));

router.delete("/pimpinan/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  await query('DELETE FROM "MasterPimpinan" WHERE "id" = $1', [id]);
  const list = await queryAll('SELECT * FROM "MasterPimpinan" ORDER BY "nama" ASC');
  res.json({ message: "Pimpinan berhasil dihapus.", pimpinanList: list });
}));

module.exports = router;
