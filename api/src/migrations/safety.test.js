// Dependency-free safety checks for schema adoption and credential concurrency guards.
// SAFETY: no database/network is opened; bcrypt and ../db are stubbed with in-memory fakes.
// Inputs: synthetic column sets and a fake connection/pool. Output: assertions.
// Side effects: none outside this process. Failure: any weakened guard fails the test.
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");
const { migrate, assertSchemaCompatible } = require("./index");

// Fake connection: records SQL, returns shaped rows for the guard queries.
function makeConn(opts = {}) {
  const calls = [];
  const accounts = opts.accounts ?? 0;
  const admins = opts.admins ?? 0;
  const user = opts.user ?? null;
  return {
    calls,
    async query(sql, params) {
      calls.push(sql);
      if (/GET_LOCK/.test(sql)) return [[{ locked: opts.lockAcquired === false ? 0 : 1 }]];
      if (/RELEASE_LOCK/.test(sql)) return [{}];
      if (/COUNT\(\*\) AS n FROM credentials WHERE role = 'admin'/.test(sql)) return [[{ n: admins }]];
      if (/COUNT\(\*\) AS n FROM credentials/.test(sql)) return [[{ n: accounts }]];
      if (/SELECT id, role FROM credentials WHERE username/.test(sql)) {
        return [[...(user ? [{ id: user.id, role: user.role }] : [])]];
      }
      if (/DELETE FROM sessions/.test(sql)) { calls.push("REVOKE:" + params[0]); return [{ affectedRows: 0 }]; }
      if (/DELETE FROM credentials/.test(sql)) { calls.push("DELETE_USER"); return [{ affectedRows: 1 }]; }
      if (/INSERT INTO credentials/.test(sql)) { calls.push("INSERT_ADMIN"); return [{ insertId: 7 }]; }
      return [[]];
    },
    async beginTransaction() { calls.push("BEGIN"); },
    async commit() { calls.push("COMMIT"); },
    async rollback() { calls.push("ROLLBACK"); },
    release() { calls.push("RELEASE_CONN"); },
  };
}
const makePool = (conn) => ({ query: (...a) => conn.query(...a), getConnection: async () => conn });

// Load the credential module without its native/db dependencies via a scoped require stub.
const origLoad = Module._load;
Module._load = function (request, parent) {
  if (parent && parent.filename.includes("dashboardDatabase.js")) {
    if (request === "bcrypt") return { hash: async (p) => "HASH(" + p + ")", compare: async () => false };
    if (request === "../db") return { pool: makePool(makeConn()), config: {} };
  }
  return origLoad.apply(this, arguments);
};
const dbmod = require("../modules/dashboardDatabase");
Module._load = origLoad;

test("schema adoption checks the live columns before certifying", async () => {
  const good = { query: async () => [[{ name: "id" }, { name: "username" }, { name: "password" }, { name: "role" }]] };
  await assert.doesNotReject(() => assertSchemaCompatible(good, "credentials", ["id", "username", "password", "role"]));
  const bad = { query: async () => [[{ name: "id" }, { name: "username" }]] };
  await assert.rejects(
    () => assertSchemaCompatible(bad, "credentials", ["id", "username", "password", "role"]),
    (e) => e.code === "SCHEMA_INCOMPATIBLE" && e.missingColumns.includes("role")
  );
  const absent = { query: async () => [[]] };
  await assert.doesNotReject(() => assertSchemaCompatible(absent, "credentials", ["id", "username", "password", "role"]));
});

test("migrate aborts before recording an incompatible baseline", async () => {
  const calls = [];
  const fake = {
    query: async (sql, params) => {
      calls.push(sql);
      if (/information_schema.columns/.test(sql)) {
        const table = params[0];
        if (table === "credentials") return [[{ name: "id" }, { name: "username" }]]; // missing password/role
        return [[]];
      }
      return [[]];
    },
  };
  await assert.rejects(() => migrate(fake), /Incompatible pre-migration schema/);
  assert.ok(!calls.some((s) => /INSERT INTO schema_migrations/.test(s)), "baseline must not be certified");
});

test("bootstrap serialises, blocks on an existing account and always releases the lock", async () => {
  const conn = makeConn({ accounts: 0 });
  assert.equal(await dbmod.createFirstAdmin("root", "pw-123456789", makePool(conn)), 7);
  assert.ok(conn.calls.includes("BEGIN") && conn.calls.includes("COMMIT") && conn.calls.includes("INSERT_ADMIN"));
  assert.ok(conn.calls.some((s) => /GET_LOCK/.test(s)));
  assert.ok(conn.calls.some((s) => /RELEASE_LOCK/.test(s)));
  assert.ok(conn.calls.includes("RELEASE_CONN"));

  const again = makeConn({ accounts: 1 });
  assert.equal(await dbmod.createFirstAdmin("root2", "pw-123456789", makePool(again)), null);
  assert.ok(!again.calls.includes("INSERT_ADMIN"), "second bootstrap must not insert");
  assert.ok(again.calls.some((s) => /RELEASE_LOCK/.test(s)), "lock released when refusing");
});

test("bootstrap fails closed when the advisory lock cannot be acquired", async () => {
  const conn = makeConn({ accounts: 0, lockAcquired: false });
  await assert.rejects(
    () => dbmod.createFirstAdmin("root", "pw-123456789", makePool(conn)),
    (e) => e.code === "ADMIN_OP_BUSY"
  );
  assert.ok(!conn.calls.includes("INSERT_ADMIN"));
  assert.ok(conn.calls.includes("RELEASE_CONN"));
});

test("deletion guards the last admin and revokes sessions in the same transaction", async () => {
  const last = makeConn({ user: { id: 1, role: "admin" }, admins: 1 });
  const refused = await dbmod.deleteUserGuarded("root", makePool(last));
  assert.equal(refused.lastAdmin, true);
  assert.ok(!last.calls.includes("DELETE_USER"));
  assert.ok(last.calls.some((s) => /RELEASE_LOCK/.test(s)));

  const ok = makeConn({ user: { id: 2, role: "admin" }, admins: 2 });
  const done = await dbmod.deleteUserGuarded("root2", makePool(ok));
  assert.equal(done.affectedRows, 1);
  assert.ok(ok.calls.includes("REVOKE:2") && ok.calls.includes("DELETE_USER"));
  assert.ok(ok.calls.indexOf("REVOKE:2") < ok.calls.indexOf("DELETE_USER"), "revoke precedes delete");
  assert.ok(ok.calls.includes("COMMIT") && ok.calls.some((s) => /RELEASE_LOCK/.test(s)));
});

test("owned sources never log password, hash, token or request body values", () => {
  const fs = require("fs");
  const path = require("path");
  const files = [
    path.join(__dirname, "index.js"),
    path.join(__dirname, "..", "modules", "dashboardDatabase.js"),
    path.join(__dirname, "..", "routes", "dashboardRoutes.js"),
  ];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(src, /console\.\w+\([^)]*\b(req\.body|password|newPassword|hashed|token|sessionToken)\b/, f);
  }
});
