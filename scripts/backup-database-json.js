const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { queryAll, queryOne } = require('../src/db');

async function main() {
  console.log('--- MMA Database Automated Backup Tool ---');
  console.log('Memulai pencadangan data PostgreSQL...');

  const backupsDir = path.resolve(__dirname, '..', 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const [
    santri, wali, guru, unitUsaha, tahunAjaran, produk, pengaturan,
    ringkasanTrx, ledger
  ] = await Promise.all([
    queryAll(`SELECT * FROM "Santri" ORDER BY "nama"`),
    queryAll(`SELECT "id", "nama", "hp", "username", "statusAkun", "mustChangePassword", "createdAt" FROM "Wali" ORDER BY "nama"`),
    queryAll(`SELECT "id", "nama", "username", "departemen", "unit", "jenisAkun", "statusAkun" FROM "Guru" ORDER BY "nama"`),
    queryAll(`SELECT * FROM "UnitUsaha" ORDER BY "nama"`),
    queryAll(`SELECT * FROM "TahunAjaran" ORDER BY "tahunMulai"`),
    queryAll(`SELECT * FROM "ProdukUnitUsaha" ORDER BY "nama"`),
    queryAll(`SELECT "kunci", "nilai" FROM "Pengaturan"`),
    queryOne(`SELECT COUNT(*) AS "totalTrx", COALESCE(SUM("jumlah"), 0) AS "omsetTotal" FROM "TransaksiCashless"`),
    queryAll(`SELECT "id", "santriId", "jenis", "jumlah", "saldoSetelah", "referensi", "pelaku", "waktu" FROM "Ledger" ORDER BY "waktu" DESC LIMIT 500`),
  ]);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-mma-pg-${timestamp}.json`;
  const filePath = path.join(backupsDir, filename);

  const payload = {
    metadata: {
      aplikasi: "Ma'had Mudaiyatul Anwar",
      eksporPada: new Date().toISOString(),
      tipeDatabase: "PostgreSQL Managed",
      totalSantri: santri.length,
      totalWali: wali.length,
      totalGuru: guru.length,
      totalProduk: produk.length,
      totalTransaksiTercatat: Number(ringkasanTrx?.totalTrx || 0),
      totalOmset: Number(ringkasanTrx?.omsetTotal || 0),
    },
    santri,
    wali,
    guru,
    unitUsaha,
    tahunAjaran,
    produk,
    pengaturan,
    ledgerRingkasan: ledger,
  };

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  const stats = fs.statSync(filePath);

  console.log(`✓ Backup berhasil disimpan!`);
  console.log(`Lokasi file: ${filePath}`);
  console.log(`Ukuran file: ${(stats.size / 1024).toFixed(2)} KB`);
  console.log(`Total Santri: ${santri.length} | Wali: ${wali.length} | Guru: ${guru.length} | Produk: ${produk.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Gagal melakukan pencadangan database:', err);
  process.exit(1);
});
