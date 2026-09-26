const express = require("express");
const db = require("../db");
const { requireAuth, requireBMT, requireAnyStaff, requireSekretariat } = require("../auth");
const { getSantriRow, toPublicSantri, toSaldoPublik, riwayatSantri, CashlessError, SANTRI_BIODATA_FIELDS } = require("../cashlessService");
const { riwayatAbsensi, daftarPerizinan, riwayatPelanggaran } = require("../pengasuhanService");
const { semuaNilai, semuaPrestasi, semuaHafalan, semuaUbudiyah } = require("../akademikService");
const { tagihanSantri } = require("../keuanganService");

const router = express.Router();

function isBMT(user) { return user?.role === "guru" && user.departemen === "unitusaha" && user.unit === "BMT"; }

function assertLihatSantri(req, santri) {
  if (isBMT(req.user)) return;
  if (req.user.role === "wali" && santri.waliId === req.user.id) return;
  throw new CashlessError(403, "Tidak berwenang melihat data santri ini.");
}

// Non-finansial (absensi/perizinan/pelanggaran/nilai/prestasi/hafalan/ubudiyah) — staf departemen mana pun
// boleh lihat (bukan data sensitif seperti saldo), atau wali pemilik anak.
function assertLihatRaporSantri(req, santri) {
  if (req.user.role === "guru") return;
  if (req.user.role === "wali" && santri.waliId === req.user.id) return;
  throw new CashlessError(403, "Tidak berwenang melihat data santri ini.");
}

// Buat/perbarui identitas & biodata santri di backend bersama. Terima juga field biodata lengkap
// (Master Data Santri — Sekretariat) selain nama/kelas/nis/nisn/waliId; TIDAK PERNAH menyentuh
// saldo/limit/blokir (itu hanya diubah lewat alur cashless BMT). Dipanggil otomatis oleh frontend
// sebelum transaksi cashless/pencatatan modul lain (sinkronisasi identitas dasar saja, mengirim
// hanya sebagian field), maupun oleh form "Data Santri" di Sekretariat (mengirim seluruh biodata).
// Setiap field biodata hanya ditimpa jika benar-benar dikirim di body, supaya panggilan sinkronisasi
// dari modul lain yang hanya membawa field inti tidak menghapus biodata yang sudah tersimpan.
router.post("/upsert", requireAuth, requireAnyStaff, (req, res, next) => {
  try {
    const body = req.body || {};
    const { id, nama } = body;
    if (!id || !nama) return res.status(400).json({ error: "id dan nama santri wajib diisi." });
    const ada = db.prepare("SELECT id FROM Santri WHERE id = ?").get(id);

    const biodataToSet = {};
    for (const f of SANTRI_BIODATA_FIELDS) {
      if (f in body) biodataToSet[f] = body[f] || null;
    }
    const riwayatKelasProvided = "riwayatKelas" in body;
    const riwayatKelasJSON = riwayatKelasProvided ? JSON.stringify(body.riwayatKelas || []) : null;

    if (ada) {
      const sets = ["nama = @nama"];
      const params = { id, nama };
      for (const c of ["kelas", "nis", "nisn", "waliId"]) {
        if (c in body) { sets.push(`${c} = @${c}`); params[c] = body[c] || null; }
      }
      for (const f of Object.keys(biodataToSet)) { sets.push(`${f} = @${f}`); params[f] = biodataToSet[f]; }
      if (riwayatKelasProvided) { sets.push("riwayatKelas = @riwayatKelas"); params.riwayatKelas = riwayatKelasJSON; }
      sets.push("updatedAt = datetime('now')");
      db.prepare(`UPDATE Santri SET ${sets.join(", ")} WHERE id = @id`).run(params);
    } else {
      const cols = ["id", "nama", "kelas", "nis", "nisn", "waliId", "saldo", ...Object.keys(biodataToSet)];
      const params = {
        id, nama, kelas: body.kelas || null, nis: body.nis || null, nisn: body.nisn || null,
        waliId: body.waliId || null, saldo: 0, ...biodataToSet,
      };
      if (riwayatKelasProvided) { cols.push("riwayatKelas"); params.riwayatKelas = riwayatKelasJSON; }
      db.prepare(`INSERT INTO Santri (${cols.join(", ")}) VALUES (${cols.map((c) => `@${c}`).join(", ")})`).run(params);
    }
    const publik = toPublicSantri(getSantriRow(id));
    res.json(isBMT(req.user) ? publik : sanitasiUntukNonBMT(publik));
  } catch (e) { next(e); }
});

// Field finansial/sensitif yang hanya boleh dilihat oleh staf BMT (lihat assertLihatSantri di atas) —
// dikeluarkan dari daftar untuk staf lain, termasuk Sekretariat, yang hanya perlu biodata.
const FIELD_FINANSIAL_SANTRI = ["saldo", "limitJajanHarian", "durasiBlokirHari", "sisaLimitHariIni", "blokir"];
function sanitasiUntukNonBMT(santriPublik) {
  const hasil = { ...santriPublik };
  for (const f of FIELD_FINANSIAL_SANTRI) delete hasil[f];
  return hasil;
}

