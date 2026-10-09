const test = require("node:test");
const assert = require("node:assert");

test("Validasi PIN Kartu Santri (4-6 digit angka)", () => {
  const isValidPin = (pin) => typeof pin === "string" && /^\d{4,6}$/.test(pin.trim());

  assert.strictEqual(isValidPin("1234"), true);
  assert.strictEqual(isValidPin("12345"), true);
  assert.strictEqual(isValidPin("123456"), true);
  assert.strictEqual(isValidPin("123"), false);
  assert.strictEqual(isValidPin("1234567"), false);
  assert.strictEqual(isValidPin("abcdef"), false);
  assert.strictEqual(isValidPin(""), false);
  assert.strictEqual(isValidPin(null), false);
});
