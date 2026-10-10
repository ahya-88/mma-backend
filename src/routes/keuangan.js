const express = require("express");
const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("../db");
const { requireAuth, requireAdministrasi } = require("../auth");
const { CashlessError } = require("../cashlessService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();
const uid = () => crypto.randomUUID();
const todayISO = () => new Date().toISOString().slice(0, 10);

// ==================== TAGIHAN & PEMBAYARAN ====================

router.get("/tagihan", requireAuth, asyncHandler(async (req, res) => {
  const santriId = req.query.santriId;
  const bulan = req.query.bulan;

  const kondisi = [];
  const params = [];

  if (santriId) { params.push(santriId); kondisi.push(`t."santriId" = $${params.length}`); }
  if (bulan) { params.push(bulan); kondisi.push(`t."bulan" = $${params.length}`); }

  if (req.user.role === "wali") {
    params.push(req.user.id);
    kondisi.push(`s."waliId" = $${params.length}`);
  }

  const where = kondisi.length ? `WHERE ${kondisi.join(" AND ")}` : "";

  const rows = await queryAll(`
    SELECT t.*, s."nama" AS "namaSantri", s."kelas"
    FROM "Tagihan" t
    LEFT JOIN "Santri" s ON t."santriId" = s."id"
    ${where}
    ORDER BY t."createdAt" DESC
  `, params);

  res.json(rows.map((r) => ({
    ...r,
    jumlah: Number(r.jumlah),
    jumlahDibayar: Number(r.jumlahDibayar),
    tunggakan: Math.max(0, Number(r.jumlah) - Number(r.jumlahDibayar)),
  })));
}));

router.post("/tagihan", requireAuth, requireAdministrasi, asyncHandler(async (req, res) => {
  const { santriId, santriIds, jenis, jumlah, bulan } = req.body || {};
  const nominal = Number(jumlah);
  const ids = Array.isArray(santriIds) && santriIds.length ? santriIds : (santriId ? [santriId] : []);

  if (!ids.length || !jenis || !nominal || nominal <= 0 || !bulan) {
    throw new CashlessError(400, "santriId/santriIds, jenis, jumlah, dan bulan wajib diisi.");
  }

  const createdIds = [];
  await withTransaction(async (client) => {
    for (const sid of ids) {
      const id = uid();
      await client.query(
        `INSERT INTO "Tagihan" ("id", "santriId", "jenis", "jumlah", "bulan", "jumlahDibayar", "dicatatOleh")
         VALUES ($1, $2, $3, $4, $5, 0, $6)`,
        [id, sid, jenis, nominal, bulan, req.user.nama],
      );
      createdIds.push(id);
    }
  });

  if (createdIds.length === 1) {
    const row = await queryOne('SELECT * FROM "Tagihan" WHERE "id" = $1', [createdIds[0]]);
    return res.status(201).json(row);
  }

  res.status(201).json({ createdCount: createdIds.length, ids: createdIds });
}));

router.put("/tagihan/:id", requireAuth, requireAdministrasi, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { jumlah, jumlahDibayar } = req.body || {};

  const row = await queryOne('SELECT * FROM "Tagihan" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Tagihan tidak ditemukan.");

  const newJumlah = jumlah !== undefined ? Number(jumlah) : Number(row.jumlah);
  const newJumlahDibayar = jumlahDibayar !== undefined ? Number(jumlahDibayar) : Number(row.jumlahDibayar);

  if (isNaN(newJumlah) || newJumlah <= 0) {
    throw new CashlessError(400, "Jumlah tagihan harus lebih besar dari 0.");
  }
  if (isNaN(newJumlahDibayar) || newJumlahDibayar < 0) {
    throw new CashlessError(400, "Jumlah dibayar tidak boleh negatif.");
  }

  await query(
    `UPDATE "Tagihan"
     SET "jumlah" = $1::bigint,
         "jumlahDibayar" = $2::bigint,
         "tanggalBayarISO" = CASE WHEN $2::bigint > 0 THEN COALESCE("tanggalBayarISO", $3) ELSE NULL END
     WHERE "id" = $4`,
    [newJumlah, newJumlahDibayar, todayISO(), id],
  );

  const updated = await queryOne('SELECT * FROM "Tagihan" WHERE "id" = $1', [id]);
  res.json({
    ...updated,
    jumlah: Number(updated.jumlah),
    jumlahDibayar: Number(updated.jumlahDibayar),
  });
}));

