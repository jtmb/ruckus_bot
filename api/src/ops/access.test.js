// access.test.js — focused tests for the admin-only guard on GET /metrics.
// Pure Node; request/response objects are fixtures. No network, DB or live calls.

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createMetricsAccess } = require("./access");

// Fake response capturing status and JSON body.
function fakeRes() {
  return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}

// Admin sessions pass; anonymous and non-admin sessions get the documented 403 FORBIDDEN envelope.
test("guard allows admin only and denies others with the 403 envelope", () => {
  const guard = createMetricsAccess();
  let next = 0;

  const ok = fakeRes();
  guard({ user: { role: "admin" }, ip: "8.8.8.8", socket: { remoteAddress: "8.8.8.8" }, id: "req-admin" }, ok, () => { next += 1; });
  assert.equal(next, 1);
  assert.equal(ok.statusCode, null);
  assert.equal(ok.body, null);

  const anon = fakeRes();
  guard({ ip: "203.0.113.5", socket: { remoteAddress: "203.0.113.5" }, id: "req-1" }, anon, () => { next += 1; });
  assert.equal(next, 1);
  assert.equal(anon.statusCode, 403);
  assert.equal(anon.body.error.code, "FORBIDDEN");
  assert.equal(anon.body.error.message, "Metrics access denied");
  assert.equal(anon.body.error.requestId, "req-1");

  const viewer = fakeRes();
  guard({ user: { role: "viewer" }, ip: "8.8.8.8", socket: {}, id: "req-2" }, viewer, () => { next += 1; });
  assert.equal(next, 1);
  assert.equal(viewer.statusCode, 403);
  assert.equal(viewer.body.error.requestId, "req-2");
});

// A non-admin behind a private proxy (private req.ip/socket peer, optional forwarded header) is still
// denied. This is a defensive invariant check, not a reproduction of a request forgery technique.
test("non-admin behind private proxy transport is denied regardless of address or headers", () => {
  const guard = createMetricsAccess();
  const cases = [
    { ip: "10.0.0.5", socket: { remoteAddress: "127.0.0.1" }, headers: {} },
    { ip: "192.168.1.10", socket: { remoteAddress: "172.16.0.1" }, headers: { "x-forwarded-for": "203.0.113.9" } },
    { ip: "::1", socket: { remoteAddress: "::ffff:10.1.2.3" }, headers: { "x-forwarded-for": "198.51.100.7" } },
  ];
  for (const c of cases) {
    const res = fakeRes();
    let next = 0;
    guard({ user: { role: "viewer" }, ...c, id: "proxy-1" }, res, () => { next += 1; });
    assert.equal(next, 0, JSON.stringify(c));
    assert.equal(res.statusCode, 403, JSON.stringify(c));
    assert.equal(res.body.error.code, "FORBIDDEN");
  }
});

// No opt-out: extra options cannot restore a private-network or address-based bypass.
test("no option re-enables an address-based bypass", () => {
  for (const opts of [{ allowPrivate: true }, { allowPrivateNetwork: true }, { allowPrivate: true, signalLogger: { warn() {} } }]) {
    const guard = createMetricsAccess(opts);
    const res = fakeRes();
    let next = 0;
    guard({ ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" }, id: "x" }, res, () => { next += 1; });
    assert.equal(next, 0);
    assert.equal(res.statusCode, 403);
  }
});

// Denials are signalled locally with a redacted payload; admin access emits no signal.
test("denial is signalled; admin access is not", () => {
  const lines = [];
  const guard = createMetricsAccess({ signalLogger: { warn: (e, f) => lines.push({ e, f }) } });
  guard({ user: { role: "viewer" }, ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" }, id: "r" }, fakeRes(), () => {});
  assert.equal(lines.length, 1);
  assert.equal(lines[0].e, "metrics_access_denied");
  assert.equal(lines[0].f.hasSession, true);
  assert.equal(lines[0].f.route, "/metrics");
  guard({ user: { role: "admin" }, id: "r2" }, fakeRes(), () => {});
  assert.equal(lines.length, 1);
});
