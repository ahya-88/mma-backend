require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");
const https = require("https");
const http = require("http");
const { URL } = require("url");

function encryptBuffer(buffer, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(passphrase, salt, 100000, 32, "sha256");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, encrypted]);
}

function hmac(key, string) {
  return crypto.createHmac("sha256", key).update(string).digest();
}

function hash(string) {
  return crypto.createHash("sha256").update(string).digest("hex");
}

function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = hmac("AWS4" + key, dateStamp);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  const kSigning = hmac(kService, "aws4_request");
  return kSigning;
}

async function s3Request({ method, path: requestPath, body = Buffer.alloc(0), headers = {} }) {
  const endpoint = process.env.S3_ENDPOINT || process.env.AWS_S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
  const accessKey = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.S3_REGION || process.env.AWS_REGION || "ap-southeast-1";

  if (!endpoint || !bucket || !accessKey || !secretKey) {
    return null; // S3 configuration not provided, skip S3 upload
  }

  const endpointUrl = new URL(endpoint);
  const host = `${bucket}.${endpointUrl.host}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = hash(body);
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    method,
    requestPath,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hash(canonicalRequest),
  ].join("\n");

  const signingKey = getSignatureKey(secretKey, dateStamp, region, "s3");
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const reqHeaders = {
    ...headers,
    Host: host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    Authorization: authorizationHeader,
  };

  if (body.length > 0) {
    reqHeaders["Content-Length"] = body.length;
  }

  const protocol = endpointUrl.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = protocol.request(
      {
        hostname: endpointUrl.hostname,
        port: endpointUrl.port || (endpointUrl.protocol === "https:" ? 443 : 80),
        path: `/${bucket}${requestPath}`,
        method,
        headers: reqHeaders,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const resBody = Buffer.concat(chunks).toString("utf-8");
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, body: resBody });
          } else {
            reject(new Error(`S3 Request failed (${res.statusCode}): ${resBody}`));
          }
        });
      }
    );
    req.on("error", reject);
    if (body.length > 0) req.write(body);
    req.end();
  });
}

function getRetentionFiles(fileList) {
  // Sort files descending by timestamp
  const sorted = [...fileList].sort((a, b) => b.localeCompare(a));
  const keep = new Set();

  const dailyMap = new Map();
  const weeklyMap = new Map();
  const monthlyMap = new Map();

  for (const fileName of sorted) {
    const match = fileName.match(/mma-postgres-(\d{4})(\d{2})(\d{2})-(\d{6})\.dump\.enc/);
    if (!match) continue;
    const [, yyyy, mm, dd] = match;
    const dayKey = `${yyyy}-${mm}-${dd}`;
    const dateObj = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
    const monthKey = `${yyyy}-${mm}`;

    // Helper for week key (ISO week)
    const weekKey = `${yyyy}-W${Math.ceil((dateObj.getUTCDate() + dateObj.getUTCDay()) / 7)}`;

    if (!dailyMap.has(dayKey)) dailyMap.set(dayKey, fileName);
    if (!weeklyMap.has(weekKey)) weeklyMap.set(weekKey, fileName);
    if (!monthlyMap.has(monthKey)) monthlyMap.set(monthKey, fileName);
  }

  // Retain 7 daily
  Array.from(dailyMap.values()).slice(0, 7).forEach((f) => keep.add(f));

  // Retain 4 weekly
  Array.from(weeklyMap.values()).slice(0, 4).forEach((f) => keep.add(f));

  // Retain 6 monthly
  Array.from(monthlyMap.values()).slice(0, 6).forEach((f) => keep.add(f));

  return { keep, remove: sorted.filter((f) => !keep.has(f)) };
}

function getPgBin(binName) {
  try {
    execSync(`${binName} --version`, { stdio: "ignore" });
    return binName;
  } catch (_) {
    const commonPaths = [
      `C:\\Program Files\\PostgreSQL\\16\\bin\\${binName}.exe`,
      `C:\\Program Files\\PostgreSQL\\17\\bin\\${binName}.exe`,
      `C:\\Program Files\\PostgreSQL\\15\\bin\\${binName}.exe`,
      `/usr/bin/${binName}`,
      `/usr/local/bin/${binName}`,
    ];
    for (const p of commonPaths) {
      if (fs.existsSync(p)) return `"${p}"`;
    }
    return binName;
  }
}

const { Pool } = require("pg");

async function dumpDatabaseNode(dbUrl) {
  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  try {
    const tablesRes = await pool.query(`
      SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname
    `);
    const tables = {};
    for (const row of tablesRes.rows) {
      const tableName = row.table_name;
      try {
        const dataRes = await pool.query(`SELECT * FROM "${tableName}"`);
        tables[tableName] = {
          rowCount: dataRes.rowCount,
          rows: dataRes.rows,
        };
      } catch (e) {
        try {
          const dataRes = await pool.query(`SELECT * FROM ${tableName}`);
          tables[tableName] = {
            rowCount: dataRes.rowCount,
            rows: dataRes.rows,
          };
        } catch (e2) {
          console.warn(`[DUMP NOTICE] Skipping unreadable table ${tableName}: ${e2.message}`);
        }
      }
    }
    const payload = {
      type: "MMA_PG_DUMP_JSON_V1",
      timestamp: new Date().toISOString(),
      tables,
    };
    return Buffer.from(JSON.stringify(payload), "utf-8");
  } finally {
    await pool.end();
  }
}

async function runBackup(overrideDbUrl) {
  const dbUrl = overrideDbUrl || process.env.DATABASE_URL_PROD || process.env.RAILWAY_PUBLIC_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL wajib diisi untuk membuat backup database.");
  }

  const passphrase = process.env.ENCRYPTION_PASSPHRASE || "mma-default-secure-passphrase-2026";
  const timestamp = new Date().toISOString().replace(/[:-]/g, "").replace(/\.\d{3}Z/, "").replace("T", "-");
  const fileName = `mma-postgres-${timestamp}.dump.enc`;

  const backupDir = path.join(__dirname, "../backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const tempDumpPath = path.join(backupDir, `temp-${timestamp}.dump`);
  const finalEncPath = path.join(backupDir, fileName);

  console.log(`[BACKUP] Memulai pg_dump dari PostgreSQL...`);
  let rawDumpBuffer;
  try {
    const pgDumpBin = getPgBin("pg_dump");
    const dumpCmd = `${pgDumpBin} --format=custom --no-owner --no-acl --file="${tempDumpPath}" --dbname="${dbUrl}"`;
    execSync(dumpCmd, { stdio: "pipe" });
    rawDumpBuffer = fs.readFileSync(tempDumpPath);
    if (fs.existsSync(tempDumpPath)) fs.unlinkSync(tempDumpPath);
  } catch (err) {
    console.warn(`[BACKUP NOTICE] pg_dump gagal (${err.message.split("\n")[0]}). Menggunakan fallback Node.js Pg Dumper...`);
    if (fs.existsSync(tempDumpPath)) fs.unlinkSync(tempDumpPath);
    rawDumpBuffer = await dumpDatabaseNode(dbUrl);
  }

  console.log(`[BACKUP] Mengenkripsi dump (${rawDumpBuffer.length} bytes) dengan AES-256-GCM...`);
  const encryptedBuffer = encryptBuffer(rawDumpBuffer, passphrase);
  fs.writeFileSync(finalEncPath, encryptedBuffer);

  const checksum = crypto.createHash("sha256").update(encryptedBuffer).digest("hex");
  console.log(`[BACKUP SUCCESS] File backup lokal terenkripsi: ${fileName}`);
  console.log(`[BACKUP METRICS] Ukuran: ${encryptedBuffer.length} bytes | SHA256: ${checksum}`);

  // S3 Upload if configured
  const s3Configured = process.env.S3_BUCKET && process.env.S3_ENDPOINT;
  if (s3Configured) {
    console.log(`[S3] Mengunggah ${fileName} ke S3-compatible storage...`);
    await s3Request({
      method: "PUT",
      path: `/${fileName}`,
      body: encryptedBuffer,
      headers: { "Content-Type": "application/octet-stream" },
    });
    console.log(`[S3 SUCCESS] Berhasil diunggah ke S3.`);
  } else {
    console.log(`[S3 NOTICE] S3_BUCKET tidak dikonfigurasi. Backup disimpan di direktori lokal ./backups.`);
  }

  // Retention cleanup in local backup directory
  const localFiles = fs.readdirSync(backupDir).filter((f) => f.endsWith(".dump.enc"));
  const { remove: localRemove } = getRetentionFiles(localFiles);
  for (const fileToRemove of localRemove) {
    fs.unlinkSync(path.join(backupDir, fileToRemove));
    console.log(`[RETENTION] Menghapus backup lama lokal: ${fileToRemove}`);
  }

  return {
    fileName,
    filePath: finalEncPath,
    sizeBytes: encryptedBuffer.length,
    sha256: checksum,
    s3Uploaded: !!s3Configured,
  };
}

if (require.main === module) {
  const { sendBackupFailureAlert } = require("../src/alerting");
  runBackup()
    .then((res) => {
      console.log(`[BACKUP DONE] ${JSON.stringify(res, null, 2)}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[BACKUP FAILED]`, err);
      sendBackupFailureAlert(err).then(() => process.exit(1));
    });
}

module.exports = { runBackup, encryptBuffer, getRetentionFiles };
