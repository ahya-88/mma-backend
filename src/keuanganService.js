const crypto = require("crypto");
const { query, queryOne, queryAll, withTransaction } = require("./db");
const { CashlessError, getSantriRow, todayISO } = require("./cashlessService");

const uid = () => crypto.randomUUID();
const JENIS_TAGIHAN = ["Syahriyah", "Uang Pangkal", "Seragam", "Kegiatan/Kitab", "Kesehatan", "Lainnya"];
const KATEGORI_CASHFLOW = [
  "Pembayaran Santri", "Infaq/Donasi", "Bantuan Pemerintah", "Operasional",
  "Gaji/Honor", "Konsumsi", "Perbaikan/Maintenance", "Lainnya",
  "Unit Usaha - Dana Masuk", "Unit Usaha - Dana Keluar", "Unit Usaha - Transfer Antar Bagian"
];
const JENIS_TRANSAKSI_UNIT = ["Dana Masuk", "Dana Keluar", "Transfer Antar Bagian"];
const STATUS_ANGGARAN = ["Diajukan", "Disetujui", "Ditolak", "Direalisasikan"];

async function catatAuditKeuangan({ aktorId, aksi, targetTipe, targetId, detail }) {
  await query(`INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
    VALUES ($1, $2, 'guru', $3, $4, $5, $6::jsonb)`,
  [uid(), aktorId || null, aksi, targetTipe, targetId || null, JSON.stringify(detail || {})]);
}

function statusTagihan(tagihan) {
  return (tagihan.jumlahDibayar || 0) >= tagihan.jumlah ? "Lunas" : (tagihan.jumlahDibayar || 0) > 0 ? "Sebagian" : "Belum Lunas";
}

async function buatTagihan({ santriIds, jenis, jumlah, bulan, dicatatOleh, aktorId }) {
  return withTransaction(async () => {
    if (!Array.isArray(santriIds) || !santriIds.length) throw new CashlessError(400, "Minimal satu santri tujuan tagihan wajib diisi.");
    if (!jenis || !jumlah || !bulan) throw new CashlessError(400, "Jenis, jumlah, dan bulan tagihan wajib diisi.");
    const dibuat = [];
    for (const santriId of santriIds) {
      await getSantriRow(santriId);
      const row = { id: uid(), santriId, jenis, jumlah: Number(jumlah), bulan, jumlahDibayar: 0, tanggalBayarISO: null, dicatatOleh: dicatatOleh || null };
      await query('INSERT INTO "Tagihan" ("id", "santriId", "jenis", "jumlah", "bulan", "jumlahDibayar", "tanggalBayarISO", "dicatatOleh") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [row.id, row.santriId, row.jenis, row.jumlah, row.bulan, row.jumlahDibayar, row.tanggalBayarISO, row.dicatatOleh]);
      dibuat.push(row);
    }
    await catatAuditKeuangan({
      aktorId, aksi: "keuangan.tagihan_created", targetTipe: "Tagihan", targetId: dibuat[0].id,
      detail: { jumlahTagihan: dibuat.length, jenis, jumlah: Number(jumlah), bulan },
    });
    return dibuat;
  });
}

const semuaTagihan = () => queryAll('SELECT * FROM "Tagihan" ORDER BY "createdAt" DESC');
const tagihanSantri = (santriId) => queryAll('SELECT * FROM "Tagihan" WHERE "santriId" = $1 ORDER BY "createdAt" DESC', [santriId]);

async function hapusTagihan(id, aktorId) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "Tagihan" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Data tagihan tidak ditemukan.");
    await query('DELETE FROM "Tagihan" WHERE "id" = $1', [id]);
    await catatAuditKeuangan({ aktorId, aksi: "keuangan.tagihan_deleted", targetTipe: "Tagihan", targetId: id, detail: {} });
    return row;
  });
}

async function editTagihanNominal({ id, jumlah, jumlahDibayar, aktorId }) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "Tagihan" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Data tagihan tidak ditemukan.");
    jumlah = Number(jumlah);
    jumlahDibayar = Number(jumlahDibayar);
    if (!jumlah || jumlahDibayar < 0) throw new CashlessError(400, "Jumlah tagihan/dibayar tidak valid.");
    const dibayarBaru = Math.min(jumlahDibayar, jumlah);
    await query('UPDATE "Tagihan" SET "jumlah" = $1, "jumlahDibayar" = $2 WHERE "id" = $3', [jumlah, dibayarBaru, id]);
    await catatAuditKeuangan({
      aktorId, aksi: "keuangan.tagihan_amount_changed", targetTipe: "Tagihan", targetId: id,
      detail: { jumlahLama: Number(row.jumlah), jumlahBaru: jumlah, dibayarLama: Number(row.jumlahDibayar || 0), dibayarBaru },
    });
    return queryOne('SELECT * FROM "Tagihan" WHERE "id" = $1', [id]);
  });
}