router.delete("/tagihan/:id", requireAuth, requireAdministrasi, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const row = await queryOne('SELECT * FROM "Tagihan" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Tagihan tidak ditemukan.");

  await query('DELETE FROM "Tagihan" WHERE "id" = $1', [id]);
  res.json({ id, deleted: true });
}));

const handleBayarTagihan = asyncHandler(async (req, res) => {
  const { jumlahBayar } = req.body || {};
  const nominalBayar = Number(jumlahBayar);
  if (!nominalBayar || nominalBayar <= 0) {
    throw new CashlessError(400, "Jumlah bayar harus lebih besar dari 0.");
  }

  const tagihanId = req.params.id;
  await withTransaction(async (client) => {
    const row = await client.query('SELECT * FROM "Tagihan" WHERE "id" = $1 FOR UPDATE', [tagihanId]);
    if (!row.rowCount) throw new CashlessError(404, "Tagihan tidak ditemukan.");

    const t = row.rows[0];
    const santriRow = await client.query('SELECT "nama" FROM "Santri" WHERE "id" = $1', [t.santriId]);
    const namaSantri = santriRow.rows[0]?.nama || "";
    const totalSemula = Number(t.jumlah);
    const sudahDibayar = Number(t.jumlahDibayar || 0);
    const totalDibayarBaru = sudahDibayar + nominalBayar;

    if (totalDibayarBaru > totalSemula) {
      throw new CashlessError(400, `Jumlah bayar melebihi sisa tagihan (${totalSemula - sudahDibayar}).`);
    }

    const tISO = todayISO();
    const bln = tISO.slice(0, 7);

    await client.query(
      `UPDATE "Tagihan" SET "jumlahDibayar" = $1, "tanggalBayarISO" = $2 WHERE "id" = $3`,
      [totalDibayarBaru, tISO, tagihanId],
    );

    // Otomatis catat arus kas masuk ke Cashflow
    const santriKet = namaSantri ? ` - ${namaSantri}` : "";
    await client.query(
      `INSERT INTO "Cashflow" ("id", "bulan", "tanggalISO", "jenis", "kategori", "jumlah", "keterangan", "dicatatOleh")
       VALUES ($1, $2, $3, 'Masuk', 'Pembayaran Santri', $4, $5, $6)`,
      [uid(), bln, tISO, nominalBayar, `Pembayaran tagihan ${t.jenis}${santriKet}`, req.user.nama],
    );
  });

  const updated = await queryOne('SELECT * FROM "Tagihan" WHERE "id" = $1', [tagihanId]);
  res.json({
    ...updated,
    jumlah: Number(updated.jumlah),
    jumlahDibayar: Number(updated.jumlahDibayar),
  });
});

router.post("/tagihan/:id/bayar", requireAuth, requireAdministrasi, handleBayarTagihan);
router.put("/tagihan/:id/bayar", requireAuth, requireAdministrasi, handleBayarTagihan);

// ==================== CASHFLOW / ARUS KAS ====================

