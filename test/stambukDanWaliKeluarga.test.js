const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "fase2-impor-test-secret-32-characters-minimum-length";
process.env.NODE_ENV = "test";

const santriDb = [];
const waliDb = [];
const batchDb = [];
const auditDb = [];

const databaseMock = {
  FACE_MODEL: "mfn192-v2",
  async withTransaction(callback) { return callback(); },
  async queryOne(sql, params = []) {
    if (sql.includes('FROM "BatchImpor"')) return batchDb.find((b) => b.id === params[0]) || null;
    if (sql.includes('FROM "Santri" WHERE') && (sql.includes('"noStambuk"') || sql.includes('"nis"'))) {
      return santriDb.find((s) => s.noStambuk === params[0] || s.nis === params[0] || (params[1] && s.nisn === params[1])) || null;
    }
    if (sql.includes('FROM "Wali" WHERE "nik" = $1 OR "nikAyah" = $1')) {
      return waliDb.find((w) => w.nik === params[0] || w.nikAyah === params[0]) || null;
    }
    if (sql.includes('FROM "Wali" WHERE "nik" = $1 OR "nikIbu" = $1')) {
      return waliDb.find((w) => w.nik === params[0] || w.nikIbu === params[0]) || null;
    }
    if (sql.includes('FROM "Wali" WHERE "nama" = $1')) return waliDb.find((w) => w.nama === params[0]) || null;
    if (sql.includes('FROM "Wali" WHERE "username" = $1')) return waliDb.find((w) => w.username === params[0]) || null;
    if (sql.includes('FROM "Wali" WHERE "id" = $1')) return waliDb.find((w) => w.id === params[0]) || null;
    if (sql.includes('FROM "Santri" WHERE "id" = $1')) return santriDb.find((s) => s.id === params[0]) || null;
    return null;
  },
  async queryAll(sql, params = []) {
    if (sql.includes('SELECT "nis", "noStambuk" FROM "Santri"')) {
      return santriDb.map((s) => ({ nis: s.nis, noStambuk: s.noStambuk }));
    }
    if (sql.includes('SELECT "nisn" FROM "Santri"')) return santriDb.map((s) => ({ nisn: s.nisn }));
    if (sql.includes('FROM "Santri"')) return santriDb;
    if (sql.includes('FROM "Wali"')) return waliDb;
    return [];
  },
  async query(sql, params = []) {
    if (sql.includes('INSERT INTO "BatchImpor"')) {
      batchDb.push({ id: params[0], namaBatch: params[1], status: "Berhasil" });
    } else if (sql.includes('INSERT INTO "Wali"')) {
      waliDb.push({
        id: params[0],
        nama: params[1],
        hp: params[2],
        nik: params[3],
        nikAyah: params[4],
        nikIbu: params[5],
        namaAyah: params[6],
        namaIbu: params[7],
        username: params[8],
        password: params[9],
      });
    } else if (sql.includes('INSERT INTO "Santri"')) {
      const matchCols = sql.match(/\((.*?)\)\s+VALUES/);
      const cols = matchCols ? matchCols[1].replace(/"/g, "").split(",").map((s) => s.trim()) : [];
      const sObj = {};
      cols.forEach((c, idx) => { sObj[c] = params[idx]; });
      santriDb.push(sObj);
    } else if (sql.includes('UPDATE "Santri"')) {
      const id = params[params.length - 1];
      const s = santriDb.find((x) => x.id === id);
      if (s) {
        s.nama = params[0];
        s.kelas = params[1];
        s.nis = params[2];
        s.noStambuk = params[2];
      }
    } else if (sql.includes('INSERT INTO "AuditLog"')) {
      auditDb.push({ id: params[0], aksi: params[3] });
    }
    return { rowCount: 1, rows: [] };
  },
};

const dbModulePath = require.resolve("../src/db");
require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: databaseMock,
};

const impor = require("../src/imporService");

