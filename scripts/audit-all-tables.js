require("dotenv").config({ quiet: true });
const { query } = require("../src/db");

async function checkAllTables() {
  const res = await query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  console.log("=== ROW COUNTS ACROSS ALL TABLES ===");
  for (const row of res.rows) {
    const tbl = row.table_name;
    try {
      const cRes = await query(`SELECT COUNT(*) AS cnt FROM "${tbl}"`);
      console.log(`${tbl.padEnd(30)}: ${cRes.rows[0].cnt}`);
    } catch (e) {
      console.log(`${tbl.padEnd(30)}: Error (${e.message})`);
    }
  }
}

checkAllTables().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
