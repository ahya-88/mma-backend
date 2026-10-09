const express = require("express");
const { query } = require("../db");
const { requireAuth, requireBMT, requireAdminUnitUsaha, requireUnitUsaha, isSuperAdmin } = require("../auth");
const { catatTransaksi, auditSaldo, sinkronisasiOfflineKasir, laporanOfflineKasir, koreksiSaldo } = require("../cashlessService");
const { catatTransaksiUnitUsaha, semuaTransaksiUnitUsaha, hapusTransaksiUnitUsaha, laporanCashflowUnitUsaha } = require("../keuanganService");
const asyncHandler = require("../asyncHandler");

const router = express.Router();

router.get("/audit-saldo", requireAuth, asyncHandler(async (req, res) => {
  const isAdmin = isSuperAdmin(req.user);
  const isBMT = req.user?.role === "guru" && req.user.departemen === "unitusaha" && req.user.unit === "BMT";
  const isKeuangan = req.user?.role === "guru" && req.user.departemen === "administrasi";
  if (!isAdmin && !isBMT && !isKeuangan) return res.status(403).json({ error: "Hanya akun Superadmin, BMT, atau Keuangan yang berwenang mengakses audit saldo." });
  res.json(await auditSaldo());
}));

router.get("/offline-report", requireAuth, asyncHandler(async (req, res) => {
  const isAdmin = isSuperAdmin(req.user);
  const isBMT = req.user?.role === "guru" && req.user.departemen === "unitusaha" && req.user.unit === "BMT";
  const isKeuangan = req.user?.role === "guru" && req.user.departemen === "administrasi";
  if (!isAdmin && !isBMT && !isKeuangan) return res.status(403).json({ error: "Hanya akun Superadmin, BMT, atau Keuangan yang berwenang mengakses laporan offline." });
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 50);
  const statusSync = req.query.statusSync;
  res.json(await laporanOfflineKasir({ page, limit, statusSync }));
}));

// ---- Endpoint Transaksi Unit Usaha (Pengaturan & Cashflow Admin Unit Usaha: Keuangan, BMT, Superadmin) ----
router.get("/unit-usaha", requireAuth, asyncHandler(async (req, res) => {
  const isAdmin = isSuperAdmin(req.user);
  const isBMT = req.user?.role === "guru" && req.user.departemen === "unitusaha" && req.user.unit === "BMT";
  const isKeuangan = req.user?.role === "guru" && req.user.departemen === "administrasi";
  const isAdminUnit = isAdmin || isBMT || isKeuangan;
  const selectedUnit = isAdminUnit ? req.query.unit : (req.user?.unit || req.query.unit);
  res.json(await semuaTransaksiUnitUsaha({ unit: selectedUnit }));
}));

router.get("/unit-usaha/laporan", requireAuth, asyncHandler(async (req, res) => {
  const isAdmin = isSuperAdmin(req.user);
  const isBMT = req.user?.role === "guru" && req.user.departemen === "unitusaha" && req.user.unit === "BMT";
  const isKeuangan = req.user?.role === "guru" && req.user.departemen === "administrasi";
  const isAdminUnit = isAdmin || isBMT || isKeuangan;
  const selectedUnit = isAdminUnit ? req.query.unit : (req.user?.unit || req.query.unit);
  res.json(await laporanCashflowUnitUsaha({ unit: selectedUnit }));
}));

router.post("/unit-usaha", requireAuth, requireAdminUnitUsaha, asyncHandler(async (req, res) => {
  const { jenis, unitAsal, unitTujuan, jumlah, keterangan } = req.body || {};
  res.status(201).json(await catatTransaksiUnitUsaha({
    jenis, unitAsal, unitTujuan, jumlah, keterangan,
    dicatatOleh: req.user.nama, aktorId: req.user.id,
  }));
}));

router.delete("/unit-usaha/:id", requireAuth, requireAdminUnitUsaha, asyncHandler(async (req, res) => {
  res.json(await hapusTransaksiUnitUsaha(req.params.id, req.user.id));
}));

