require("dotenv").config({ quiet: true });
const https = require("https");
const http = require("http");
const { URL } = require("url");
const { logInfo, logError } = require("./logger");

let consecutive5xxCount = 0;
let lastAlertTime = 0;
const CONSECUTIVE_5XX_THRESHOLD = 5;
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minute cooldown between alerts

async function sendTelegramMessage(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = JSON.stringify({
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  });

  return new Promise((resolve) => {
    const reqUrl = new URL(url);
    const req = https.request(
      {
        hostname: reqUrl.hostname,
        path: reqUrl.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve(res.statusCode === 200));
      }
    );
    req.on("error", (err) => {
      logError("Gagal mengirim notifikasi Telegram", { error: err });
      resolve(false);
    });
    req.write(body);
    req.end();
  });
}

async function sendWhatsAppWebhook(webhookUrl, text) {
  const body = JSON.stringify({ message: text });
  return new Promise((resolve) => {
    const reqUrl = new URL(webhookUrl);
    const protocol = reqUrl.protocol === "https:" ? https : http;
    const req = protocol.request(
      {
        hostname: reqUrl.hostname,
        port: reqUrl.port,
        path: reqUrl.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve(res.statusCode >= 200 && res.statusCode < 300));
      }
    );
    req.on("error", (err) => {
      logError("Gagal mengirim notifikasi WhatsApp Webhook", { error: err });
      resolve(false);
    });
    req.write(body);
    req.end();
  });
}

async function triggerAlertNotification({ title, message, level = "CRITICAL", metadata = {} }) {
  const now = Date.now();
  if (now - lastAlertTime < ALERT_COOLDOWN_MS) {
    logInfo("Notifikasi alert berada dalam periode cooldown, dilewati.", { title });
    return false;
  }
  lastAlertTime = now;

  const envName = process.env.NODE_ENV || "development";
  const formattedText = `🚨 <b>[MMA ALERT: ${level}]</b> ${title}\n` +
    `<b>Environment</b>: ${envName}\n` +
    `<b>Waktu</b>: ${new Date().toISOString()}\n` +
    `<b>Pesan</b>: ${message}\n` +
    (metadata.requestId ? `<b>Request ID</b>: <code>${metadata.requestId}</code>\n` : "") +
    (metadata.path ? `<b>Path</b>: <code>${metadata.path}</code>\n` : "");

  logError(`ALERT DISPATCHED: ${title}`, { title, message, level, metadata });

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const waWebhook = process.env.WA_WEBHOOK_URL;

  let sent = false;
  if (botToken && chatId) {
    sent = await sendTelegramMessage(botToken, chatId, formattedText);
  }
  if (waWebhook) {
    sent = await sendWhatsAppWebhook(waWebhook, formattedText) || sent;
  }

  return sent;
}

function record5xxError(req, err) {
  consecutive5xxCount++;
  logError(`5xx Server Error (${consecutive5xxCount}/${CONSECUTIVE_5XX_THRESHOLD})`, {
    requestId: req?.id,
    method: req?.method,
    path: req?.originalUrl || req?.url,
    error: err,
  });

  if (consecutive5xxCount >= CONSECUTIVE_5XX_THRESHOLD) {
    triggerAlertNotification({
      title: `Terjadi ${consecutive5xxCount} Error 5xx Beruntun!`,
      message: err?.message || "Kesalahan server internal beruntun.",
      level: "CRITICAL",
      metadata: {
        requestId: req?.id,
        path: req?.originalUrl || req?.url,
      },
    });
    consecutive5xxCount = 0; // Reset counter after triggering alert
  }
}

function reset5xxErrorCount() {
  consecutive5xxCount = 0;
}

function get5xxErrorCount() {
  return consecutive5xxCount;
}

async function sendHealthFailureAlert(error) {
  return triggerAlertNotification({
    title: "Health Check Database Gagal!",
    message: error?.message || "Database PostgreSQL tidak dapat dihubungi.",
    level: "CRITICAL",
  });
}

async function sendBackupFailureAlert(error) {
  return triggerAlertNotification({
    title: "Eksekusi Backup S3 Gagal!",
    message: error?.message || "Proses pg_dump atau upload S3 mengalami kesalahan.",
    level: "HIGH",
  });
}

module.exports = {
  triggerAlertNotification,
  record5xxError,
  reset5xxErrorCount,
  get5xxErrorCount,
  sendHealthFailureAlert,
  sendBackupFailureAlert,
};
