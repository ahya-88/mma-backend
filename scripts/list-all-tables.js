require("dotenv").config({ quiet: true });
const { query, pool } = require("../src/db");

async function run() {
  const res = await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
  console.log("=== SEMUA TABEL DI DATABASE ===");
  for (const row of res.rows) {
    const t = row.table_name;
    const countRes = await query(`SELECT COUNT(*) AS c FROM "${t}"`);
    console.log(`${t}: ${countRes.rows[0].c}`);
  }
  await pool.end();
}

run().catch(console.error);
