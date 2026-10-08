const PASSWORD_MIN_LENGTH = 6;

function validatePasswordPolicy(password) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return `Password minimal ${PASSWORD_MIN_LENGTH} karakter.`;
  }
  return null;
}

module.exports = {
  PASSWORD_MIN_LENGTH,
  validatePasswordPolicy,
};