async function catatPembayaran({ tagihanId, jumlahBayar, dicatatOleh, aktorId }) {
  return withTransaction(async () => {
    const tagihan = await queryOne('SELECT * FROM "Tagihan" WHERE "id" = $1 FOR UPDATE', [tagihanId]);
    if (!tagihan) throw new CashlessError(404, "Data tagihan tidak ditemukan.");
    jumlahBayar = Number(jumlahBayar);
    if (!jumlahBayar || jumlahBayar <= 0) throw new CashlessError(400, "Jumlah bayar harus lebih dari 0.");
    const dibayarBaru = Math.min(Number(tagihan.jumlah), (Number(tagihan.jumlahDibayar) || 0) + jumlahBayar);
    await query('UPDATE "Tagihan" SET "jumlahDibayar" = $1, "tanggalBayarISO" = $2 WHERE "id" = $3', [dibayarBaru, todayISO(), tagihanId]);
    const santri = await getSantriRow(tagihan.santriId);
    const cashflow = {
      id: uid(), bulan: tagihan.bulan, tanggalISO: todayISO(), jenis: "Masuk", kategori: "Pembayaran Santri",
      jumlah: jumlahBayar, keterangan: `Pembayaran ${tagihan.jenis} a.n. ${santri.nama}`, dicatatOleh: dicatatOleh || null,
    };
    await query('INSERT INTO "Cashflow" ("id", "bulan", "tanggalISO", "jenis", "kategori", "jumlah", "keterangan", "dicatatOleh") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [cashflow.id, cashflow.bulan, cashflow.tanggalISO, cashflow.jenis, cashflow.kategori, cashflow.jumlah, cashflow.keterangan, cashflow.dicatatOleh]);
    await catatAuditKeuangan({
      aktorId, aksi: "keuangan.tagihan_payment_recorded", targetTipe: "Tagihan", targetId: tagihanId,
      detail: { jumlahBayar, jumlahDibayarSebelumnya: Number(tagihan.jumlahDibayar || 0), jumlahDibayar: dibayarBaru },
    });
    return { tagihan: await queryOne('SELECT * FROM "Tagihan" WHERE "id" = $1', [tagihanId]), cashflow };
  });
}

async function catatCashflow({ bulan, jenis, kategori, unit, jumlah, keterangan, dicatatOleh, aktorId }) {
  return withTransaction(async () => {
    if (!bulan || !jenis || !kategori || !jumlah) throw new CashlessError(400, "Bulan, jenis, kategori, dan jumlah wajib diisi.");
    if (!["Masuk", "Keluar"].includes(jenis)) throw new CashlessError(400, "Jenis cashflow harus Masuk atau Keluar.");
    if (!KATEGORI_CASHFLOW.includes(kategori)) throw new CashlessError(400, "Kategori cashflow tidak valid.");
    const row = { id: uid(), bulan, tanggalISO: todayISO(), jenis, kategori, unit: unit || null, jumlah: Number(jumlah), keterangan: keterangan || null, dicatatOleh: dicatatOleh || null };
    await query('INSERT INTO "Cashflow" ("id", "bulan", "tanggalISO", "jenis", "kategori", "unit", "jumlah", "keterangan", "dicatatOleh") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [row.id, row.bulan, row.tanggalISO, row.jenis, row.kategori, row.unit, row.jumlah, row.keterangan, row.dicatatOleh]);
    await catatAuditKeuangan({
      aktorId, aksi: "keuangan.cashflow_recorded", targetTipe: "Cashflow", targetId: row.id,
      detail: { jenis, kategori, unit: row.unit, jumlah: row.jumlah },
    });
    return row;
  });
}

const semuaCashflow = (unit) => {
  if (unit && unit !== "Semua") {
    return queryAll('SELECT * FROM "Cashflow" WHERE "unit" = $1 ORDER BY "createdAt" DESC', [unit]);
  }
  return queryAll('SELECT * FROM "Cashflow" ORDER BY "createdAt" DESC');
};

async function catatTransaksiUnitUsaha({ jenis, unitAsal, unitTujuan, jumlah, keterangan, dicatatOleh, aktorId }) {
  return withTransaction(async () => {
    if (!jenis || !JENIS_TRANSAKSI_UNIT.includes(jenis)) {
      throw new CashlessError(400, "Jenis transaksi unit usaha harus Dana Masuk, Dana Keluar, atau Transfer Antar Bagian.");
    }
    const nominal = Number(jumlah);
    if (!nominal || nominal <= 0) {
      throw new CashlessError(400, "Jumlah transaksi unit usaha harus lebih dari 0.");
    }

    if (jenis === "Dana Masuk") {
      if (!unitTujuan || !unitTujuan.trim()) throw new CashlessError(400, "Unit tujuan wajib dipilih untuk Dana Masuk.");
      unitAsal = null;
      unitTujuan = unitTujuan.trim();
    } else if (jenis === "Dana Keluar") {
      if (!unitAsal || !unitAsal.trim()) throw new CashlessError(400, "Unit asal wajib dipilih untuk Dana Keluar / Pencairan Saldo.");
      unitAsal = unitAsal.trim();
      unitTujuan = null;
    } else if (jenis === "Transfer Antar Bagian") {
      if (!unitAsal || !unitAsal.trim() || !unitTujuan || !unitTujuan.trim()) {
        throw new CashlessError(400, "Unit asal dan unit tujuan wajib dipilih untuk Transfer Antar Bagian.");
      }
      unitAsal = unitAsal.trim();
      unitTujuan = unitTujuan.trim();
      if (unitAsal === unitTujuan) {
        throw new CashlessError(400, "Unit asal dan unit tujuan tidak boleh sama.");
      }
    }

    const tISO = todayISO();
    const bulan = tISO.slice(0, 7);
    const tx = {
      id: uid(),
      jenis,
      unitAsal: unitAsal || null,
      unitTujuan: unitTujuan || null,
      jumlah: nominal,
      keterangan: keterangan || null,
      dicatatOleh: dicatatOleh || null,
      tanggalISO: tISO,
      bulan,
    };

    await query(
      `INSERT INTO "TransaksiUnitUsaha" ("id", "jenis", "unitAsal", "unitTujuan", "jumlah", "keterangan", "dicatatOleh", "tanggalISO", "bulan")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [tx.id, tx.jenis, tx.unitAsal, tx.unitTujuan, tx.jumlah, tx.keterangan, tx.dicatatOleh, tx.tanggalISO, tx.bulan]
    );

    const cashflowsCreated = [];

    if (jenis === "Dana Masuk") {
      const c1 = {
        id: uid(),
        bulan,
        tanggalISO: tISO,
        jenis: "Masuk",
        kategori: "Unit Usaha - Dana Masuk",
        unit: unitTujuan,
        jumlah: nominal,
        keterangan: `[${unitTujuan}] Dana Masuk: ${keterangan || 'Penambahan Saldo/Modal'}`,
        dicatatOleh: dicatatOleh || null,
      };
      await query(
        `INSERT INTO "Cashflow" ("id", "bulan", "tanggalISO", "jenis", "kategori", "unit", "jumlah", "keterangan", "dicatatOleh")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [c1.id, c1.bulan, c1.tanggalISO, c1.jenis, c1.kategori, c1.unit, c1.jumlah, c1.keterangan, c1.dicatatOleh]
      );
      cashflowsCreated.push(c1);
    } else if (jenis === "Dana Keluar") {
      const c1 = {
        id: uid(),
        bulan,
        tanggalISO: tISO,
        jenis: "Keluar",
        kategori: "Unit Usaha - Dana Keluar",
        unit: unitAsal,
        jumlah: nominal,
        keterangan: `[${unitAsal}] Dana Keluar/Pencairan: ${keterangan || 'Pencairan Saldo/Pengeluaran'}`,
        dicatatOleh: dicatatOleh || null,
      };
      await query(
        `INSERT INTO "Cashflow" ("id", "bulan", "tanggalISO", "jenis", "kategori", "unit", "jumlah", "keterangan", "dicatatOleh")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [c1.id, c1.bulan, c1.tanggalISO, c1.jenis, c1.kategori, c1.unit, c1.jumlah, c1.keterangan, c1.dicatatOleh]
      );
      cashflowsCreated.push(c1);
    } else if (jenis === "Transfer Antar Bagian") {
      const cOut = {
        id: uid(),
        bulan,
        tanggalISO: tISO,
        jenis: "Keluar",
        kategori: "Unit Usaha - Transfer Antar Bagian",
        unit: unitAsal,
        jumlah: nominal,
        keterangan: `[${unitAsal}] Transfer Keluar ke ${unitTujuan}: ${keterangan || 'Transfer Antar Bagian'}`,
        dicatatOleh: dicatatOleh || null,
      };
      const cIn = {
        id: uid(),
        bulan,
        tanggalISO: tISO,
        jenis: "Masuk",
        kategori: "Unit Usaha - Transfer Antar Bagian",
        unit: unitTujuan,
        jumlah: nominal,
        keterangan: `[${unitTujuan}] Transfer Masuk dari ${unitAsal}: ${keterangan || 'Transfer Antar Bagian'}`,
        dicatatOleh: dicatatOleh || null,
      };
      await query(
        `INSERT INTO "Cashflow" ("id", "bulan", "tanggalISO", "jenis", "kategori", "unit", "jumlah", "keterangan", "dicatatOleh")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [cOut.id, cOut.bulan, cOut.tanggalISO, cOut.jenis, cOut.kategori, cOut.unit, cOut.jumlah, cOut.keterangan, cOut.dicatatOleh]
      );
      await query(
        `INSERT INTO "Cashflow" ("id", "bulan", "tanggalISO", "jenis", "kategori", "unit", "jumlah", "keterangan", "dicatatOleh")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [cIn.id, cIn.bulan, cIn.tanggalISO, cIn.jenis, cIn.kategori, cIn.unit, cIn.jumlah, cIn.keterangan, cIn.dicatatOleh]
      );
      cashflowsCreated.push(cOut, cIn);
    }

    await catatAuditKeuangan({
      aktorId,
      aksi: "transaksi_unit_usaha.created",
      targetTipe: "TransaksiUnitUsaha",
      targetId: tx.id,
      detail: { jenis, unitAsal, unitTujuan, jumlah: nominal },
    });

    return { transaksi: tx, cashflows: cashflowsCreated };
  });
}

async function semuaTransaksiUnitUsaha({ unit } = {}) {
  if (unit && unit !== "Semua") {
    return queryAll(
      'SELECT * FROM "TransaksiUnitUsaha" WHERE "unitAsal" = $1 OR "unitTujuan" = $1 ORDER BY "createdAt" DESC',
      [unit]
    );
  }
  return queryAll('SELECT * FROM "TransaksiUnitUsaha" ORDER BY "createdAt" DESC');
}

async function hapusTransaksiUnitUsaha(id, aktorId) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "TransaksiUnitUsaha" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Data transaksi unit usaha tidak ditemukan.");
    await query('DELETE FROM "TransaksiUnitUsaha" WHERE "id" = $1', [id]);
    await catatAuditKeuangan({
      aktorId,
      aksi: "transaksi_unit_usaha.deleted",
      targetTipe: "TransaksiUnitUsaha",
      targetId: id,
      detail: { jenis: row.jenis, unitAsal: row.unitAsal, unitTujuan: row.unitTujuan, jumlah: Number(row.jumlah) },
    });
    return row;
  });
}

async function laporanCashflowUnitUsaha({ unit } = {}) {
  const unitsList = await queryAll('SELECT "nama" FROM "UnitUsaha" ORDER BY "nama"');
  const unitNames = unitsList.length ? unitsList.map((u) => u.nama) : ["Kantin", "Kopel", "Dapur", "BMT"];

  const transactions = await semuaTransaksiUnitUsaha({ unit });
  const cashflows = await semuaCashflow(unit && unit !== "Semua" ? unit : undefined);

  const cashlessPerUnit = await queryAll(
    'SELECT "unit", COALESCE(SUM("jumlah"), 0) AS "total" FROM "TransaksiCashless" GROUP BY "unit"'
  );
  const cashlessMap = {};
  for (const row of cashlessPerUnit) {
    if (row.unit) cashlessMap[row.unit] = Number(row.total || 0);
  }

  const ringkasan = {};
  for (const name of unitNames) {
    ringkasan[name] = {
      unit: name,
      penerimaanKasir: cashlessMap[name] || 0,
      danaMasuk: 0,
      danaKeluar: 0,
      netSaldo: 0,
    };
  }

  for (const cf of cashflows) {
    const uName = cf.unit;
    if (uName) {
      if (!ringkasan[uName]) {
        ringkasan[uName] = {
          unit: uName,
          penerimaanKasir: cashlessMap[uName] || 0,
          danaMasuk: 0,
          danaKeluar: 0,
          netSaldo: 0,
        };
      }
      const amt = Number(cf.jumlah || 0);
      if (cf.jenis === "Masuk") {
        ringkasan[uName].danaMasuk += amt;
      } else if (cf.jenis === "Keluar") {
        ringkasan[uName].danaKeluar += amt;
      }
    }
  }

  for (const uName of Object.keys(ringkasan)) {
    const u = ringkasan[uName];
    u.netSaldo = (u.penerimaanKasir + u.danaMasuk) - u.danaKeluar;
  }

  return {
    unit: unit || "Semua",
    unitsAvailable: unitNames,
    ringkasan,
    transaksiList: transactions.map((t) => ({ ...t, jumlah: Number(t.jumlah) })),
    cashflowList: cashflows.map((c) => ({ ...c, jumlah: Number(c.jumlah) })),
  };
}

async function hapusCashflow(id, aktorId) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "Cashflow" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Data cashflow tidak ditemukan.");
    await query('DELETE FROM "Cashflow" WHERE "id" = $1', [id]);
    await catatAuditKeuangan({ aktorId, aksi: "keuangan.cashflow_deleted", targetTipe: "Cashflow", targetId: id, detail: {} });
    return row;
  });
}

async function lampirkanRincian(pengajuan) {
  const rincian = await queryAll('SELECT "id", "uraian", "qty", "hargaSatuan", "subtotal" FROM "RincianAnggaran" WHERE "pengajuanId" = $1', [pengajuan.id]);
  return { ...pengajuan, rincian };
}

async function semuaPengajuan() {
  const rows = await queryAll('SELECT * FROM "PengajuanAnggaran" ORDER BY "createdAt" DESC');
  return Promise.all(rows.map(lampirkanRincian));
}

async function ajukanAnggaran({ namaKegiatan, unitPengaju, ketuaBagianNama, kategori, bulanRencana, catatan, rincian, diajukanOleh }) {
  return withTransaction(async () => {
    if (!namaKegiatan || !kategori || !bulanRencana) throw new CashlessError(400, "Nama kegiatan, kategori, dan bulan rencana wajib diisi.");
    if (!Array.isArray(rincian) || !rincian.length) throw new CashlessError(400, "Minimal satu baris rincian anggaran wajib diisi.");
    const rincianBersih = rincian.map((item) => {
      const qty = Number(item.qty), hargaSatuan = Number(item.hargaSatuan);
      if (!item.uraian || !qty || !hargaSatuan) throw new CashlessError(400, "Setiap baris rincian wajib punya uraian, jumlah, dan harga satuan.");
      return { id: uid(), uraian: item.uraian, qty, hargaSatuan, subtotal: qty * hargaSatuan };
    });
    const totalAnggaran = rincianBersih.reduce((total, item) => total + item.subtotal, 0);
    const row = {
      id: uid(), namaKegiatan, unitPengaju: unitPengaju || null, ketuaBagianNama: ketuaBagianNama || null,
      kategori, bulanRencana, catatan: catatan || null, totalAnggaran, status: "Diajukan",
      tanggalPengajuanISO: todayISO(), diajukanOleh: diajukanOleh || null,
      tanggalKeputusanISO: null, disetujuiOleh: null, pimpinanId: null, realisasiJumlah: null, realisasiTanggalISO: null,
    };
    await query(`INSERT INTO "PengajuanAnggaran" ("id", "namaKegiatan", "unitPengaju", "ketuaBagianNama", "kategori", "bulanRencana", "catatan", "totalAnggaran", "status", "tanggalPengajuanISO", "diajukanOleh", "tanggalKeputusanISO", "disetujuiOleh", "pimpinanId", "realisasiJumlah", "realisasiTanggalISO")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [row.id, row.namaKegiatan, row.unitPengaju, row.ketuaBagianNama, row.kategori, row.bulanRencana, row.catatan, row.totalAnggaran, row.status,
      row.tanggalPengajuanISO, row.diajukanOleh, row.tanggalKeputusanISO, row.disetujuiOleh, row.pimpinanId, row.realisasiJumlah, row.realisasiTanggalISO]);
    for (const item of rincianBersih) {
      await query('INSERT INTO "RincianAnggaran" ("id", "pengajuanId", "uraian", "qty", "hargaSatuan", "subtotal") VALUES ($1, $2, $3, $4, $5, $6)',
        [item.id, row.id, item.uraian, item.qty, item.hargaSatuan, item.subtotal]);
    }
    return lampirkanRincian(row);
  });
}

async function hapusPengajuan(id, aktorId) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Data pengajuan anggaran tidak ditemukan.");
    if (!["Diajukan", "Ditolak"].includes(row.status)) throw new CashlessError(409, "Hanya pengajuan berstatus Diajukan atau Ditolak yang boleh dihapus.");
    await query('DELETE FROM "RincianAnggaran" WHERE "pengajuanId" = $1', [id]);
    await query('DELETE FROM "PengajuanAnggaran" WHERE "id" = $1', [id]);
    await catatAuditKeuangan({ aktorId, aksi: "keuangan.budget_request_deleted", targetTipe: "PengajuanAnggaran", targetId: id, detail: {} });
    return row;
  });
}

