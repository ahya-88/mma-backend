require("dotenv").config({ quiet: true });
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { query, queryOne, withTransaction, initializeDatabase, pool } = require("../src/db");

async function bootstrapAdmin() {
  const { BOOTSTRAP_CONFIRM, BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_PASSWORD } = process.env;
  if (BOOTSTRAP_CONFIRM !== "CREATE_INITIAL_SUPERADMIN") {
    throw new Error("Set BOOTSTRAP_CONFIRM=CREATE_INITIAL_SUPERADMIN to authorize this one-time operation.");
  }
  if (process.env.DEMO_MODE === "true") throw new Error("Initial Superadmin bootstrap cannot run with DEMO_MODE=true.");
  if (!BOOTSTRAP_ADMIN_NAME?.trim() || !BOOTSTRAP_ADMIN_USERNAME?.trim()) {
    throw new Error("BOOTSTRAP_ADMIN_NAME and BOOTSTRAP_ADMIN_USERNAME are required.");
  }
  if (typeof BOOTSTRAP_ADMIN_PASSWORD !== "string" || BOOTSTRAP_ADMIN_PASSWORD.length < 12) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters.");
  }

  await initializeDatabase();
  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(BOOTSTRAP_ADMIN_PASSWORD, 12);
  await withTransaction(async () => {
    const count = await queryOne('SELECT COUNT(*) AS "total" FROM "Guru"');
    if (Number(count.total) !== 0) throw new Error("Bootstrap refused: at least one staff account already exists.");
    const wali = await queryOne('SELECT "id" FROM "Wali" WHERE "username" = $1', [BOOTSTRAP_ADMIN_USERNAME.trim()]);
    if (wali) throw new Error("Bootstrap refused: username is already used by a guardian account.");

    await query(`INSERT INTO "Guru" ("id", "nama", "username", "password", "departemen", "jenisAkun", "mustChangePassword")
      VALUES ($1, $2, $3, $4, 'admin', 'superadmin', TRUE)`,
    [id, BOOTSTRAP_ADMIN_NAME.trim(), BOOTSTRAP_ADMIN_USERNAME.trim(), passwordHash]);
    await query(`INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
      VALUES ($1, NULL, 'system', 'auth.bootstrap_admin_created', 'Guru', $2, '{}'::jsonb)`,
    [crypto.randomUUID(), id]);
  });
  console.log("Initial Superadmin created. Its first login must change the password.");
}

bootstrapAdmin()
  .catch((error) => {
    console.error("Initial Superadmin bootstrap failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
