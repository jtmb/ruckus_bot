// Pure-Node fail-closed tests for the destructive-DB isolation guard. No database or third-party
// dependency is used, so these run even when no MySQL fixture is available. Inputs: synthetic env
// objects and/or mocked pools. Outputs: assertions. Side effects: none (no network opened).
// Failure behaviour: any unsafe guard decision fails the test.
const test = require("node:test");
const assert = require("node:assert/strict");
const iso = require("./testIsolation");

// A safe baseline env; each failing case removes exactly one safety property.
const safeEnv = (over = {}) => ({
  [iso.OPT_IN]: "1",
  TEST_MYSQL_HOST: "127.0.0.1",
  TEST_MYSQL_PORT: "33061",
  TEST_MYSQL_USER: "verify_fixture",
  TEST_MYSQL_PASSWORD: "throwaway-only",
  ...over,
});

test("guard accepts a fully explicit throwaway loopback target", () => {
  const cfg = iso.assertSafeTestTarget(safeEnv());
  assert.equal(cfg.host, "127.0.0.1");
  assert.equal(cfg.port, 33061);
  assert.equal(cfg.user, "verify_fixture");
  assert.equal(cfg.password, "throwaway-only");
});

test("guard fails closed without the explicit destructive opt-in", () => {
  const env = safeEnv(); delete env[iso.OPT_IN];
  assert.throws(() => iso.assertSafeTestTarget(env), /set TEST_MYSQL_ALLOW_DESTRUCTIVE_TESTS=1/);
  assert.throws(() => iso.assertSafeTestTarget(safeEnv({ [iso.OPT_IN]: "true" })), /set TEST_MYSQL_ALLOW_DESTRUCTIVE_TESTS=1/);
});

test("guard rejects remote and cluster-style hosts (no credential reuse off-box)", () => {
  for (const host of ["10.0.0.5", "db.prod.internal", "cluster/mysql", "::ffff:10.1.2.3", "prod-db.example.com", "host.docker.internal"]) {
    assert.throws(() => iso.assertSafeTestTarget(safeEnv({ TEST_MYSQL_HOST: host })), /non-loopback host/, host);
  }
});

test("guard rejects a leaked non-loopback runtime MYSQL_HOST", () => {
  assert.throws(() => iso.assertSafeTestTarget(safeEnv({ MYSQL_HOST: "mysql.cluster.svc" })), /MYSQL_HOST is non-loopback/);
});

test("guard fails closed without a test password or with an operator-pinned database", () => {
  const noPw = safeEnv(); delete noPw.TEST_MYSQL_PASSWORD;
  assert.throws(() => iso.assertSafeTestTarget(noPw), /TEST_MYSQL_PASSWORD is required/);
  assert.throws(() => iso.assertSafeTestTarget(safeEnv({ TEST_MYSQL_DATABASE: "ruckus" })), /unset TEST_MYSQL_DATABASE/);
});

test("guard requires a dedicated fixture user, never the runtime/bot account", () => {
  const none = safeEnv(); delete none.TEST_MYSQL_USER;
  assert.throws(() => iso.assertSafeTestTarget(none), /TEST_MYSQL_USER is required/);
  assert.throws(() => iso.assertSafeTestTarget(safeEnv({ TEST_MYSQL_USER: "bot" })), /not the runtime account/);
  assert.throws(() => iso.assertSafeTestTarget(safeEnv({ TEST_MYSQL_USER: "prod", MYSQL_USER: "prod" })), /not the runtime account/);
  assert.throws(() => iso.assertSafeTestTarget(safeEnv({ TEST_MYSQL_USER: "root;drop" })), /plain identifier/);
});

test("loopback hosts are normalised to literal addresses", () => {
  assert.equal(iso.assertSafeTestTarget(safeEnv({ TEST_MYSQL_HOST: "localhost" })).host, "127.0.0.1");
  assert.equal(iso.assertSafeTestTarget(safeEnv({ TEST_MYSQL_HOST: " LOCALHOST " })).host, "127.0.0.1");
  assert.equal(iso.assertSafeTestTarget(safeEnv({ TEST_MYSQL_HOST: "::1" })).host, "::1");
  assert.equal(iso.loopbackLiteral("127.0.0.1"), "127.0.0.1");
  assert.throws(() => iso.loopbackLiteral("10.0.0.5"), /non-loopback host/);
});

test("ports are bounded integers; invalid or unbounded ports are refused", () => {
  assert.equal(iso.validatePort(undefined), 33061);
  assert.equal(iso.validatePort("1"), 1);
  assert.equal(iso.validatePort(65535), 65535);
  for (const bad of ["0", "65536", "70000", "abc", "-1", "1.5", "12x", "000000"]) {
    assert.throws(() => iso.validatePort(bad), /TEST_MYSQL_PORT/, String(bad));
  }
});

test("loopback recognition accepts only loopback forms", () => {
  for (const h of ["127.0.0.1", "::1", "localhost", " LOCALHOST "]) assert.equal(iso.isLoopbackHost(h), true, h);
  for (const h of ["192.168.1.10", "0.0.0.0", "example.com", "", null]) assert.equal(iso.isLoopbackHost(h), false, String(h));
});

test("generated schema names are bounded, unique and test-only", () => {
  const a = iso.testSchemaName(4242, "abcdef123456");
  const b = iso.testSchemaName(4242, "999999999999");
  assert.equal(a, "ruckus_test_4242_abcdef123456");
  assert.notEqual(a, b);
  assert.equal(iso.isTestSchemaName(a), true);
  assert.ok(a.length <= 64);
});

test("schema validator rejects production-style names", () => {
  for (const name of ["ruckus", "db", "mysql", "production", "", null, "ruckus_test_", "ruckus_test_A;DROP"]) {
    assert.equal(iso.isTestSchemaName(name), false, String(name));
  }
});

test("DROP refuses without a positive creation acknowledgement (before any connection)", async () => {
  const schema = iso.testSchemaName(7, "aa");
  await assert.rejects(() => iso.dropTestSchema({}, schema, false), /not positively acknowledged/);
  await assert.rejects(() => iso.dropTestSchema({}, schema), /not positively acknowledged/);
});

test("active-schema assertion blocks DDL on a wrong database", async () => {
  const schema = iso.testSchemaName(1, "aa");
  const okPool = { query: async () => [[{ db: schema }]] };
  await assert.doesNotReject(() => iso.assertActiveSchema(okPool, schema));
  const badPool = { query: async () => [[{ db: "ruckus_production" }]] };
  await assert.rejects(() => iso.assertActiveSchema(badPool, schema), /active schema "ruckus_production"/);
});