router.get("/cashflow", requireAuth, asyncHandler(async (req, res) => {
  const bulan = req.query.bulan;
  const unit = req.query.unit;

  const kondisi = [];
  const params = [];

  if (bulan && bulan !== "Semua") {
    params.push(bulan);
    kondisi.push(`"bulan" = $${params.length}`);
  }

  if (unit && unit !== "Semua") {
    params.push(unit);
    kondisi.push(`"unit" = $${params.length}`);
  }

  const where = kondisi.length ? `WHERE ${kondisi.join(" AND ")}` : "";
  const rows = await queryAll(`SELECT * FROM "Cashflow" ${where} ORDER BY "tanggalISO" DESC, "createdAt" DESC`, params);
  res.json(rows.map((r) => ({ ...r, jumlah: Number(r.jumlah) })));
}));

router.post("/cashflow", requireAuth, requireAdministrasi, asyncHandler(async (req, res) => {
  const { jenis, kategori, unit, jumlah, keterangan, bulan } = req.body || {};
  const nominal = Number(jumlah);
  if (!["Masuk", "Keluar"].includes(jenis) || !kategori || !nominal || nominal <= 0) {
    throw new CashlessError(400, "Jenis ('Masuk'/'Keluar'), kategori, dan jumlah valid wajib diisi.");
  }

  const id = uid();
  const tISO = todayISO();
  const bln = bulan || tISO.slice(0, 7);

  await query(
    `INSERT INTO "Cashflow" ("id", "bulan", "tanggalISO", "jenis", "kategori", "unit", "jumlah", "keterangan", "dicatatOleh")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, bln, tISO, jenis, kategori, unit || null, nominal, keterangan || null, req.user.nama],
  );

  const row = await queryOne('SELECT * FROM "Cashflow" WHERE "id" = $1', [id]);
  res.status(201).json({ ...row, jumlah: Number(row.jumlah) });
}));

router.delete("/cashflow/:id", requireAuth, requireAdministrasi, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const row = await queryOne('SELECT * FROM "Cashflow" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Transaksi kas tidak ditemukan.");

  await query('DELETE FROM "Cashflow" WHERE "id" = $1', [id]);
  res.json({ id, deleted: true });
}));

// ==================== PENGAJUAN ANGGARAN ====================

router.get("/anggaran", requireAuth, asyncHandler(async (req, res) => {
  const status = req.query.status;
  const kondisi = [];
  const params = [];

  if (status && status !== "Semua") {
    params.push(status);
    kondisi.push(`"status" = $${params.length}`);
  }

  const where = kondisi.length ? `WHERE ${kondisi.join(" AND ")}` : "";
  const rows = await queryAll(`SELECT * FROM "PengajuanAnggaran" ${where} ORDER BY "createdAt" DESC`, params);

  const pengajuanIds = rows.map((r) => r.id);
  const rincianMap = {};
  if (pengajuanIds.length) {
    const rincianRows = await queryAll(
      `SELECT * FROM "RincianAnggaran" WHERE "pengajuanId" = ANY($1::text[]) ORDER BY "id" ASC`,
      [pengajuanIds],
    );
    for (const r of rincianRows) {
      if (!rincianMap[r.pengajuanId]) rincianMap[r.pengajuanId] = [];
      rincianMap[r.pengajuanId].push({
        id: r.id,
        uraian: r.uraian,
        qty: Number(r.qty),
        hargaSatuan: Number(r.hargaSatuan),
        subtotal: Number(r.subtotal),
      });
    }
  }

  res.json(rows.map((r) => ({
    ...r,
    totalAnggaran: Number(r.totalAnggaran),
    realisasiJumlah: r.realisasiJumlah ? Number(r.realisasiJumlah) : null,
    rincian: rincianMap[r.id] || [],
  })));
}));

router.post("/anggaran", requireAuth, requireAdministrasi, asyncHandler(async (req, res) => {
  const { namaKegiatan, unitPengaju, ketuaBagianNama, kategori, bulanRencana, totalAnggaran, rincian, catatan } = req.body || {};
  let nominal = Number(totalAnggaran);

  if (Array.isArray(rincian) && rincian.length && (!nominal || nominal <= 0)) {
    nominal = rincian.reduce((acc, it) => acc + (Number(it.qty || 1) * Number(it.hargaSatuan || 0)), 0);
  }

  if (!namaKegiatan || !kategori || !bulanRencana || !nominal || nominal <= 0) {
    throw new CashlessError(400, "Nama kegiatan, kategori, bulan rencana, dan total anggaran wajib diisi.");
  }

  const id = uid();
  const tISO = todayISO();

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO "PengajuanAnggaran"
        ("id", "namaKegiatan", "unitPengaju", "ketuaBagianNama", "kategori", "bulanRencana", "totalAnggaran", "status", "tanggalPengajuanISO", "diajukanOleh", "catatan")
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Diajukan', $8, $9, $10)`,
      [id, namaKegiatan.trim(), unitPengaju || req.user.unit || null, ketuaBagianNama || null, kategori, bulanRencana, nominal, tISO, req.user.nama, catatan || null],
    );

    if (Array.isArray(rincian) && rincian.length) {
      for (const item of rincian) {
        const qty = Number(item.qty || 1);
        const hargaSatuan = Number(item.hargaSatuan || 0);
        await client.query(
          `INSERT INTO "RincianAnggaran" ("id", "pengajuanId", "uraian", "qty", "hargaSatuan", "subtotal")
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [uid(), id, item.uraian || "-", qty, hargaSatuan, qty * hargaSatuan],
        );
      }
    }
  });

  const row = await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1', [id]);
  const rincianItems = await queryAll('SELECT * FROM "RincianAnggaran" WHERE "pengajuanId" = $1', [id]);
  res.status(201).json({
    ...row,
    totalAnggaran: Number(row.totalAnggaran),
    rincian: rincianItems.map((r) => ({
      id: r.id,
      uraian: r.uraian,
      qty: Number(r.qty),
      hargaSatuan: Number(r.hargaSatuan),
      subtotal: Number(r.subtotal),
    })),
  });
}));

router.post("/anggaran/:id/setujui", requireAuth, requireAdministrasi, asyncHandler(async (req, res) => {
  const { pimpinanId, catatan } = req.body || {};
  const id = req.params.id;

  const row = await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Pengajuan anggaran tidak ditemukan.");

  await query(
    `UPDATE "PengajuanAnggaran"
     SET "status" = 'Disetujui',
         "pimpinanId" = $1,
         "disetujuiOleh" = $2,
         "tanggalKeputusanISO" = $3,
         "catatan" = COALESCE($4, "catatan")
     WHERE "id" = $5`,
    [pimpinanId || null, req.user.nama, todayISO(), catatan || null, id],
  );

  const updated = await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1', [id]);
  res.json({
    ...updated,
    totalAnggaran: Number(updated.totalAnggaran),
    realisasiJumlah: updated.realisasiJumlah ? Number(updated.realisasiJumlah) : null,
  });
}));

router.post("/anggaran/:id/tolak", requireAuth, requireAdministrasi, asyncHandler(async (req, res) => {
  const { catatan, alasan } = req.body || {};
  const id = req.params.id;

  const row = await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Pengajuan anggaran tidak ditemukan.");

  await query(
    `UPDATE "PengajuanAnggaran"
     SET "status" = 'Ditolak',
         "tanggalKeputusanISO" = $1,
         "catatan" = COALESCE($2, "catatan")
     WHERE "id" = $3`,
    [todayISO(), catatan || alasan || null, id],
  );

  const updated = await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1', [id]);
  res.json({
    ...updated,
    totalAnggaran: Number(updated.totalAnggaran),
    realisasiJumlah: updated.realisasiJumlah ? Number(updated.realisasiJumlah) : null,
  });
}));

router.post("/anggaran/:id/realisasi", requireAuth, requireAdministrasi, asyncHandler(async (req, res) => {
  const { jumlahRealisasi } = req.body || {};
  const id = req.params.id;
  const nominalRealisasi = Number(jumlahRealisasi);

  if (!nominalRealisasi || nominalRealisasi <= 0) {
    throw new CashlessError(400, "Jumlah realisasi harus lebih besar dari 0.");
  }

  await withTransaction(async (client) => {
    const row = await client.query('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row.rowCount) throw new CashlessError(404, "Pengajuan anggaran tidak ditemukan.");

    const p = row.rows[0];
    const tISO = todayISO();
    const bln = p.bulanRencana || tISO.slice(0, 7);

    await client.query(
      `UPDATE "PengajuanAnggaran"
       SET "status" = 'Direalisasikan',
           "realisasiJumlah" = $1,
           "realisasiTanggalISO" = $2
       WHERE "id" = $3`,
      [nominalRealisasi, tISO, id],
    );

    // Otomatis catat arus kas keluar ke Cashflow
    await client.query(
      `INSERT INTO "Cashflow" ("id", "bulan", "tanggalISO", "jenis", "kategori", "unit", "jumlah", "keterangan", "dicatatOleh")
       VALUES ($1, $2, $3, 'Keluar', $4, $5, $6, $7, $8)`,
      [uid(), bln, tISO, p.kategori, p.unitPengaju || null, nominalRealisasi, `Realisasi anggaran: ${p.namaKegiatan}`, req.user.nama],
    );
  });

  const updated = await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1', [id]);
  res.json({
    ...updated,
    totalAnggaran: Number(updated.totalAnggaran),
    realisasiJumlah: updated.realisasiJumlah ? Number(updated.realisasiJumlah) : null,
  });
}));

router.post("/anggaran/:id/proses", requireAuth, requireAdministrasi, asyncHandler(async (req, res) => {
  const { disetujui, realisasiJumlah, catatan, pimpinanId } = req.body || {};
  const id = req.params.id;

  const row = await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Pengajuan anggaran tidak ditemukan.");

  const statusBaru = disetujui ? "Disetujui" : "Ditolak";
  const realisasiVal = disetujui && realisasiJumlah !== undefined ? Number(realisasiJumlah) : null;

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE "PengajuanAnggaran"
       SET "status" = $1, "disetujuiOleh" = $2, "tanggalKeputusanISO" = $3, "realisasiJumlah" = $4,
           "pimpinanId" = COALESCE($5, "pimpinanId"), "catatan" = COALESCE($6, "catatan")
       WHERE "id" = $7`,
      [statusBaru, req.user.nama, todayISO(), realisasiVal, pimpinanId || null, catatan || null, id],
    );

    if (disetujui && realisasiVal && realisasiVal > 0) {
      const tISO = todayISO();
      const bln = row.bulanRencana || tISO.slice(0, 7);
      await client.query(
        `INSERT INTO "Cashflow" ("id", "bulan", "tanggalISO", "jenis", "kategori", "unit", "jumlah", "keterangan", "dicatatOleh")
         VALUES ($1, $2, $3, 'Keluar', $4, $5, $6, $7, $8)`,
        [uid(), bln, tISO, row.kategori, row.unitPengaju || null, realisasiVal, `Realisasi anggaran: ${row.namaKegiatan}`, req.user.nama],
      );
    }
  });

  const updated = await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1', [id]);
  res.json({
    ...updated,
    totalAnggaran: Number(updated.totalAnggaran),
    realisasiJumlah: updated.realisasiJumlah ? Number(updated.realisasiJumlah) : null,
  });
}));

