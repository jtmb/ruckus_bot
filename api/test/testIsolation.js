// Fail-closed isolation guard for the destructive API integration tests. Pure Node (no deps)
// so it can be unit-tested without a database. Inputs: an env-like object. Outputs: validated
// connection settings (literal loopback host, bounded port), a bounded unique test-schema name
// and schema lifecycle helpers. Side effects: none at import time; only create/drop helpers
// open a bootstrap connection, and DROP requires a positive creation acknowledgement.
// Failure behaviour: every unsafe target (no opt-in, remote host, leaked prod host, missing
// password, operator-pinned database, reused runtime account, unbounded port) throws before
// any DDL can run; DROP refuses without the acknowledgement returned by a successful CREATE.

const SCHEMA_PREFIX = "ruckus_test_";
const MAX_SCHEMA_LEN = 64; // MySQL identifier limit
const OPT_IN = "TEST_MYSQL_ALLOW_DESTRUCTIVE_TESTS";
const DEFAULT_PORT = 33061;

// Literal loopback addresses only. A hostname such as "localhost" is resolved to a literal here,
// so the connection cannot be redirected by /etc/hosts or DNS to a non-loopback target.
const LOOPBACK_LITERALS = new Map([
  ["127.0.0.1", "127.0.0.1"],
  ["::1", "::1"],
  ["localhost", "127.0.0.1"],
]);

// Purpose: recognise only loopback host forms. Input: host string. Output: boolean.
// Remote/cluster hosts are rejected so runtime credentials cannot be reused off-box.
function isLoopbackHost(host) {
  return typeof host === "string" && LOOPBACK_LITERALS.has(host.trim().toLowerCase());
}

// Purpose: return the literal loopback address a host maps to. Input: validated host string.
// Output: literal "127.0.0.1" or "::1". Failure: throws for any non-loopback host.
function loopbackLiteral(host) {
  if (!isLoopbackHost(host)) throw new Error(`non-loopback host ${JSON.stringify(host)}`);
  return LOOPBACK_LITERALS.get(host.trim().toLowerCase());
}

// Purpose: validate a bounded network port. Input: string/number (undefined defaults to 33061).
// Output: integer 1..65535. Failure: throws on non-integers, leading signs or out-of-range values.
function validatePort(port) {
  const raw = port === undefined || port === null || port === "" ? String(DEFAULT_PORT) : String(port);
  if (!/^\d{1,5}$/.test(raw)) throw new Error(`invalid TEST_MYSQL_PORT: expected integer 1..65535 (got ${JSON.stringify(raw)})`);
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`invalid TEST_MYSQL_PORT: out of range 1..65535 (got ${JSON.stringify(raw)})`);
  return n;
}

// Purpose: validate a bounded, uniquely named test schema. Input: name string. Output: boolean.
function isTestSchemaName(name) {
  return typeof name === "string" &&
    name.startsWith(SCHEMA_PREFIX) &&
    name.length > SCHEMA_PREFIX.length &&
    name.length <= MAX_SCHEMA_LEN &&
    /^[a-z][a-z0-9_]*$/.test(name);
}

// Purpose: derive a bounded unique schema name. Inputs: pid + entropy. Output: schema name.
// Side effects: none. Failure: throws if the derived name violates the bound/pattern.
function testSchemaName(pid = process.pid, entropy = Math.random().toString(16).slice(2)) {
  const cleanPid = String(pid).replace(/[^0-9]/g, "").slice(0, 10) || "0";
  const cleanEntropy = String(entropy).replace(/[^a-f0-9]/gi, "").slice(0, 16).toLowerCase() || "0";
  const name = `${SCHEMA_PREFIX}${cleanPid}_${cleanEntropy}`;
  if (!isTestSchemaName(name)) throw new Error(`invalid test schema name: ${name}`);
  return name;
}

