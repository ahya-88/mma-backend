process.env.DATABASE_URL ||= "postgres://test:test@127.0.0.1:5432/test";

const test = require("node:test");
const assert = require("node:assert/strict");
const { PASSWORD_MIN_LENGTH, isPasswordLayak } = require("../src/passwordPolicy");
const admin = require("../src/adminService");

test("password policy: minimal 6 karakter, tanpa syarat lain", () => {
  assert.equal(PASSWORD_MIN_LENGTH, 6);
  assert.equal(isPasswordLayak("12345"), false);
  assert.equal(isPasswordLayak("123456"), true);
  assert.equal(isPasswordLayak("aaaaaa"), true);
  assert.equal(isPasswordLayak("      "), true);
  assert.equal(isPasswordLayak(""), false);
  assert.equal(isPasswordLayak(null), false);
  assert.equal(isPasswordLayak(123456), false);
});

test("buatGuru menolak sandi 5 karakter dengan pesan minimal 6", async () => {
  await assert.rejects(
    admin.buatGuru({ nama: "Uji", username: "uji", password: "12345", departemen: "pengasuhan", jenisAkun: "staf" }),
    (error) => error.status === 400 && /minimal 6 karakter/.test(error.message),
  );
});

test("reset sandi guru dan wali menolak sandi 5 karakter", async () => {
  for (const reset of [admin.editPasswordGuru, admin.editPasswordWali]) {
    await assert.rejects(
      reset({ id: "x", password: "12345", actingUserId: "a" }),
      (error) => error.status === 400 && /minimal 6 karakter/.test(error.message),
    );
  }
});

test("jenis akun invalid ditolak", async () => {
  await assert.rejects(
    admin.buatGuru({ nama: "Uji", username: "uji", password: "123456", departemen: "admin", jenisAkun: "lainnya" }),
    (error) => error.status === 400 && /tidak valid/.test(error.message),
  );
});