router.delete("/anggaran/:id", requireAuth, requireAdministrasi, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const row = await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Pengajuan anggaran tidak ditemukan.");

  await withTransaction(async (client) => {
    await client.query('DELETE FROM "RincianAnggaran" WHERE "pengajuanId" = $1', [id]);
    await client.query('DELETE FROM "PengajuanAnggaran" WHERE "id" = $1', [id]);
  });

  res.json({ id, deleted: true });
}));

// ==================== INVENTARIS PESANTREN ====================

router.get("/inventaris", requireAuth, asyncHandler(async (req, res) => {
  const { kategori, kondisi } = req.query;
  const kondisiSql = [];
  const params = [];

  if (kategori && kategori !== "Semua") {
    params.push(kategori);
    kondisiSql.push(`"kategori" = $${params.length}`);
  }

  if (kondisi && kondisi !== "Semua") {
    params.push(kondisi);
    kondisiSql.push(`"kondisi" = $${params.length}`);
  }

  const where = kondisiSql.length ? `WHERE ${kondisiSql.join(" AND ")}` : "";
  const rows = await queryAll(`SELECT * FROM "Inventaris" ${where} ORDER BY "createdAt" DESC`, params);
  res.json(rows.map((r) => ({
    ...r,
    jumlah: Number(r.jumlah),
  })));
}));