// ---- Endpoint Transaksi Cashless Santri & Kasir Belanja ----
router.post("/", requireAuth, requireUnitUsaha, asyncHandler(async (req, res) => {
  const { santriId, jenis: jenisInput, kategori: kategoriInput, subKategori, jumlah, keterangan, bulan, pin, metode, items } = req.body || {};
  const idempotencyKey = req.headers["idempotency-key"] || req.headers["x-idempotency-key"] || req.body?.idempotencyKey;
  if (!santriId || !jumlah) return res.status(400).json({ error: "santriId dan jumlah wajib diisi." });

  const unit = req.body?.unit || req.user.unit || "Kantin";
  const normalizedMetode = metode ? String(metode).toLowerCase() : null;

  // Kasus Pelanggan UMUM (Non-Santri / Cash / QRIS di Kasir)
  if (santriId === "UMUM") {
    const nominal = Number(jumlah);
    if (!nominal || nominal <= 0) return res.status(400).json({ error: "Jumlah belanja harus lebih dari 0." });

    const txUnit = await catatTransaksiUnitUsaha({
      jenis: "Dana Masuk",
      unitAsal: null,
      unitTujuan: unit,
      jumlah: nominal,
      keterangan: keterangan || "Penjualan Kasir Umum",
      dicatatOleh: req.user.nama,
      aktorId: req.user.id,
    });

    // Kurangi stok produk jika ada daftar items
    if (Array.isArray(items) && items.length) {
      for (const it of items) {
        const qty = Number(it.qty || 1);
        if (qty > 0) {
          if (it.id) {
            await query(`UPDATE "ProdukUnitUsaha" SET "stok" = GREATEST(0, "stok" - $1) WHERE "id" = $2`, [qty, it.id]);
          } else if (it.nama) {
            await query(`UPDATE "ProdukUnitUsaha" SET "stok" = GREATEST(0, "stok" - $1) WHERE "nama" = $2 AND "unit" = $3`, [qty, it.nama, unit]);
          }
        }
      }
    }

    return res.status(201).json({
      transaksi: {
        id: txUnit.id,
        santriId: "UMUM",
        unit,
        jenis: "Penjualan Tunai",
        kategori: "Kasir Umum",
        jumlah: nominal,
        keterangan,
        saldoSetelah: 0,
        saldoSebelum: 0,
        saldoSesudah: 0,
        idempotencyKey,
        tanggalISO: txUnit.tanggalISO,
        metode: normalizedMetode || "cash",
      },
      santri: null,
      lewatLimit: false,
      pesan: "Transaksi penjualan kasir umum berhasil dicatat.",
    });
  }

  // Kasus Transaksi Santri Pesantren
  const jenis = jenisInput || "Tarik Tunai";
  const kategori = kategoriInput || (jenis === "Tarik Tunai" ? "Jajan Harian" : undefined);
  const hasil = await catatTransaksi({
    santriId, unit, jenis, kategori, subKategori, jumlah, keterangan, bulan, idempotencyKey,
    pin, validasiPin: jenis === "Tarik Tunai", petugasId: req.user.id,
    metode: ["qr", "wajah", "manual", "kartu", "rfid", "cash", "cashless", "qris"].includes(normalizedMetode) ? normalizedMetode : null,
  });

  // Kurangi stok item produk jika transaksi sukses dan items disertakan
  if (!hasil.pinError && Array.isArray(items) && items.length) {
    for (const it of items) {
      const qty = Number(it.qty || 1);
      if (qty > 0) {
        if (it.id) {
          await query(`UPDATE "ProdukUnitUsaha" SET "stok" = GREATEST(0, "stok" - $1) WHERE "id" = $2`, [qty, it.id]);
        } else if (it.nama) {
          await query(`UPDATE "ProdukUnitUsaha" SET "stok" = GREATEST(0, "stok" - $1) WHERE "nama" = $2 AND "unit" = $3`, [qty, it.nama, unit]);
        }
      }
    }
  }

  if (hasil.idempotentReplay) res.setHeader("X-Idempotent-Replay", "true");
  res.status(hasil.idempotentReplay ? 200 : 201).json(hasil);
}));

router.post("/koreksi", requireAuth, asyncHandler(async (req, res) => {
  const isAdmin = isSuperAdmin(req.user);
  const isBMT = req.user?.role === "guru" && req.user.departemen === "unitusaha" && req.user.unit === "BMT";
  const isKeuangan = req.user?.role === "guru" && req.user.departemen === "administrasi";
  if (!isAdmin && !isBMT && !isKeuangan) {
    return res.status(403).json({ error: "Akses ditolak. Hanya BMT/Keuangan/Superadmin yang dapat melakukan koreksi." });
  }
  const { santriId, jumlah, alasan } = req.body || {};
  const idempotencyKey = req.headers["idempotency-key"] || req.headers["x-idempotency-key"] || req.body?.idempotencyKey;
  const hasil = await koreksiSaldo({
    santriId, jumlah, alasan, dikoreksiOleh: req.user.nama || req.user.id, idempotencyKey,
  });
  if (hasil.idempotentReplay) res.setHeader("X-Idempotent-Replay", "true");
  res.status(hasil.idempotentReplay ? 200 : 201).json(hasil);
}));

router.post("/sync-offline", requireAuth, requireUnitUsaha, asyncHandler(async (req, res) => {
  const items = req.body?.items || [];
  const hasil = await sinkronisasiOfflineKasir({
    items, kasirId: req.user.id, unit: req.user.unit,
  });
  res.json(hasil);
}));

module.exports = router;
