require("dotenv").config({ quiet: true });
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const { pool, query, initializeDatabase } = require("../src/db");

const JWT_SECRET = (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 32)
  ? process.env.JWT_SECRET.trim()
  : "mma-cashless-secure-production-jwt-secret-96-bytes-fallback-key";

function buatToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
}

let server;
let baseUrl;

test.before(async () => {
  await initializeDatabase();
  await query(`
    INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "unit", "jenisAkun", "mustChangePassword", "sessionVersion")
    VALUES ('guru-kantin-test', 'Staf Kantin Test', 'kantin.test', 'secret123', 'unitusaha', 'Kantin', 'staf', FALSE, 1)
    ON CONFLICT ("id") DO UPDATE SET "mustChangePassword" = FALSE, "sessionVersion" = 1, "unit" = 'Kantin', "departemen" = 'unitusaha'
  `);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  await query('DELETE FROM "Guru" WHERE "id" = \'guru-kantin-test\'').catch(() => {});
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test("INTEGRASI KASIR FLUTTER: Health check merespons ok", async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.version);
});

test("INTEGRASI KASIR FLUTTER: Staf kasir kantin dapat mengambil katalog produk saya & snapshot offline", async () => {
  const token = buatToken({
    id: "guru-kantin-test",
    role: "guru",
    sv: 1,
  });

  // Test GET /api/produk/saya
  const resProduk = await fetch(`${baseUrl}/api/produk/saya`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(resProduk.status, 200);
  const produkData = await resProduk.json();
  assert.ok(Array.isArray(produkData));

  // Test GET /api/kasir/snapshot
  const resSnapshot = await fetch(`${baseUrl}/api/kasir/snapshot`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(resSnapshot.status, 200);
  const snapshotData = await resSnapshot.json();
  assert.ok(Array.isArray(snapshotData.santri));
  assert.ok(Array.isArray(snapshotData.produk));
});

test("INTEGRASI KASIR FLUTTER: Transaksi kasir untuk pelanggan UMUM dicatat dengan sukses", async () => {
  const token = buatToken({
    id: "guru-kantin-test",
    role: "guru",
    sv: 1,
  });

  const res = await fetch(`${baseUrl}/api/transaksi`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      santriId: "UMUM",
      jumlah: 15000,
      keterangan: "Roti x2, Es Teh x1",
      metode: "CASH",
      items: [
        { nama: "Roti Manis", qty: 2, harga: 5000, subtotal: 10000 },
        { nama: "Es Teh", qty: 1, harga: 5000, subtotal: 5000 },
      ],
    }),
  });

  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.transaksi.santriId, "UMUM");
  assert.equal(data.transaksi.jumlah, 15000);
  assert.equal(data.santri, null);
  assert.ok(data.pesan);
});

test("INTEGRASI KASIR FLUTTER: Lookup barcode dan stok opname berfungsi normal", async () => {
  const token = buatToken({
    id: "guru-kantin-test",
    role: "guru",
    sv: 1,
  });

  // 1. Tambah produk dengan barcode
  const resTambah = await fetch(`${baseUrl}/api/produk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      nama: "Air Mineral Botol Test",
      harga: 3000,
      kategori: "Minuman",
      barcode: "8991234567890",
      stok: 20,
    }),
  });
  assert.equal(resTambah.status, 201);
  const prod = await resTambah.json();
  assert.ok(prod.id);

  // 2. Cari via barcode unit sendiri
  const resBarcode = await fetch(`${baseUrl}/api/produk/saya/barcode/8991234567890`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(resBarcode.status, 200);
  const foundProd = await resBarcode.json();
  assert.equal(foundProd.id, prod.id);

  // 3. Stok opname via URL param id
  const resOpname = await fetch(`${baseUrl}/api/produk/${prod.id}/stok-opname`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      stokFisik: 25,
      alasan: "Hitung fisik sore hari",
      catatan: "Penyesuaian stok",
    }),
  });
  assert.equal(resOpname.status, 201);
  const opnameResult = await resOpname.json();
  assert.equal(opnameResult.stokFisik, 25);
  assert.equal(opnameResult.selisih, 5);

  // Cleanup produk test
  await fetch(`${baseUrl}/api/produk/${prod.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
});

test("INTEGRASI KASIR FLUTTER: Face embeddings, belum-embed, dan simpan embedding wajah", async () => {
  const token = buatToken({
    id: "guru-kantin-test",
    role: "guru",
    sv: 1,
  });

  // 1. GET /api/wajah/embeddings
  const resEmb = await fetch(`${baseUrl}/api/wajah/embeddings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(resEmb.status, 200);
  const dataEmb = await resEmb.json();
  assert.ok(Array.isArray(dataEmb));

  // 2. GET /api/wajah/belum-embed
  const resBelum = await fetch(`${baseUrl}/api/wajah/belum-embed?limit=5`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(resBelum.status, 200);
  const dataBelum = await resBelum.json();
  assert.ok(Array.isArray(dataBelum));
});


