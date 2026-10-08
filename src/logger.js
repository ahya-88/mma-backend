const crypto = require("crypto");
const { sanitizeObject } = require("./sentry");

function formatJsonLog({ level, message, requestId, method, path, status, durationMs, ip, data, error }) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    ...(message ? { message } : {}),
    ...(requestId ? { requestId } : {}),
    ...(method ? { method } : {}),
    ...(path ? { path } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(ip ? { ip } : {}),
    ...(data ? { data: sanitizeObject(data) } : {}),
    ...(error ? { errorName: error.name, errorMessage: error.message, stack: error.stack } : {}),
  };
  return JSON.stringify(logEntry);
}

function logInfo(message, meta = {}) {
  console.log(formatJsonLog({ level: "INFO", message, ...meta }));
}

function logWarn(message, meta = {}) {
  console.warn(formatJsonLog({ level: "WARN", message, ...meta }));
}

function logError(message, meta = {}) {
  console.error(formatJsonLog({ level: "ERROR", message, ...meta }));
}

function httpLoggerMiddleware(req, res, next) {
  const start = Date.now();
  const requestId = req.headers["x-request-id"] || req.headers["idempotency-key"] || crypto.randomUUID();
  req.id = requestId;
  res.setHeader("X-Request-ID", requestId);

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const logLevel = res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO";
    const logStr = formatJsonLog({
      level: logLevel,
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs,
      ip: req.ip || req.socket?.remoteAddress,
    });
    if (logLevel === "ERROR") console.error(logStr);
    else if (logLevel === "WARN") console.warn(logStr);
    else console.log(logStr);
  });

  next();
}

module.exports = {
  formatJsonLog,
  logInfo,
  logWarn,
  logError,
  httpLoggerMiddleware,
};
