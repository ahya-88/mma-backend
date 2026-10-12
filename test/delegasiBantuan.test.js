const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hitungUsia,
  cekNikValid,
  ambilDataSeleksiSantri,
  ambilDataSeleksiGuru,
  simpanEventDelegasi,
  ambilDaftarEvent,
  ambilDetailEvent,
  hapusEventDelegasi,
  buatBufferExcelDelegasi,
} = require("../src/delegasiBantuanService");

test("DELEGASI & BANTUAN: Helper hitung usia dan validasi NIK", () => {
  // Hitung usia
  const usia = hitungUsia("2012-05-10", "2026-05-10");
  assert.equal(usia.tahun, 14);
  assert.equal(usia.bulan, 0);

  // NIK valid
  assert.equal(cekNikValid("3207011205120001"), true);
  assert.equal(cekNikValid("123"), false);
  assert.equal(cekNikValid(""), false);
  assert.equal(cekNikValid(null), false);
});

test("DELEGASI & BANTUAN: Ambil data seleksi santri dan guru", async () => {
  const santri = await ambilDataSeleksiSantri({ kelas: "Semua" });
  assert.ok(Array.isArray(santri));

  const guru = await ambilDataSeleksiGuru({});
  assert.ok(Array.isArray(guru));
});

test("DELEGASI & BANTUAN: CRUD Event Delegasi dan Generator Excel", async () => {
  // Simpan Event Lomba
  const evRes = await simpanEventDelegasi({
    kategori: "Lomba",
    namaEvent: "MTQ Pelajar Se-Priangan Timur 2026",
    penyelenggara: "LPTQ Jawa Barat",
    tanggalPelaksanaan: "2026-11-20",
    tahunAjaran: "2026/2027",
    status: "Diajukan",
    keterangan: "Delegasi MTQ cabang 5 Juz dan Tilawah",
    pesertaList: [],
  }, "Admin Test");

  assert.ok(evRes.id);

  // Ambil daftar event
  const events = await ambilDaftarEvent();
  assert.ok(Array.isArray(events));
  assert.ok(events.some((e) => e.id === evRes.id));

  // Ambil detail event
  const detail = await ambilDetailEvent(evRes.id);
  assert.equal(detail.namaEvent, "MTQ Pelajar Se-Priangan Timur 2026");

  // Generate Excel buffer
  const sampleData = [
    {
      nama: "Ahmad Santri",
      kelas: "7A",
      nisn: "0012345678",
      nik: "3207010101010001",
      namaAyah: "H. Abdullah",
      namaIbu: "Hj. Aminah",
      tempatLahir: "Ciamis",
      tanggalLahir: "2013-01-01",
      usiaLabel: "13 thn 0 bln",
      isNikValid: true,
      bidangCabang: "Tahfidz 5 Juz",
    },
  ];

  const excelBuffer = buatBufferExcelDelegasi({
    formatTipe: "lomba",
    dataRows: sampleData,
    meta: { judulSheet: "MTQ_2026" },
  });
  assert.ok(Buffer.isBuffer(excelBuffer));
  assert.ok(excelBuffer.length > 0);

  // Verifikasi kolom Nama Ayah dan Nama Ibu ada di dalam sheet
  const XLSX = require("xlsx");
  const wb = XLSX.read(excelBuffer, { type: "buffer" });
  const sheet = wb.Sheets["MTQ_2026"];
  const rows = XLSX.utils.sheet_to_json(sheet);
  assert.equal(rows[0]["Nama Ayah"], "H. Abdullah");
  assert.equal(rows[0]["Nama Ibu"], "Hj. Aminah");

  // Hapus event uji coba
  const delRes = await hapusEventDelegasi(evRes.id);
  assert.equal(delRes.ok, true);
});
