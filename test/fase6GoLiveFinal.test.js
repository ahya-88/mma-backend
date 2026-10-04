const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.JWT_SECRET = "fase6-golive-test-secret-32-characters-minimum-length";
process.env.NODE_ENV = "test";

test("FASE 6: Verifikasi Keberadaan dan Struktur Dokumen Go-Live & Panduan Pengguna", () => {
  const rolloutPath = path.join(__dirname, "..", "docs", "go-live-rollout-plan.md");
  const waGuidePath = path.join(__dirname, "..", "docs", "panduan-wali-whatsapp.md");
  const opGuidePath = path.join(__dirname, "..", "docs", "panduan-operator-impor.md");

  assert.ok(fs.existsSync(rolloutPath), "Dokumen go-live-rollout-plan.md wajib ada.");
  assert.ok(fs.existsSync(waGuidePath), "Dokumen panduan-wali-whatsapp.md wajib ada.");
  assert.ok(fs.existsSync(opGuidePath), "Dokumen panduan-operator-impor.md wajib ada.");

  const rolloutContent = fs.readFileSync(rolloutPath, "utf-8");
  assert.ok(rolloutContent.includes("GELOMBANG 1: PILOT"), "Memuat Gelombang 1 Pilot.");
  assert.ok(rolloutContent.includes("GELOMBANG 2: EXPANSION"), "Memuat Gelombang 2 Expansion.");
  assert.ok(rolloutContent.includes("GELOMBANG 3: SKALA PENUH"), "Memuat Gelombang 3 Skala Penuh.");
  assert.ok(rolloutContent.includes("NEON POSTGRESQL"), "Memuat ambang batas Neon.");
  assert.ok(rolloutContent.includes("RAILWAY APPLICATION SERVICE"), "Memuat ambang batas Railway.");

  const waContent = fs.readFileSync(waGuidePath, "utf-8");
  assert.ok(waContent.includes("LOGIN PERTAMA KALI"), "Memuat panduan login pertama wali.");
  assert.ok(waContent.includes("TOP UP SALDO BMT"), "Memuat panduan topup wali.");
  assert.ok(waContent.includes("LEBIH DARI 1 ANAK"), "Memuat panduan kakak-adik.");

  const opContent = fs.readFileSync(opGuidePath, "utf-8");
  assert.ok(opContent.includes("IMPOR DATA SANTRI DARI EXCEL"), "Memuat panduan impor operator.");
  assert.ok(opContent.includes("REKONSILIASI SALDO AWAL"), "Memuat panduan rekonsiliasi operator.");
});
