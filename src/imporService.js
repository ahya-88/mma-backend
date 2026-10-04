const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { query, queryOne, queryAll, withTransaction } = require("./db");
const { CashlessError, getSantriRow, SANTRI_BIODATA_FIELDS } = require("./cashlessService");

const uid = () => crypto.randomUUID();

function generateRandomPassword(length = 8) {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let pass = "";
  for (let i = 0; i < length; i++) {
    pass += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return pass;
}

function sanitizeUsername(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, 30);
}

function validTanggal(isoStr) {
  if (!isoStr || typeof isoStr !== "string") return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(isoStr.trim());
}

async function prosesDryRunImpor(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new CashlessError(400, "Data impor kosong. Sediakan minimal satu baris data.");
  }

  const detailGagal = [];
  const nisInBatch = new Set();
  const nisnInBatch = new Set();
  let jumlahValid = 0;

  for (let i = 0; i < rows.length; i++) {
    const baris = rows[i] || {};
    const noBaris = i + 1;
    const pesans = [];

    const nama = (baris.nama || "").trim();
    const nis = (baris.nis || "").trim();
    const nisn = (baris.nisn || "").trim();
    const kelas = (baris.kelas || "").trim();
    const jenisKelamin = (baris.jenisKelamin || "").trim().toUpperCase();
    const tanggalLahir = (baris.tanggalLahir || "").trim();

    if (!nama) pesans.push("Nama santri wajib diisi");
    if (!nis) pesans.push("NIS wajib diisi");
    if (!kelas) pesans.push("Kelas wajib diisi");

    if (jenisKelamin && !["L", "P", "LAKI-LAKI", "PEREMPUAN"].includes(jenisKelamin)) {
      pesans.push("Jenis kelamin harus 'L', 'P', 'Laki-laki', atau 'Perempuan'");
    }

    if (tanggalLahir && !validTanggal(tanggalLahir)) {
      pesans.push("Format tanggal lahir harus YYYY-MM-DD");
    }

    if (nis) {
      if (nisInBatch.has(nis)) {
        pesans.push(`NIS '${nis}' duplikat dalam berkas impor ini`);
      } else {
        nisInBatch.add(nis);
      }
    }

    if (nisn) {
      if (nisnInBatch.has(nisn)) {
        pesans.push(`NISN '${nisn}' duplikat dalam berkas impor ini`);
      } else {
        nisnInBatch.add(nisn);
      }
    }

    if (pesans.length) {
      detailGagal.push({ baris: noBaris, nama: nama || "(Kosong)", nis, alasan: pesans.join("; ") });
    } else {
      jumlahValid++;
    }
  }

  // Cek duplikat terhadap database yang sudah ada
  const existingNis = await queryAll('SELECT "nis" FROM "Santri" WHERE "nis" IS NOT NULL AND "nis" != \'\'');
  const existingNisSet = new Set(existingNis.map((r) => r.nis));
  const existingNisn = await queryAll('SELECT "nisn" FROM "Santri" WHERE "nisn" IS NOT NULL AND "nisn" != \'\'');
  const existingNisnSet = new Set(existingNisn.map((r) => r.nisn));

  const updateList = [];
  const baruList = [];

  for (let i = 0; i < rows.length; i++) {
    const baris = rows[i] || {};
    const nis = (baris.nis || "").trim();
    const nisn = (baris.nisn || "").trim();
    if (!nis) continue;
    if (existingNisSet.has(nis) || (nisn && existingNisnSet.has(nisn))) {
      updateList.push(nis);
    } else {
      baruList.push(nis);
    }
  }

  return {
    valid: detailGagal.length === 0,
    totalBaris: rows.length,
    jumlahValid,
    jumlahGagal: detailGagal.length,
    jumlahBaru: baruList.length,
    jumlahUpdate: updateList.length,
    detailGagal,
  };
}

