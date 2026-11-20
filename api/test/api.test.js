// Integration tests against a throwaway LOOPBACK MySQL. Run: npm test (see scripts/verify.sh header).
// SAFETY: the guard below fails closed before any DB module is loaded or any DDL is issued. DDL runs
// only inside a uniquely named schema (ruckus_test_<pid>_<hex>) that this suite creates and drops.
// No production/cluster database or credential is ever targeted; remote hosts are refused.
const test = require("node:test");
const assert = require("node:assert/strict");
const isolation = require("./testIsolation");

// Fail closed at the actual test entry, before db.js/migrations are imported or any SQL is sent.
const settings = isolation.assertSafeTestTarget(process.env);
const SCHEMA = isolation.testSchemaName();

process.env.MYSQL_HOST = settings.host;
process.env.MYSQL_PORT = settings.port;
process.env.MYSQL_USER = settings.user;
process.env.MYSQL_PASSWORD = settings.password;
process.env.MYSQL_DATABASE = SCHEMA;

const { pool } = require("../src/db");
const { migrate } = require("../src/migrations");
const { buildApp } = require("../src/api");
const { pruneLogs } = require("../src/modules/botDatabase");

let server, base, createdSchema = false;
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body && method !== "GET" ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, headers: res.headers, text };
};

test.before(async () => {
  // Create our own bounded schema exclusively; only a positive acknowledgement makes us its owner.
  // No pre-existing/colliding schema is ever adopted, so no reset DROP is needed before migrate.
  createdSchema = await isolation.createTestSchema(settings, SCHEMA);
  await isolation.assertActiveSchema(pool, SCHEMA);
  await migrate(pool);
  await new Promise((r) => { server = buildApp().listen(0, "127.0.0.1", r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  // Close the listener first (awaiting the callback), then the pool, then drop only a schema we created.
  if (server) await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  if (pool) await pool.end();
  if (createdSchema) await isolation.dropTestSchema(settings, SCHEMA, createdSchema);
});

test("migrations are idempotent", async () => {
  assert.deepEqual(await migrate(pool), []);
});

test("migration adopts a pre-migration schema with existing data", async () => {
  await pool.query("DROP TABLE schema_migrations");
  await pool.query("INSERT INTO credentials (username,password,role) VALUES ('legacy','x','user')");
  assert.equal((await migrate(pool)).length, 3);
  const [rows] = await pool.query("SELECT username FROM credentials WHERE username='legacy'");
  assert.equal(rows.length, 1);
  await pool.query("DELETE FROM credentials WHERE username='legacy'");
});

test("anonymous callers are rejected everywhere that matters", async () => {
  for (const [m, p] of [["GET", "/users"], ["POST", "/users"], ["DELETE", "/users/admin"], ["POST", "/users/x/password"],
    ["GET", "/bot/logs"], ["POST", "/bot/logs"], ["DELETE", "/bot/logs/1"], ["POST", "/bot/restart"], ["GET", "/bot/status"]]) {
    const r = await call(m, p, { body: {} });
    assert.equal(r.status, 401, `${m} ${p}`);
  }
});

test("health and ready are public", async () => {
  assert.equal((await call("GET", "/health")).status, 200);
  assert.equal((await call("GET", "/ready")).status, 200);
});

let adminToken, userToken;
test("bootstrap creates exactly one admin and refuses the second", async () => {
  assert.equal((await call("GET", "/auth/bootstrap")).json.adminExists, false);
  assert.equal((await call("POST", "/auth/bootstrap", { body: { username: "root", password: "short" } })).status, 400);
  const ok = await call("POST", "/auth/bootstrap", { body: { username: "root", password: "correct-horse-1" } });
  assert.equal(ok.status, 201);
  const again = await call("POST", "/auth/bootstrap", { body: { username: "root2", password: "correct-horse-2" } });
  assert.equal(again.status, 400);
  assert.match(again.json.error, /already exists/);
});

test("login returns a session, never a hash, and rejects bad credentials", async () => {
  const bad = await call("POST", "/auth/login", { body: { username: "root", password: "wrong-password" } });
  assert.equal(bad.status, 401);
  const ok = await call("POST", "/auth/login", { body: { username: "root", password: "correct-horse-1" } });
  assert.equal(ok.status, 200);
  assert.ok(ok.json.token.length >= 40);
  assert.equal(ok.json.user.role, "admin");
  assert.doesNotMatch(ok.text, /\$2[aby]\$/);
  adminToken = ok.json.token;
  const legacy = await call("POST", "/users/authenticate", { body: { username: "root", password: "correct-horse-1" } });
  assert.equal(legacy.status, 200);
  assert.doesNotMatch(legacy.text, /\$2[aby]\$/);
});

test("no endpoint response contains a bcrypt hash", async () => {
  const me = (await call("GET", "/auth/session", { token: adminToken })).json.user.id;
  for (const p of ["/users", `/users/${me}`, "/auth/session"]) {
    const r = await call("GET", p, { token: adminToken });
    assert.equal(r.status, 200, p);
    assert.doesNotMatch(r.text, /\$2[aby]\$/, p);
  }
});

test("viewer role cannot manage users or mutate logs", async () => {
  const c = await call("POST", "/users", { token: adminToken, body: { username: "viewer", password: "viewer-pass-1", role: "user" } });
  assert.equal(c.status, 201);
  userToken = (await call("POST", "/auth/login", { body: { username: "viewer", password: "viewer-pass-1" } })).json.token;
  assert.equal((await call("GET", "/users", { token: userToken })).status, 403);
  assert.equal((await call("POST", "/bot/logs", { token: userToken, body: { event_type: "x" } })).status, 403);
  assert.equal((await call("POST", "/bot/restart", { token: userToken })).status, 403);
  assert.equal((await call("GET", "/bot/logs", { token: userToken })).status, 200);
});

test("invalid role and duplicate username are rejected with 400", async () => {
  assert.equal((await call("POST", "/users", { token: adminToken, body: { username: "z1z", password: "valid-pass-1", role: "superuser" } })).status, 400);
  assert.equal((await call("POST", "/users", { token: adminToken, body: { username: "viewer", password: "valid-pass-1", role: "user" } })).status, 400);
});

test("pagination validates, clamps and orders newest first", async () => {
  for (let i = 0; i < 25; i++) await pool.query("INSERT INTO bot_logs (event_type,event_data,timestamp) VALUES ('user_interaction',?, NOW() - INTERVAL ? SECOND)", [String(i), i]);
  for (const bad of ["limit=0", "limit=-1", "limit=abc", "limit=101", "limit=1000000000000", "offset=-1", "offset=abc"]) {
    assert.equal((await call("GET", `/bot/logs?${bad}`, { token: adminToken })).status, 400, bad);
  }
  const r = await call("GET", "/bot/logs?limit=5&offset=0", { token: adminToken });
  assert.equal(r.json.length, 5);
  assert.equal(r.headers.get("x-total-count"), "25");
  assert.deepEqual(r.json.map((x) => x.event_data), ["0", "1", "2", "3", "4"]);
  const next = await call("GET", "/bot/interactions?limit=5&offset=5", { token: adminToken });
  assert.deepEqual(next.json.map((x) => x.event_data), ["5", "6", "7", "8", "9"]);
});

test("login throttle locks after repeated failures", async () => {
  let last;
  for (let i = 0; i < 6; i++) last = await call("POST", "/auth/login", { body: { username: "viewer", password: "nope-nope-nope" } });
  assert.equal(last.status, 429);
});

test("status derives online/offline from the heartbeat", async () => {
  assert.equal((await call("GET", "/bot/status", { token: adminToken })).json.isBotUp, false);
  await pool.query("INSERT INTO bot_heartbeat (id,bot_id,bot_name,guilds,updated_at) VALUES (1,'1','Ruckus','[{\"id\":\"9\",\"name\":\"G\"}]',NOW())");
  const up = await call("GET", "/bot/status", { token: adminToken });
  assert.equal(up.json.isBotUp, true);
  assert.deepEqual(up.json.guilds, ["G"]);
  await pool.query("UPDATE bot_heartbeat SET updated_at = NOW() - INTERVAL 5 MINUTE WHERE id=1");
  assert.equal((await call("GET", "/bot/status", { token: adminToken })).json.isBotUp, false);
});

test("logout invalidates the session; last admin cannot be deleted", async () => {
  const t = (await call("POST", "/auth/login", { body: { username: "root", password: "correct-horse-1" } })).json.token;
  assert.equal((await call("POST", "/auth/logout", { token: t })).status, 200);
  assert.equal((await call("GET", "/auth/session", { token: t })).status, 401);
  assert.equal((await call("DELETE", "/users/root", { token: adminToken })).status, 400);
});

test("CORS preflight from an unlisted origin gets no allow header", async () => {
  const res = await fetch(base + "/bot/logs", { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "GET" } });
  assert.equal(res.headers.get("access-control-allow-origin"), null);
});

test("retention prune removes only old rows", async () => {
  await pool.query("INSERT INTO bot_logs (event_type,event_data,timestamp) VALUES ('x','old', NOW() - INTERVAL 400 DAY)");
  assert.equal(await pruneLogs(365), 1);
});

test("malformed JSON yields 400 with a request id", async () => {
  const res = await fetch(base + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{bad" });
  assert.equal(res.status, 400);
  assert.ok((await res.json()).requestId);
});
