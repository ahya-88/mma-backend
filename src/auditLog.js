const crypto = require("crypto");
const { query } = require("./db");

async function recordAudit({ actorId, actorRole, action, targetType, targetId, detail = {} }) {
  await query(`INSERT INTO "AuditLog" ("id", "aktorId", "aktorRole", "aksi", "targetTipe", "targetId", "detail")
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
  [crypto.randomUUID(), actorId || null, actorRole || "system", action, targetType, targetId || null, JSON.stringify(detail)]);
}

module.exports = { recordAudit };
