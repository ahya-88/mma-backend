require("dotenv").config({ quiet: true });

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.PUBLIC_SENTRY_DSN;
let sentryInitialized = false;

const SENSITIVE_KEYS = [
  "password", "pin", "token", "refreshtoken", "pinhash", "totpsecret",
  "currentpassword", "newpassword", "buktitransfer", "saldo", "jumlah", "nilai",
];

function sanitizeObject(obj) {
  if (!obj || typeof obj !== "object") return obj;
  try {
    const clone = JSON.parse(JSON.stringify(obj));
    function redact(o) {
      if (!o || typeof o !== "object") return;
      for (const key of Object.keys(o)) {
        if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
          o[key] = "[REDACTED]";
        } else if (typeof o[key] === "object") {
          redact(o[key]);
        }
      }
    }
    redact(clone);
    return clone;
  } catch (_) {
    return "[UNSERIALIZABLE]";
  }
}

function initSentry() {
  if (!SENTRY_DSN) {
    console.log("[SENTRY] SENTRY_DSN tidak dikonfigurasi. Pelaporan Sentry dinonaktifkan.");
    return;
  }

  try {
    // Attempt optional @sentry/node import if installed, otherwise lightweight handler
    const Sentry = require("@sentry/node");
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: process.env.NODE_ENV || "development",
      beforeSend(event) {
        if (event.request && event.request.data) {
          event.request.data = sanitizeObject(event.request.data);
        }
        if (event.request && event.request.headers) {
          if (event.request.headers.authorization) event.request.headers.authorization = "[REDACTED]";
          if (event.request.headers.cookie) event.request.headers.cookie = "[REDACTED]";
        }
        if (event.extra) {
          event.extra = sanitizeObject(event.extra);
        }
        return event;
      },
    });
    sentryInitialized = true;
    console.log("[SENTRY] Sentry berhasil diinisialisasi.");
  } catch (_) {
    console.log("[SENTRY] Paket @sentry/node tidak tersedia. Menggunakan pelapor fallback.");
  }
}

function captureException(error, context = {}) {
  const sanitizedContext = sanitizeObject(context);
  if (sentryInitialized) {
    try {
      const Sentry = require("@sentry/node");
      Sentry.captureException(error, { extra: sanitizedContext });
      return;
    } catch (_) {}
  }
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "ERROR",
    type: "SENTRY_CAPTURED_EXCEPTION",
    errorName: error.name || "Error",
    errorMessage: error.message,
    stack: error.stack,
    context: sanitizedContext,
  }));
}

function captureMessage(message, level = "info", context = {}) {
  const sanitizedContext = sanitizeObject(context);
  if (sentryInitialized) {
    try {
      const Sentry = require("@sentry/node");
      Sentry.captureMessage(message, { level, extra: sanitizedContext });
      return;
    } catch (_) {}
  }
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    type: "SENTRY_CAPTURED_MESSAGE",
    message,
    context: sanitizedContext,
  }));
}

// Initialise upon load if DSN available
initSentry();

module.exports = {
  SENTRY_DSN,
  initSentry,
  captureException,
  captureMessage,
  sanitizeObject,
};