// Daftar seluruh santri (biodata lengkap) — untuk Master Data Santri (Sekretariat) & modul lain
// yang butuh daftar lengkap. Data finansial (saldo/limit/blokir) disembunyikan kecuali untuk staf BMT.
router.get("/", requireAuth, requireAnyStaff, (req, res) => {
  const rows = db.prepare("SELECT * FROM Santri ORDER BY nama").all().map(toPublicSantri);
  res.json(isBMT(req.user) ? rows : rows.map(sanitasiUntukNonBMT));
});

// Hapus santri — hanya staf Sekretariat (pemilik Master Data Santri). Ditolak dengan 409 bila
// santri masih punya riwayat data terkait (transaksi, absensi, nilai, dst.) karena constraint FK.
router.delete("/:id", requireAuth, requireSekretariat, (req, res, next) => {
  try {
    getSantriRow(req.params.id); // pastikan ada, lempar 404 jika tidak
    db.prepare("DELETE FROM Santri WHERE id = ?").run(req.params.id);
    res.json({ id: req.params.id, deleted: true });
  } catch (e) {
    if (e instanceof CashlessError) return next(e);
    if (e && e.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return res.status(409).json({ error: "Santri tidak bisa dihapus karena masih memiliki riwayat data terkait (transaksi, nilai, absensi, dsb.)." });
    }
    next(e);
  }
});

// Wali: daftar anak-anak sendiri
router.get("/me-anak", requireAuth, (req, res) => {
  if (req.user.role !== "wali") return res.status(403).json({ error: "Hanya untuk akun wali." });
  const rows = db.prepare("SELECT * FROM Santri WHERE waliId = ?").all(req.user.id);
  res.json(rows.map(toPublicSantri));
});

// Detail 1 santri (saldo, limit, status blokir terhitung) — BMT atau wali pemilik anak
router.get("/:id", requireAuth, (req, res, next) => {
  try {
    const santri = getSantriRow(req.params.id);
    assertLihatSantri(req, santri);
    res.json(toPublicSantri(santri));
  } catch (e) { next(e); }
});

// Riwayat transaksi lintas unit — BMT atau wali pemilik anak
router.get("/:id/riwayat", requireAuth, (req, res, next) => {
  try {
    const santri = getSantriRow(req.params.id);
    assertLihatSantri(req, santri);
    res.json(riwayatSantri(req.params.id));
  } catch (e) { next(e); }
});

// Kios cek saldo mandiri — tanpa login, hanya info minimal (lihat konsep Bagian C)
router.get("/:id/saldo-publik", (req, res, next) => {
  try {
    const santri = getSantriRow(req.params.id);
    res.json(toSaldoPublik(santri));
  } catch (e) { next(e); }
});

// Rapor ringkas lintas modul non-finansial (Pengasuhan + Pengajaran + LPTQ) dalam satu panggilan —
// dipakai WaliDashboard supaya wali yang baru login (tanpa staf lain pernah membuka modul terkait
// di sesi yang sama) tetap melihat data anaknya, bukan bergantung pada state yang "kebetulan" sudah
// dimuat staf lain di tab yang sama.
router.get("/:id/rapor-ringkas", requireAuth, (req, res, next) => {
  try {
    const santri = getSantriRow(req.params.id);
    assertLihatRaporSantri(req, santri);
    const { rows: absensiRows, rekap: rekapAbsensi } = riwayatAbsensi(req.params.id);
    const { rows: pelanggaranRows, totalPoin: totalPoinPelanggaran } = riwayatPelanggaran(req.params.id);
    // Tagihan itu data finansial — hanya wali pemilik anak atau staf Administrasi yang boleh lihat,
    // bukan "staf departemen mana pun" seperti data non-finansial lainnya di endpoint ini.
    const bolehLihatTagihan = req.user.role === "wali" || (req.user.role === "guru" && req.user.departemen === "administrasi");
    res.json({
      absensi: absensiRows,
      rekapAbsensi,
      perizinan: daftarPerizinan({ santriId: req.params.id }),
      pelanggaran: pelanggaranRows,
      totalPoinPelanggaran,
      nilai: semuaNilai().filter((n) => n.santriId === req.params.id),
      prestasi: semuaPrestasi().filter((p) => p.santriId === req.params.id),
      hafalan: semuaHafalan().filter((h) => h.santriId === req.params.id),
      ubudiyah: semuaUbudiyah().filter((u) => u.santriId === req.params.id),
      tagihan: bolehLihatTagihan ? tagihanSantri(req.params.id) : [],
    });
  } catch (e) { next(e); }
});

module.exports = router;