// Purpose: authoritative pre-flight guard for destructive DB tests. Input: env-like object.
// Output: { host (literal), port (number), user, password }. Side effects: none. Failure: throws.
function assertSafeTestTarget(env = process.env) {
  if (env[OPT_IN] !== "1") {
    throw new Error(`refusing destructive DB tests: set ${OPT_IN}=1 for a throwaway loopback database only`);
  }
  const host = loopbackLiteral(env.TEST_MYSQL_HOST || "127.0.0.1");
  // Defence in depth: a leaked runtime MYSQL_HOST pointing off-box is never acceptable.
  if (env.MYSQL_HOST && !isLoopbackHost(env.MYSQL_HOST)) {
    throw new Error(`refusing destructive DB tests: MYSQL_HOST is non-loopback (${JSON.stringify(env.MYSQL_HOST)})`);
  }
  if (env.TEST_MYSQL_DATABASE) {
    throw new Error("refusing destructive DB tests: unset TEST_MYSQL_DATABASE; the test creates its own bounded unique schema");
  }
  // The fixture user must be explicit and must not be the runtime "bot" account, whose grants
  // are limited to the production schema and do not cover creating arbitrary test schemas.
  const user = env.TEST_MYSQL_USER;
  if (!user || !/^[A-Za-z0-9_]+$/.test(user)) throw new Error("TEST_MYSQL_USER is required and must be a plain identifier");
  if (user === "bot" || user === env.MYSQL_USER) {
    throw new Error("TEST_MYSQL_USER must be a dedicated throwaway fixture user, not the runtime account");
  }
  if (!env.TEST_MYSQL_PASSWORD) {
    throw new Error("TEST_MYSQL_PASSWORD is required (disposable local fixture user only)");
  }
  return {
    host,
    port: validatePort(env.TEST_MYSQL_PORT),
    user,
    password: env.TEST_MYSQL_PASSWORD,
  };
}

// Purpose: open a database-less bootstrap connection. Input: validated settings. Output: mysql2
// connection. Side effects: network connection. Failure: propagates connection errors.
async function bootstrap(settings) {
  const mysql = require("mysql2/promise");
  return mysql.createConnection({
    host: settings.host,
    port: settings.port,
    user: settings.user,
    password: settings.password,
    multipleStatements: false,
    connectTimeout: 5000,
  });
}

// Purpose: exclusively create the uniquely named test schema before the pool is used. Inputs:
// settings + schema. Output: true ONLY on positive acknowledgement (schema did not exist).
// Side effects: CREATE DATABASE on the validated loopback test instance. Failure: throws on a
// pre-existing/colliding schema (never adopts it), so no caller can claim ownership falsely.
async function createTestSchema(settings, schema) {
  if (!isTestSchemaName(schema)) throw new Error(`refusing to create non-test schema ${JSON.stringify(schema)}`);
  const conn = await bootstrap(settings);
  try {
    await conn.query(`CREATE DATABASE \`${schema}\` CHARACTER SET utf8mb4`);
    return true;
  } finally {
    await conn.end();
  }
}

// Purpose: remove only the schema this test created. Inputs: settings, schema, createdAck.
// Side effects: DROP DATABASE on the validated loopback test instance. Failure: refuses before
// opening any connection unless createdAck is the positive result of createTestSchema.
async function dropTestSchema(settings, schema, createdAck) {
  if (createdAck !== true) throw new Error("refusing DROP DATABASE: schema creation was not positively acknowledged");
  if (!isTestSchemaName(schema)) throw new Error(`refusing to drop non-test schema ${JSON.stringify(schema)}`);
  const conn = await bootstrap(settings);
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${schema}\``);
  } finally {
    await conn.end();
  }
}

// Purpose: last-line assertion immediately before any DDL. Inputs: API pool + expected schema.
// Output: resolves when the active schema matches. Failure: throws if it does not (no DDL runs).
async function assertActiveSchema(pool, schema) {
  if (!isTestSchemaName(schema)) throw new Error(`refusing DDL: ${JSON.stringify(schema)} is not a test schema`);
  const [rows] = await pool.query("SELECT DATABASE() AS db");
  const active = rows && rows[0] && rows[0].db;
  if (active !== schema) {
    throw new Error(`refusing DDL: active schema ${JSON.stringify(active)} != expected ${JSON.stringify(schema)}`);
  }
}

module.exports = {
  SCHEMA_PREFIX,
  OPT_IN,
  isLoopbackHost,
  loopbackLiteral,
  validatePort,
  isTestSchemaName,
  testSchemaName,
  assertSafeTestTarget,
  createTestSchema,
  dropTestSchema,
  assertActiveSchema,
};
