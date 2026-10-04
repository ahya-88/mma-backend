const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
process.env.CORS_ORIGINS = "http://localhost:3000";

const app = require("../src/app");

test("HTTP security headers are set and CORS only allows configured origins", async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const url = `http://127.0.0.1:${server.address().port}`;

  const allowed = await fetch(`${url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: "{}",
  });
  assert.equal(allowed.status, 400);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:3000");
  assert.equal(allowed.headers.get("x-content-type-options"), "nosniff");
  assert.equal(allowed.headers.get("content-security-policy"), null);

  const denied = await fetch(`${url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://unexpected.example" },
    body: "{}",
  });
  assert.equal(denied.status, 400);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});

test("student history, balance, and card resolution are not anonymously accessible", async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const url = `http://127.0.0.1:${server.address().port}`;

  const history = await fetch(`${url}/api/santri/s-1/riwayat`);
  const balance = await fetch(`${url}/api/santri/s-1/saldo-publik`);
  const card = await fetch(`${url}/api/kartu/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "MMA1:card-token" }),
  });
  assert.equal(history.status, 401);
  assert.equal(balance.status, 401);
  assert.equal(card.status, 401);
});
