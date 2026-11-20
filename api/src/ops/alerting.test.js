// alerting.test.js — focused tests for once-only alert/recovery and delivery failure boundaries.
// Uses node:test only; all deliveries are injected fixtures, so no live webhook call is ever made.

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAlertState, createWebhookDeliverer, readAlertConfig, ALLOWED_PROVIDERS } = require("./alerting");

// Build a signal logger fixture that records structured calls without touching stdout.
function fixtureSignals() {
  const lines = [];
  return { lines, info: (e, f) => lines.push({ level: "info", event: e, ...f }), error: (e, f) => lines.push({ level: "error", event: e, ...f }), warn: (e, f) => lines.push({ level: "warn", event: e, ...f }) };
}

// Alert must fire exactly once while a subject stays unhealthy across many observations.
test("alert fires once while unhealthy persists", () => {
  const a = createAlertState();
  a.observe("bot", false, 1000);
  a.observe("bot", false, 2000);
  a.observe("bot", false, 3000);
  assert.equal(a.counts().alerts, 1);
  assert.equal(a.history().filter((e) => e.type === "alert").length, 1);
  assert.equal(a.snapshot("bot").state, "alerting");
});

// Recovery must fire exactly once; repeated healthy samples are idempotent.
test("recovery fires once and is idempotent", () => {
  const a = createAlertState();
  a.observe("bot", false, 1000);
  a.observe("bot", true, 2000);
  a.observe("bot", true, 3000);
  assert.equal(a.counts().alerts, 1);
  assert.equal(a.counts().recoveries, 1);
  assert.equal(a.history().filter((e) => e.type === "recovery").length, 1);
  assert.equal(a.snapshot("bot").state, "healthy");
});

// A fresh incident after recovery is a new alert/recovery pair.
test("re-alert after recovery counts a second incident", () => {
  const a = createAlertState();
  a.observe("bot", false, 1000);
  a.observe("bot", true, 2000);
  a.observe("bot", false, 3000);
  a.observe("bot", true, 4000);
  assert.equal(a.counts().alerts, 2);
  assert.equal(a.counts().recoveries, 2);
});

// The grace period keeps a short blip from alerting until it is sustained.
test("grace period suppresses premature alerts", () => {
  const a = createAlertState({ graceMs: 5000 });
  a.observe("bot", false, 0);
  a.observe("bot", false, 4000);
  assert.equal(a.counts().alerts, 0);
  assert.equal(a.snapshot("bot").state, "suspect");
  a.observe("bot", false, 5000);
  assert.equal(a.counts().alerts, 1);
});

// With no deliverer, delivery is off: events exist only in local history/signals.
test("delivery is off by default but signals remain local", () => {
  const sig = fixtureSignals();
  const a = createAlertState({ signalLogger: sig });
  a.observe("bot", false, 1000);
  a.observe("bot", true, 2000);
  assert.equal(a.counts().alerts, 1);
  assert.equal(a.counts().recoveries, 1);
  assert.ok(sig.lines.some((l) => l.event === "alert_fired"));
  assert.ok(sig.lines.some((l) => l.event === "alert_recovered"));
});

// A throwing or rejecting deliverer must not break state transitions, and failures are counted.
test("deliverer failures are contained and counted", async () => {
  const sig = fixtureSignals();
  let calls = 0;
  const deliverer = (event) => {
    calls += 1;
    if (event.type === "alert") throw new Error("boom");
    return Promise.reject(new Error("nope"));
  };
  const a = createAlertState({ deliverer, signalLogger: sig });
  a.observe("bot", false, 1000);
  a.observe("bot", true, 2000);
  await new Promise((r) => setImmediate(r));
  assert.equal(calls, 2);
  assert.equal(a.counts().alerts, 1);
  assert.equal(a.counts().recoveries, 1);
  assert.equal(a.counts().deliveryFailed, 2);
  assert.ok(sig.lines.every((l) => !String(l.message || "").includes("boom")));
});

// Webhook delivery requires an allowlisted provider and https URL; injected fetch avoids live calls.
test("webhook deliverer is gated and injectable", async () => {
  assert.throws(() => createWebhookDeliverer({ provider: "email", url: "https://x/y" }), /not allowlisted/);
  assert.throws(() => createWebhookDeliverer({ provider: "webhook" }), /no webhook URL/);
  assert.throws(() => createWebhookDeliverer({ provider: "webhook", url: "http://example.com/hook" }), /must be https/);
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; };
  const deliver = createWebhookDeliverer({ provider: "webhook", url: "https://hooks.example/SECRET123", fetchImpl });
  assert.deepEqual(deliver.describe(), { provider: "webhook" });
  const sig = fixtureSignals();
  const a = createAlertState({ deliverer: deliver, signalLogger: sig });
  a.observe("bot", false, 1000);
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.length, 1);
  assert.match(calls[0].init.body, /ALERT: bot/);
  assert.ok(!JSON.stringify(sig.lines).includes("SECRET123"));
});

// A configured webhook URL must not carry userinfo, and delivery must refuse to follow redirects.
// Both checks are local; the injected fetch proves no request is made for a rejected URL.
test("webhook URL rejects userinfo and forbids redirects", async () => {
  for (const url of ["https://user@hooks.example/hook", "https://user:pass@hooks.example/hook"]) {
    assert.throws(() => createWebhookDeliverer({ provider: "webhook", url }), /userinfo/);
  }
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; };
  const deliver = createWebhookDeliverer({ provider: "webhook", url: "https://hooks.example/hook", fetchImpl });
  await deliver({ type: "alert", subject: "bot", at: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(new URL(calls[0].url).username, "");
  assert.equal(new URL(calls[0].url).password, "");
});

// Subject and history maps are hard-capped so a noisy deployment cannot grow memory without bound.
test("state and history are bounded", () => {
  const a = createAlertState({ maxSubjects: 2, maxHistory: 2 });
  a.observe("a", false, 1); a.observe("b", false, 2); a.observe("c", false, 3);
  assert.equal(a.counts().subjects, 2);
  assert.ok(a.snapshot("a") === null || a.snapshot("b") === null || a.snapshot("c") === null);
  a.observe("c", true, 4); a.observe("c", false, 5); a.observe("c", true, 6);
  assert.ok(a.history().length <= 2);
});

// Configuration defaults to delivery off and tolerates malformed numbers.
test("config is secure by default", () => {
  const off = readAlertConfig({});
  assert.equal(off.deliveryEnabled, false);
  assert.equal(off.pollMs, 30000);
  const on = readAlertConfig({ ALERT_WEBHOOK_PROVIDER: "webhook", ALERT_WEBHOOK_URL: "https://x/y", ALERT_POLL_MS: "oops" });
  assert.equal(on.deliveryEnabled, true);
  assert.equal(on.pollMs, 30000);
  const bad = readAlertConfig({ ALERT_WEBHOOK_PROVIDER: "email", ALERT_WEBHOOK_URL: "https://x/y" });
  assert.equal(bad.deliveryEnabled, false);
  assert.deepEqual(ALLOWED_PROVIDERS, ["webhook"]);
});