test("PARSER: Smart TTL Parser mengubah berbagai format tempat dan tanggal lahir Indonesia", () => {
  // Test nama bulan Indonesia
  const res1 = impor.parseTTL("SERANG 01 AGUSTUS 2003");
  assert.equal(res1.tempatLahir, "SERANG");
  assert.equal(res1.tanggalLahir, "2003-08-01");

  // Test koma dan bulan
  const res2 = impor.parseTTL("SERANG,14 SEPTEMBER 2010");
  assert.equal(res2.tempatLahir, "SERANG");
  assert.equal(res2.tanggalLahir, "2010-09-14");

  // Test typo bulan September ("SEPTERMER")
  const res3 = impor.parseTTL("BOGOR, 14 SEPTERMER 2015");
  assert.equal(res3.tempatLahir, "BOGOR");
  assert.equal(res3.tanggalLahir, "2015-09-14");

  // Test format garis miring DD/MM/YYYY
  const res4 = impor.parseTTL("SERANG 22/03/2013");
  assert.equal(res4.tempatLahir, "SERANG");
  assert.equal(res4.tanggalLahir, "2013-03-22");

  // Test murni ISO YYYY-MM-DD
  const res5 = impor.parseTTL("2017-09-12");
  assert.equal(res5.tempatLahir, "");
  assert.equal(res5.tanggalLahir, "2017-09-12");

  // Test tempat luar negeri / spasi majemuk
  const res6 = impor.parseTTL("AL ZULFI ARAB SAUDI,23 MARET 2011");
  assert.equal(res6.tempatLahir, "AL ZULFI ARAB SAUDI");
  assert.equal(res6.tanggalLahir, "2011-03-23");
});

test("SANITIZER: Sanitasi NIK membersihkan karakter kutip, spasi, dan nilai kosong", () => {
  assert.equal(impor.sanitizeNIK("'3602142708830005"), "3602142708830005");
  assert.equal(impor.sanitizeNIK(" 3604240110130001 "), "3604240110130001");
  assert.equal(impor.sanitizeNIK("-"), null);
  assert.equal(impor.sanitizeNIK("Tidak ada"), null);
  assert.equal(impor.sanitizeNIK("ALM"), null);
  assert.equal(impor.sanitizeNIK(""), null);
});

test("STATUS: Status santri dinormalisasi dari file (Alumni / Aktif / Keluar / Wafat)", () => {
  assert.equal(impor.normalizeStatusSantri("Alumni"), "Alumni");
  assert.equal(impor.normalizeStatusSantri("LULUS"), "Alumni");
  assert.equal(impor.normalizeStatusSantri("aktif"), "Aktif");
  assert.equal(impor.normalizeStatusSantri("Pindah"), "Keluar");
  assert.equal(impor.normalizeStatusSantri("Keluar"), "Keluar");
  // Otomatis deteksi almarhum dari nama
  assert.equal(impor.normalizeStatusSantri("", "MUHAMAD IKBAL MAULANA ( ALM )"), "Wafat");
});