async function setujuiAnggaran({ id, pimpinanId, disetujuiOleh }) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Data pengajuan anggaran tidak ditemukan.");
    if (row.status !== "Diajukan") throw new CashlessError(409, "Hanya pengajuan berstatus Diajukan yang bisa disetujui.");
    await query('UPDATE "PengajuanAnggaran" SET "status" = \'Disetujui\', "tanggalKeputusanISO" = $1, "disetujuiOleh" = $2, "pimpinanId" = $3 WHERE "id" = $4',
      [todayISO(), disetujuiOleh || null, pimpinanId || null, id]);
    return lampirkanRincian(await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1', [id]));
  });
}

async function tolakAnggaran({ id, disetujuiOleh }) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Data pengajuan anggaran tidak ditemukan.");
    if (row.status !== "Diajukan") throw new CashlessError(409, "Hanya pengajuan berstatus Diajukan yang bisa ditolak.");
    await query('UPDATE "PengajuanAnggaran" SET "status" = \'Ditolak\', "tanggalKeputusanISO" = $1, "disetujuiOleh" = $2 WHERE "id" = $3',
      [todayISO(), disetujuiOleh || null, id]);
    return lampirkanRincian(await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1', [id]));
  });
}

async function realisasikanAnggaran({ id, jumlahRealisasi, dicatatOleh }) {
  return withTransaction(async () => {
    const row = await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1 FOR UPDATE', [id]);
    if (!row) throw new CashlessError(404, "Data pengajuan anggaran tidak ditemukan.");
    if (row.status !== "Disetujui") throw new CashlessError(409, "Hanya pengajuan berstatus Disetujui yang bisa direalisasikan.");
    const jumlah = Number(jumlahRealisasi) || Number(row.totalAnggaran);
    if (!jumlah || jumlah <= 0) throw new CashlessError(400, "Jumlah realisasi tidak valid.");
    await query('UPDATE "PengajuanAnggaran" SET "status" = \'Direalisasikan\', "realisasiJumlah" = $1, "realisasiTanggalISO" = $2 WHERE "id" = $3',
      [jumlah, todayISO(), id]);
    const cashflow = {
      id: uid(), bulan: row.bulanRencana, tanggalISO: todayISO(), jenis: "Keluar", kategori: row.kategori,
      jumlah, keterangan: `Realisasi Anggaran: ${row.namaKegiatan}`, dicatatOleh: dicatatOleh || null,
    };
    await query('INSERT INTO "Cashflow" ("id", "bulan", "tanggalISO", "jenis", "kategori", "jumlah", "keterangan", "dicatatOleh") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [cashflow.id, cashflow.bulan, cashflow.tanggalISO, cashflow.jenis, cashflow.kategori, cashflow.jumlah, cashflow.keterangan, cashflow.dicatatOleh]);
    return { pengajuan: await lampirkanRincian(await queryOne('SELECT * FROM "PengajuanAnggaran" WHERE "id" = $1', [id])), cashflow };
  });
}

module.exports = {
  JENIS_TAGIHAN, KATEGORI_CASHFLOW, JENIS_TRANSAKSI_UNIT, STATUS_ANGGARAN, statusTagihan,
  buatTagihan, semuaTagihan, tagihanSantri, hapusTagihan, editTagihanNominal, catatPembayaran,
  catatCashflow, semuaCashflow, hapusCashflow,
  catatTransaksiUnitUsaha, semuaTransaksiUnitUsaha, hapusTransaksiUnitUsaha, laporanCashflowUnitUsaha,
  ajukanAnggaran, semuaPengajuan, hapusPengajuan, setujuiAnggaran, tolakAnggaran, realisasikanAnggaran,
};