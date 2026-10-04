// Kebijakan kata sandi satu-satunya untuk seluruh akun (Guru/Staf, Superadmin, Wali).
// Keputusan 4 Okt 2026: minimal 6 karakter saja, tanpa syarat kompleksitas lain.
const PASSWORD_MIN_LENGTH = 6;

function isPasswordLayak(password) {
  return typeof password === "string" && password.length >= PASSWORD_MIN_LENGTH;
}

module.exports = { PASSWORD_MIN_LENGTH, isPasswordLayak };
