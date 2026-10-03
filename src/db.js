const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");
const { Pool, types } = require("pg");
const { decodeBuktiTransfer } = require("./topupEvidence");

types.setTypeParser(20, (value) => Number(value));

const connectionUrl = process.env.DATABASE_URL;
if (!connectionUrl) throw new Error("DATABASE_URL wajib diisi.");
const host = new URL(connectionUrl).hostname;
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(host);
const pool = new Pool({
  connectionString: connectionUrl,
  max: 10,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});
const transactionContext = new AsyncLocalStorage();

const query = (text, params = []) => {
  const client = transactionContext.getStore();
  return (client || pool).query(text, params);
};

const queryOne = async (text, params = []) => (await query(text, params)).rows[0] || null;
const queryAll = async (text, params = []) => (await query(text, params)).rows;

async function withTransaction(callback) {
  const currentClient = transactionContext.getStore();
  if (currentClient) return callback(currentClient);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await transactionContext.run(client, () => callback(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const FACE_MODEL = "mfn192-v2";
const TAMPILAN_DEFAULT = {
  logoUrl: "", buildingPhotoUrl: "", namaAplikasi: "Ma'had Mudaiyatul Anwar",
  warnaPrimer: "#29AAE1", warnaSekunder: "#0C4A6E", warnaAksenBg: "#7C3AED",
  warnaTeks: "#17242E", warnaTeksMuted: "#5B7C93", warnaBorder: "#CFE3F0",
  warnaLatarHalaman: "#F4F8FB", fontJudul: "Fraunces", fontIsi: "Inter", gayaBackground: "aurora",
};
const PENGATURAN_TOPUP_DEFAULT = {
  wajibReferensiMutasi: false,
  buktiDiDaftar: true,
  persetujuanKeduaAktif: false,
  maxPermintaanMenunggu: 3,
  nominalMinimum: 10000,
  nominalMaksimum: 5000000,
  batasPersetujuanTunggal: 1000000,
  nomorRekening: "",
};

async function initializeDatabase() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.pg.sql"), "utf8");
  await pool.query(schema);

  await withTransaction(async (client) => {
    await client.query(
      'INSERT INTO "Pengaturan" ("kunci", "nilai") VALUES ($1, $2) ON CONFLICT ("kunci") DO NOTHING',
      ["topup", JSON.stringify(PENGATURAN_TOPUP_DEFAULT)],
    );
    const unitCount = await client.query('SELECT COUNT(*) AS "n" FROM "UnitUsaha"');
    if (Number(unitCount.rows[0].n) === 0) {
      for (const nama of ["Kantin", "Kopel", "Dapur", "BMT"]) {
        await client.query('INSERT INTO "UnitUsaha" ("id", "nama") VALUES ($1, $2) ON CONFLICT ("nama") DO NOTHING',
          [crypto.randomUUID(), nama]);
      }
    }
    const yearCount = await client.query('SELECT COUNT(*) AS "n" FROM "TahunAjaran"');
    if (Number(yearCount.rows[0].n) === 0) {
      await client.query('INSERT INTO "TahunAjaran" ("id", "tahunMulai", "aktif") VALUES ($1, $2, 1) ON CONFLICT ("tahunMulai") DO NOTHING', [crypto.randomUUID(), 2026]);
    }
    await client.query(
      'INSERT INTO "Pengaturan" ("kunci", "nilai") VALUES ($1, $2) ON CONFLICT ("kunci") DO NOTHING',
      ["tampilan", JSON.stringify(TAMPILAN_DEFAULT)],
    );

    const faceModel = await client.query('SELECT "nilai" FROM "Pengaturan" WHERE "kunci" = $1', ["faceModel"]);
    if (!faceModel.rowCount || faceModel.rows[0].nilai !== FACE_MODEL) {
      await client.query('UPDATE "Santri" SET "faceEmbedding" = NULL');
      await client.query(
        'INSERT INTO "Pengaturan" ("kunci", "nilai") VALUES ($1, $2) ON CONFLICT ("kunci") DO UPDATE SET "nilai" = EXCLUDED."nilai"',
        ["faceModel", FACE_MODEL],
      );
    }
    await client.query('DELETE FROM "FaceTemplate" WHERE "modelVersion" != $1', [FACE_MODEL]);
    await client.query(`
      INSERT INTO "FaceTemplate" ("santriId", "embedding", "sumber", "modelVersion", "dibuatOleh", "dibuatPada")
      SELECT s."id", s."faceEmbedding", 'foto', $1, NULL,
        to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      FROM "Santri" s
      WHERE s."faceEmbedding" IS NOT NULL AND s."faceEmbedding" != ''
        AND NOT EXISTS (
          SELECT 1 FROM "FaceTemplate" f
          WHERE f."santriId" = s."id" AND f."sumber" = 'foto' AND f."modelVersion" = $1
        )
    `, [FACE_MODEL]);
  });

  await backfillBuktiHash();
}

async function backfillBuktiHash() {
  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('mma-backfill-topup-proof-hash'))");
    const rows = await client.query(`
    SELECT "id", "buktiTransfer" FROM "PermintaanBMT"
    WHERE "jenis" = 'Top Up Saldo' AND "status" <> 'Ditolak'
      AND "buktiHash" IS NULL AND "buktiTransfer" IS NOT NULL
    ORDER BY "createdAt", "id"
    `);
    for (const row of rows.rows) {
      try {
        const { hash } = await decodeBuktiTransfer(row.buktiTransfer);
        await client.query(`
          UPDATE "PermintaanBMT" p SET "buktiHash" = $1
          WHERE p."id" = $2 AND p."buktiHash" IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM "PermintaanBMT" existing
              WHERE existing."buktiHash" = $1 AND existing."id" <> p."id"
                AND existing."jenis" = 'Top Up Saldo' AND existing."status" <> 'Ditolak'
            )
        `, [hash, row.id]);
      } catch (error) {
        if (error instanceof Error && /bukti transfer|Format bukti/i.test(error.message)) continue;
        throw error;
      }
    }
  });
}

module.exports = {
  pool, query, queryOne, queryAll, withTransaction, initializeDatabase,
  FACE_MODEL, TAMPILAN_DEFAULT, PENGATURAN_TOPUP_DEFAULT,
};
