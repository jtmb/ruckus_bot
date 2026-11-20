// signals.test.js — focused tests for structured JSON signals and redaction (OPS-004).
// Pure Node; the sink is an injected array so nothing reaches stdout.

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSignalLogger, redact, isSensitiveKey } = require("./signals");

// Each emit is one JSON line with a stable envelope plus redacted fields.
test("emit produces structured JSON", () => {
  const lines = [];
  const sig = createSignalLogger({ sink: (l) => lines.push(l), now: () => "2026-11-17T00:00:00.000Z" });
  assert.equal(sig.info("heartbeat_ok", { ageSeconds: 12 }), true);
  const rec = JSON.parse(lines[0]);
  assert.equal(rec.ts, "2026-11-17T00:00:00.000Z");
  assert.equal(rec.level, "info");
  assert.equal(rec.event, "heartbeat_ok");
  assert.equal(rec.ageSeconds, 12);
});

// Sensitive field names in camelCase and snake_case are recognised.
test("sensitive keys are detected", () => {
  for (const k of ["token", "sessionToken", "api_key", "userId", "guild_id", "password", "authorization", "email", "ip"]) {
    assert.equal(isSensitiveKey(k), true, k);
  }
  assert.equal(isSensitiveKey("ageSeconds"), false);
});

// Redaction strips secrets and raw per-user/guild fields at any depth and redacts token shapes.
test("redact removes secrets and raw ids", () => {
  const safe = redact({
    level: "info",
    token: "abc",
    password: "hunter2",
    userId: "12345",
    guildId: "999",
    authorization: "Bearer x",
    nested: { apiKey: "k", ok: 1 },
    note: "jwt eyJhbGciOi.eyJzdWIiOi.J9Xb2-abc12345678901234567890",
  });
  assert.equal(safe.token, undefined);
  assert.equal(safe.password, undefined);
  assert.equal(safe.userId, undefined);
  assert.equal(safe.guildId, undefined);
  assert.equal(safe.authorization, undefined);
  assert.equal(safe.nested.apiKey, undefined);
  assert.equal(safe.nested.ok, 1);
  assert.match(safe.note, /\[redacted/);
  assert.ok(!JSON.stringify(safe).includes("hunter2"));
});

// A throwing sink is swallowed: observability never breaks the caller.
test("throwing sink is contained", () => {
  const sig = createSignalLogger({ sink: () => { throw new Error("disk full"); } });
  assert.equal(sig.error("boom", {}), false);
});

// The optional recent() ring is bounded and reports drops.
test("recent buffer is bounded", () => {
  const sig = createSignalLogger({ sink: () => {}, bufferSize: 2 });
  sig.info("one", {}); sig.info("two", {}); sig.info("three", {});
  assert.equal(sig.recent().length, 2);
  assert.equal(sig.dropped(), 1);
});