test("FAMILY CLUSTERING & NO STAMBUK: 1 Wali dengan 2 anak disatukan ke 1 akun Wali via NIK Ayah", async () => {
  const rows = [
    {
      "No. STAMBUK": "16",
      "ANGKATAN": "2",
      "PPSB TAHUN": "2019 - 2020",
      "NAMA LENGKAP": "SHOFIA MAZIA SYAHABANA",
      "JK": "P",
      "NIK": "3276025702110003",
      "TTL": "Jakarta 17 FEBUARI 2011",
      "NAMA AYAH": "TAKDIR ALISYAHBANA",
      "NIK AYAH": "3276021410760008",
      "NAMA IBU": "RIANA TRIPRIANI",
      "NIK IBU": "3276025310760008",
      "STATUS": "Alumni",
      "ALAMAT": "KOMP. HBTB BLOK A No. 12A",
    },
    {
      "No. STAMBUK": "17",
      "ANGKATAN": "2",
      "PPSB TAHUN": "2019 - 2020",
      "NAMA LENGKAP": "ALEEA RAHMANIRA SYAHBANA",
      "JK": "P",
      "NIK": "3276024106130006",
      "TTL": "Jakarta 01 JUNI 2013",
      "NAMA AYAH": "TAKDIR ALISYAHBANA",
      "NIK AYAH": "3276021410760008",
      "NAMA IBU": "RIANA TRIPRIANI",
      "NIK IBU": "3276025310760008",
      "STATUS": "Alumni",
      "ALAMAT": "KOMP. HBTB BLOK A No. 12A",
    },
  ];

  const res = await impor.eksekusiImporBatch({
    namaBatch: "Tes Impor Keluarga",
    rows,
    aktorId: "guru-1",
    aktorNama: "Ustadz Admin",
  });

  assert.equal(res.totalSantri, 2, "Harus mengimpor 2 santri.");
  assert.equal(res.totalWaliBaru, 1, "Harus HANYA membuat 1 akun Wali baru untuk kedua anak!");

  // Verifikasi santri terhubung ke wali yang sama
  const santri1 = santriDb.find((s) => s.noStambuk === "16");
  const santri2 = santriDb.find((s) => s.noStambuk === "17");

  assert.ok(santri1, "Santri 1 ditemukan");
  assert.ok(santri2, "Santri 2 ditemukan");
  assert.equal(santri1.waliId, santri2.waliId, "Wali ID kedua santri harus sama persis!");
  assert.equal(santri1.statusSantri, "Alumni", "Status santri 1 adalah Alumni sesuai file");
  assert.equal(santri2.statusSantri, "Alumni", "Status santri 2 adalah Alumni sesuai file");
});

test("BATCH BERIKUTNYA & BARIS KOSONG: Anak ketiga di batch berikutnya otomatis terhubung ke Wali lama, baris kosong diabaikan", async () => {
  const rows = [
    {
      "No. STAMBUK": "228",
      "ANGKATAN": "8",
      "PPSB TAHUN": "2025 - 2026",
      "NAMA LENGKAP": "YASMINE MIKAYLA IZZATUNNISA",
      "JK": "P",
      "NIK": "3604225907180000",
      "TTL": "SERANG, 19/07/2018",
      "NAMA AYAH": "TAKDIR ALISYAHBANA", // Menggunakan NIK Ayah yang sama dengan batch sebelumnya
      "NIK AYAH": "3276021410760008",
      "NAMA IBU": "RIANA TRIPRIANI",
      "NIK IBU": "3276025310760008",
      "STATUS": "Aktif",
      "ALAMAT": "KOMP. HBTB BLOK A No. 12A",
    },
    // Baris kosong (trailing empty rows)
    {
      "No. STAMBUK": "",
      "ANGKATAN": "",
      "NAMA LENGKAP": "",
    },
    {},
  ];

  const res = await impor.eksekusiImporBatch({
    namaBatch: "Tes Impor Adik Angkatan Baru",
    rows,
    aktorId: "guru-1",
    aktorNama: "Ustadz Admin",
  });

  assert.equal(res.totalSantri, 1, "Hanya 1 santri valid yang diimpor, baris kosong diabaikan.");
  assert.equal(res.totalWaliBaru, 0, "TIDAK membuat wali baru karena sudah ada dari batch sebelumnya!");

  const santri3 = santriDb.find((s) => s.noStambuk === "228");
  const santri1 = santriDb.find((s) => s.noStambuk === "16");

  assert.ok(santri3, "Santri 3 ditemukan");
  assert.equal(santri3.waliId, santri1.waliId, "Santri adik otomatis terhubung ke akun Wali kakak!");
  assert.equal(santri3.statusSantri, "Aktif", "Santri baru berstatus Aktif");
});