async function eksekusiImporBatch({ namaBatch, rows, aktorId, aktorNama }) {
  const validation = await prosesDryRunImpor(rows);
  if (!validation.valid) {
    throw new CashlessError(400, `Validasi impor gagal pada ${validation.jumlahGagal} baris data.`, { detailGagal: validation.detailGagal });
  }

  return withTransaction(async () => {
    const batchId = uid();
    await query(
      'INSERT INTO "BatchImpor" ("id", "namaBatch", "sumber", "jumlahSantri", "jumlahWali", "status", "dibuatOleh") VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [batchId, namaBatch || `Impor ${new Date().toISOString().slice(0, 10)}`, "excel", rows.length, 0, "Berhasil", aktorNama || null],
    );

    const daftarKredensialAwal = [];
    let waliBaruCount = 0;

    for (const baris of rows) {
      const nis = baris.nis.trim();
      const nama = baris.nama.trim();
      const kelas = baris.kelas.trim();
      const nisn = (baris.nisn || "").trim() || null;
      const namaWali = (baris.namaWali || baris.namaAyah || baris.namaIbu || "").trim();
      const hpWali = (baris.hpWali || baris.noDarurat || "").trim() || null;

      // 1. Provision / Link Wali secara idempotent
      let waliId = null;
      if (namaWali) {
        let existingWali = await queryOne('SELECT * FROM "Wali" WHERE "nama" = $1 AND ("hp" = $2 OR "hp" IS NULL)', [namaWali, hpWali]);
        if (!existingWali) {
          const usernameBase = `wali.${nis || sanitizeUsername(namaWali)}`;
          let username = usernameBase;
          let counter = 1;
          while (await queryOne('SELECT "id" FROM "Wali" WHERE "username" = $1', [username])) {
            username = `${usernameBase}.${counter++}`;
          }

          const rawPass = generateRandomPassword(8);
          const hashPass = await bcrypt.hash(rawPass, 10);
          waliId = uid();

          await query(
            'INSERT INTO "Wali" ("id", "nama", "hp", "username", "password", "mustChangePassword", "statusAkun", "importBatchId") VALUES ($1, $2, $3, $4, $5, TRUE, \'Belum Aktivasi\', $6)',
            [waliId, namaWali, hpWali, username, hashPass, batchId],
          );

          waliBaruCount++;
          daftarKredensialAwal.push({ waliId, namaWali, username, passwordAwal: rawPass, santriNama: nama, kelas });
        } else {
          waliId = existingWali.id;
        }
      }

      // 2. Upsert Santri berdasarkan NIS
      const existingSantri = await queryOne('SELECT * FROM "Santri" WHERE "nis" = $1 OR ("nisn" IS NOT NULL AND "nisn" = $2)', [nis, nisn]);
      const santriId = existingSantri ? existingSantri.id : uid();

      const biodataToSet = {};
      for (const field of SANTRI_BIODATA_FIELDS) {
        if (field in baris && baris[field] !== undefined && baris[field] !== null && String(baris[field]).trim() !== "") {
          biodataToSet[field] = String(baris[field]).trim();
        }
      }

      if (existingSantri) {
        const sets = ['"nama" = $1', '"kelas" = $2', '"importBatchId" = $3'];
        const values = [nama, kelas, batchId];

        if (nisn) { sets.push(`"nisn" = $${values.length + 1}`); values.push(nisn); }
        if (waliId) { sets.push(`"waliId" = $${values.length + 1}`); values.push(waliId); }

        for (const [key, val] of Object.entries(biodataToSet)) {
          sets.push(`"${key}" = $${values.length + 1}`);
          values.push(val);
        }

        values.push(santriId);
        await query(`UPDATE "Santri" SET ${sets.join(", ")} WHERE "id" = $${values.length}`, values);
      } else {
        const cols = ["id", "nama", "kelas", "nis", "nisn", "waliId", "saldo", "importBatchId", ...Object.keys(biodataToSet)];
        const vals = [santriId, nama, kelas, nis, nisn, waliId, 0, batchId, ...Object.values(biodataToSet)];
        await query(
          `INSERT INTO "Santri" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${vals.map((_, idx) => `$${idx + 1}`).join(", ")})`,
          vals,
        );
      }
    }

    await query('UPDATE "BatchImpor" SET "jumlahWali" = $1 WHERE "id" = $2', [waliBaruCount, batchId]);

    await query(
      `INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
       VALUES ($1, $2, 'guru', 'impor.batch_executed', 'BatchImpor', $3, $4::jsonb)`,
      [uid(), aktorId || null, batchId, JSON.stringify({ namaBatch, jumlahSantri: rows.length, jumlahWaliBaru: waliBaruCount })],
    );

    return {
      batchId,
      totalSantri: rows.length,
      totalWaliBaru: waliBaruCount,
      daftarKredensialAwal,
    };
  });
}

