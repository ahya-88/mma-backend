require("dotenv").config({ quiet: true });
const test = require("node:test");
const assert = require("node:assert/strict");
const { pool, initializeDatabase } = require("../src/db");
const { sanitizeObject } = require("../src/sentry");
const { formatJsonLog } = require("../src/logger");
const { record5xxError, reset5xxErrorCount, get5xxErrorCount, triggerAlertNotification } = require("../src/alerting");
const app = require("../src/app");

test.before(async () => {
  await initializeDatabase();
  reset5xxErrorCount();
});

test.after(async () => {
  await pool.end();
});

test("OBSERVABILITY: Data scrubber / sanitizeObject menyaring data sensitif", () => {
  const sensitivePayload = {
    username: "admin",
    password: "SuperSecretPassword123!",
    pin: "123456",
    token: "bearer-token-string",
    nested: {
      refreshToken: "refresh-token-value",
      saldo: 100000,
      jumlah: 25000,
    },
    normalField: "bebas",
  };

  const sanitized = sanitizeObject(sensitivePayload);
  assert.equal(sanitized.password, "[REDACTED]");
  assert.equal(sanitized.pin, "[REDACTED]");
  assert.equal(sanitized.token, "[REDACTED]");
  assert.equal(sanitized.nested.refreshToken, "[REDACTED]");
  assert.equal(sanitized.nested.saldo, "[REDACTED]");
  assert.equal(sanitized.nested.jumlah, "[REDACTED]");
  assert.equal(sanitized.normalField, "bebas");
});

test("OBSERVABILITY: Logger formatJsonLog menghasilkan JSON terstruktur", () => {
  const jsonStr = formatJsonLog({
    level: "INFO",
    message: "Test log message",
    requestId: "req-uuid-12345",
    method: "POST",
    path: "/api/transaksi",
    status: 201,
    durationMs: 12,
  });

  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.level, "INFO");
  assert.equal(parsed.message, "Test log message");
  assert.equal(parsed.requestId, "req-uuid-12345");
  assert.equal(parsed.method, "POST");
  assert.equal(parsed.status, 201);
  assert.ok(parsed.timestamp);
});

test("OBSERVABILITY: Error 5xx beruntun menghitung counter dan memicu alert", async () => {
  reset5xxErrorCount();
  assert.equal(get5xxErrorCount(), 0);

  const mockReq = { id: "req-err-test", method: "GET", url: "/api/test" };
  const mockErr = new Error("Simulated Error 500");

  for (let i = 1; i <= 4; i++) {
    record5xxError(mockReq, mockErr);
    assert.equal(get5xxErrorCount(), i);
  }

  // Error ke-5 harus memicu alert dan mereset counter
  record5xxError(mockReq, mockErr);
  assert.equal(get5xxErrorCount(), 0, "Counter harus direset setelah alert terkirim");
});