router.post("/inventaris", requireAuth, requireAdministrasi, asyncHandler(async (req, res) => {
  const { nama, kategori, jumlah, kondisi, lokasi, tanggal, tanggalPengadaan, keterangan } = req.body || {};
  const jml = Number(jumlah);

  if (!nama || !kategori || isNaN(jml) || jml < 0) {
    throw new CashlessError(400, "Nama, kategori, dan jumlah valid wajib diisi.");
  }

  const id = uid();
  const tgl = tanggal || tanggalPengadaan || todayISO();

  await query(
    `INSERT INTO "Inventaris" ("id", "nama", "kategori", "jumlah", "kondisi", "lokasi", "tanggal", "keterangan", "dicatatOleh")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, nama.trim(), kategori, jml, kondisi || "Baik", lokasi || null, tgl || null, keterangan || null, req.user.nama],
  );

  const row = await queryOne('SELECT * FROM "Inventaris" WHERE "id" = $1', [id]);
  res.status(201).json({
    ...row,
    jumlah: Number(row.jumlah),
  });
}));

router.put("/inventaris/:id", requireAuth, requireAdministrasi, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const row = await queryOne('SELECT * FROM "Inventaris" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Inventaris tidak ditemukan.");

  const { nama, kategori, jumlah, kondisi, lokasi, tanggal, tanggalPengadaan, keterangan } = req.body || {};
  const newNama = nama !== undefined ? nama.trim() : row.nama;
  const newKat = kategori !== undefined ? kategori : row.kategori;
  const newJml = jumlah !== undefined ? Number(jumlah) : Number(row.jumlah);
  const newKondisi = kondisi !== undefined ? kondisi : row.kondisi;
  const newLokasi = lokasi !== undefined ? lokasi : row.lokasi;
  const newTanggal = (tanggal !== undefined || tanggalPengadaan !== undefined) ? (tanggal || tanggalPengadaan) : row.tanggal;
  const newKet = keterangan !== undefined ? keterangan : row.keterangan;

  if (!newNama || !newKat || isNaN(newJml) || newJml < 0) {
    throw new CashlessError(400, "Nama, kategori, dan jumlah valid wajib diisi.");
  }

  await query(
    `UPDATE "Inventaris"
     SET "nama" = $1, "kategori" = $2, "jumlah" = $3, "kondisi" = $4, "lokasi" = $5, "tanggal" = $6, "keterangan" = $7
     WHERE "id" = $8`,
    [newNama, newKat, newJml, newKondisi, newLokasi, newTanggal, newKet, id],
  );

  const updated = await queryOne('SELECT * FROM "Inventaris" WHERE "id" = $1', [id]);
  res.json({
    ...updated,
    jumlah: Number(updated.jumlah),
  });
}));

router.delete("/inventaris/:id", requireAuth, requireAdministrasi, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const row = await queryOne('SELECT * FROM "Inventaris" WHERE "id" = $1', [id]);
  if (!row) throw new CashlessError(404, "Inventaris tidak ditemukan.");

  await query('DELETE FROM "Inventaris" WHERE "id" = $1', [id]);
  res.json({ id, deleted: true });
}));

module.exports = router;