async function rollbackBatchImpor(batchId, aktorId) {
  return withTransaction(async () => {
    const batch = await queryOne('SELECT * FROM "BatchImpor" WHERE "id" = $1 FOR UPDATE', [batchId]);
    if (!batch) throw new CashlessError(404, "Batch impor tidak ditemukan.");

    // Cek apakah ada santri yang memiliki transaksi cashless
    const adaTransaksi = await queryOne(
      'SELECT COUNT(*) AS "n" FROM "TransaksiCashless" t JOIN "Santri" s ON t."santriId" = s."id" WHERE s."importBatchId" = $1',
      [batchId],
    );
    if (Number(adaTransaksi.n) > 0) {
      throw new CashlessError(400, "Batch impor tidak bisa di-rollback karena santri di dalamnya sudah memiliki riwayat transaksi cashless.");
    }

    await query('DELETE FROM "Santri" WHERE "importBatchId" = $1', [batchId]);
    await query('DELETE FROM "Wali" WHERE "importBatchId" = $1', [batchId]);
    await query('UPDATE "BatchImpor" SET "status" = \'Di-rollback\' WHERE "id" = $1', [batchId]);

    await query(
      `INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
       VALUES ($1, $2, 'guru', 'impor.batch_rolled_back', 'BatchImpor', $3, '{}'::jsonb)`,
      [uid(), aktorId || null, batchId],
    );

    return { batchId, rolledBack: true };
  });
}

async function provisionAkunWali({ santriIds, batchId, aktorId }) {
  return withTransaction(async () => {
    let santris = [];
    if (Array.isArray(santriIds) && santriIds.length) {
      santris = await queryAll('SELECT * FROM "Santri" WHERE "id" = ANY($1::text[])', [santriIds]);
    } else if (batchId) {
      santris = await queryAll('SELECT * FROM "Santri" WHERE "importBatchId" = $1', [batchId]);
    } else {
      santris = await queryAll('SELECT * FROM "Santri" WHERE "waliId" IS NULL OR "waliId" IN (SELECT "id" FROM "Wali" WHERE "mustChangePassword" = TRUE)');
    }

    const hasilCredentials = [];
    let diprosesCount = 0;

    for (const santri of santris) {
      let wali = santri.waliId ? await queryOne('SELECT * FROM "Wali" WHERE "id" = $1', [santri.waliId]) : null;

      if (!wali) {
        const namaWali = santri.namaAyah || santri.namaIbu || `Wali ${santri.nama}`;
        const usernameBase = `wali.${santri.nis || sanitizeUsername(santri.nama)}`;
        let username = usernameBase;
        let counter = 1;
        while (await queryOne('SELECT "id" FROM "Wali" WHERE "username" = $1', [username])) {
          username = `${usernameBase}.${counter++}`;
        }

        const rawPass = generateRandomPassword(8);
        const hashPass = await bcrypt.hash(rawPass, 10);
        const newWaliId = uid();

        await query(
          'INSERT INTO "Wali" ("id", "nama", "hp", "username", "password", "mustChangePassword", "statusAkun") VALUES ($1, $2, $3, $4, $5, TRUE, \'Belum Aktivasi\')',
          [newWaliId, namaWali, santri.noDarurat || null, username, hashPass],
        );

        await query('UPDATE "Santri" SET "waliId" = $1 WHERE "id" = $2', [newWaliId, santri.id]);
        diprosesCount++;
        hasilCredentials.push({ waliId: newWaliId, namaWali, username, passwordAwal: rawPass, santriNama: santri.nama, kelas: santri.kelas });
      } else if (wali.mustChangePassword) {
        const rawPass = generateRandomPassword(8);
        const hashPass = await bcrypt.hash(rawPass, 10);
        await query('UPDATE "Wali" SET "password" = $1, "mustChangePassword" = TRUE, "statusAkun" = \'Belum Aktivasi\' WHERE "id" = $2', [hashPass, wali.id]);
        diprosesCount++;
        hasilCredentials.push({ waliId: wali.id, namaWali: wali.nama, username: wali.username, passwordAwal: rawPass, santriNama: santri.nama, kelas: santri.kelas });
      }
    }

    await query(
      `INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
       VALUES ($1, $2, 'guru', 'wali.accounts_provisioned', 'WaliBatch', NULL, $3::jsonb)`,
      [uid(), aktorId || null, JSON.stringify({ diprosesCount })],
    );

    return { diprosesCount, hasilCredentials };
  });
}

async function tautkanAnakKeWali({ santriId, waliId, aktorId }) {
  return withTransaction(async () => {
    const santri = await getSantriRow(santriId);
    const wali = await queryOne('SELECT "id", "nama" FROM "Wali" WHERE "id" = $1', [waliId]);
    if (!wali) throw new CashlessError(404, "Data wali tidak ditemukan.");

    await query('UPDATE "Santri" SET "waliId" = $1 WHERE "id" = $2', [waliId, santriId]);

    await query(
      `INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
       VALUES ($1, $2, 'guru', 'sekretariat.sibling_linked', 'Santri', $3, $4::jsonb)`,
      [uid(), aktorId || null, santriId, JSON.stringify({ waliId, waliNama: wali.nama, santriNama: santri.nama })],
    );

    return { santriId, waliId, waliNama: wali.nama };
  });
}

async function rekonsiliasiSaldoDanTagihan({ batchId, tipe, items, totalKasTarget, aktorId, dicatatOleh }) {
  if (!batchId || !tipe || !Array.isArray(items) || !items.length) {
    throw new CashlessError(400, "Parameter batchId, tipe, dan item impor wajib diisi.");
  }

  const totalInput = items.reduce((acc, curr) => acc + Number(curr.nominal || curr.jumlah || 0), 0);
  const target = Number(totalKasTarget || 0);
  const selisih = totalInput - target;
  const status = selisih === 0 ? "Cocok" : "Tidak Cocok";

  if (selisih !== 0) {
    throw new CashlessError(400, `Rekonsiliasi gagal: Total input (Rp ${totalInput.toLocaleString("id-ID")}) tidak cocok dengan target kas/bank (Rp ${target.toLocaleString("id-ID")}). Selisih: Rp ${selisih.toLocaleString("id-ID")}. Impor ditolak.`);
  }

  return withTransaction(async () => {
    const rekonId = uid();
    await query(
      'INSERT INTO "RekonsiliasiImpor" ("id", "batchId", "tipe", "totalNominalInput", "totalNominalTerproses", "jumlahRecord", "selisih", "status", "catatan") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [rekonId, batchId, tipe, totalInput, totalInput, items.length, 0, status, dicatatOleh || null],
    );

    if (tipe === "Saldo Awal Cashless") {
      for (const item of items) {
        if (!item.santriId && !item.nis) continue;
        const santri = item.santriId
          ? await getSantriRow(item.santriId)
          : await queryOne('SELECT "id" FROM "Santri" WHERE "nis" = $1', [item.nis]);
        if (santri) {
          const nominal = Number(item.nominal || item.jumlah || 0);
          await query('UPDATE "Santri" SET "saldo" = "saldo" + $1 WHERE "id" = $2', [nominal, santri.id]);
          await query(
            'INSERT INTO "TransaksiCashless" ("id", "santriId", "unit", "jenis", "jumlah", "saldoSetelah", "tanggalISO", "tanggalLabel", "bulan", "keterangan") VALUES ($1, $2, \'BMT\', \'Kredit\', $3, $4, $5, $6, $7, $8)',
            [uid(), santri.id, nominal, nominal, new Date().toISOString().slice(0, 10), new Date().toLocaleDateString("id-ID"), new Date().toISOString().slice(0, 7), `Saldo Awal Batch ${batchId}`],
          );
        }
      }
    }

    await query(
      `INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
       VALUES ($1, $2, 'guru', 'impor.reconciliation_recorded', 'RekonsiliasiImpor', $3, $4::jsonb)`,
      [uid(), aktorId || null, rekonId, JSON.stringify({ batchId, tipe, totalInput, status })],
    );

    return { id: rekonId, batchId, tipe, totalInput, totalRecords: items.length, status: "Cocok" };
  });
}

async function kelengkapanDataSekretariat() {
  const santriList = await queryAll('SELECT "id", "nama", "kelas", "nis", "nisn", "waliId", "foto" FROM "Santri"');
  const waliList = await queryAll('SELECT "id", "mustChangePassword", "statusAkun" FROM "Wali"');
  const waliMap = new Map(waliList.map((w) => [w.id, w]));

  const perKelasMap = new Map();

  for (const s of santriList) {
    const k = s.kelas || "Belum ditentukan";
    if (!perKelasMap.has(k)) {
      perKelasMap.set(k, { kelas: k, total: 0, adaWali: 0, waliAktif: 0, adaFoto: 0, adaNisn: 0, dataLengkap: 0 });
    }
    const stat = perKelasMap.get(k);
    stat.total++;

    const wali = s.waliId ? waliMap.get(s.waliId) : null;
    if (s.waliId) stat.adaWali++;
    if (wali && (!wali.mustChangePassword || wali.statusAkun === "Aktif")) stat.waliAktif++;
    if (s.foto && s.foto.trim() !== "") stat.adaFoto++;
    if (s.nisn && s.nisn.trim() !== "") stat.adaNisn++;

    if (s.waliId && s.nisn && s.foto) stat.dataLengkap++;
  }

  const perKelas = Array.from(perKelasMap.values()).map((st) => ({
    ...st,
    persenWali: st.total ? Math.round((st.adaWali / st.total) * 100) : 0,
    persenWaliAktif: st.total ? Math.round((st.waliAktif / st.total) * 100) : 0,
    persenFoto: st.total ? Math.round((st.adaFoto / st.total) * 100) : 0,
    persenDataLengkap: st.total ? Math.round((st.dataLengkap / st.total) * 100) : 0,
  }));

  const santriBelumLengkap = santriList
    .filter((s) => !s.waliId || !s.nisn || !s.foto)
    .map((s) => ({ id: s.id, nama: s.nama, kelas: s.kelas, belumWali: !s.waliId, belumNisn: !s.nisn, belumFoto: !s.foto }));

  const waliBelumAktivasi = waliList
    .filter((w) => w.mustChangePassword || w.statusAkun === "Belum Aktivasi")
    .map((w) => ({ id: w.id }));

  return {
    totalSantri: santriList.length,
    totalWali: waliList.length,
    perKelas,
    santriBelumLengkapLimit: santriBelumLengkap.slice(0, 50),
    totalSantriBelumLengkap: santriBelumLengkap.length,
    totalWaliBelumAktivasi: waliBelumAktivasi.length,
  };
}

async function bersihkanDataDemo({ konfirmasi, aktorId }) {
  if (konfirmasi !== true) {
    throw new CashlessError(400, "Konfirmasi pembersihan data demo wajib disetujui (konfirmasi = true).");
  }

  return withTransaction(async () => {
    // Hapus santri demo (tanpa NIS resmi) dan data terkaitnya
    const santriDemo = await queryAll('SELECT "id" FROM "Santri" WHERE "nis" IS NULL OR "nis" = \'\' OR "nis" LIKE \'DEMO%\'');
    const ids = santriDemo.map((s) => s.id);

    if (ids.length) {
      await query('DELETE FROM "TransaksiCashless" WHERE "santriId" = ANY($1::text[])', [ids]);
      await query('DELETE FROM "Absensi" WHERE "santriId" = ANY($1::text[])', [ids]);
      await query('DELETE FROM "Perizinan" WHERE "santriId" = ANY($1::text[])', [ids]);
      await query('DELETE FROM "Pelanggaran" WHERE "santriId" = ANY($1::text[])', [ids]);
      await query('DELETE FROM "Nilai" WHERE "santriId" = ANY($1::text[])', [ids]);
      await query('DELETE FROM "Tagihan" WHERE "santriId" = ANY($1::text[])', [ids]);
      await query('DELETE FROM "Santri" WHERE "id" = ANY($1::text[])', [ids]);
    }

    await query(
      `INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
       VALUES ($1, $2, 'guru', 'admin.demo_data_cleaned', 'Database', NULL, $3::jsonb)`,
      [uid(), aktorId || null, JSON.stringify({ jumlahSantriDemoDihapus: ids.length })],
    );

    return { jumlahSantriDemoDihapus: ids.length, cleaned: true };
  });
}

module.exports = {
  prosesDryRunImpor,
  eksekusiImporBatch,
  rollbackBatchImpor,
  provisionAkunWali,
  tautkanAnakKeWali,
  rekonsiliasiSaldoDanTagihan,
  kelengkapanDataSekretariat,
  bersihkanDataDemo,
};
