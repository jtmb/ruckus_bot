// metrics.test.js — focused tests for allowlisted labels, cardinality bounds and Prometheus text.
// Pure Node; no Express, network or database involved.

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createMetrics, statusBucket, normalizeRoute } = require("./metrics");

// The default registry renders HELP/TYPE headers and all contract metrics, even with zero samples.
test("render exposes contract metrics with headers", () => {
  const m = createMetrics();
  const text = m.render();
  assert.match(text, /# TYPE ruckus_http_requests_total counter/);
  assert.match(text, /# TYPE ruckus_command_duration_seconds histogram/);
  assert.match(text, /ruckus_db_errors_total 0/);
  assert.match(text, /ruckus_log_queue_dropped_total 0/);
});

// Status codes collapse to fixed buckets, never raw codes.
test("statusBucket is low cardinality", () => {
  assert.equal(statusBucket(200), "2xx");
  assert.equal(statusBucket(404), "4xx");
  assert.equal(statusBucket(503), "5xx");
  assert.equal(statusBucket("abc"), "other");
});

// Route patterns collapse ids and UUIDs so per-user/guild values cannot become labels.
test("normalizeRoute collapses dynamic segments", () => {
  assert.equal(normalizeRoute("/bot/logs/123456789012345678?limit=5"), "/bot/logs/:id");
  assert.equal(normalizeRoute("/bot/550e8400-e29b-41d4-a716-446655440000"), "/bot/:id");
  assert.equal(normalizeRoute("relative"), "other");
});

// Valid writes render; unknown label keys are refused and counted without throwing.
test("allowlisted labels only", () => {
  const m = createMetrics();
  assert.equal(m.inc("ruckus_http_requests_total", { route: "/health", status: "2xx" }), true);
  assert.match(m.render(), /ruckus_http_requests_total\{route="\/health",status="2xx"\} 1/);
  assert.equal(m.inc("ruckus_http_requests_total", { route: "/health", userId: "42" }), false);
  assert.equal(m.inc("not_a_metric", {}), false);
  assert.equal(m.snapshot().ruckus_metrics_invalid_total.length, 1);
});

// Unknown label values fall back to "other" instead of creating new series.
test("value allowlists collapse unknowns", () => {
  const m = createMetrics();
  m.inc("ruckus_command_total", { command: "flip", result: "weird" });
  assert.match(m.render(), /result="other"/);
});

// A hard per-metric series cap prevents cardinality explosion.
test("cardinality is capped", () => {
  const defs = [{ name: "x_total", type: "counter", help: "x", labels: ["k"] }];
  const m = createMetrics({ definitions: defs, maxSeries: 2 });
  assert.equal(m.inc("x_total", { k: "a" }), true);
  assert.equal(m.inc("x_total", { k: "b" }), true);
  assert.equal(m.inc("x_total", { k: "c" }), false);
  assert.equal(Object.keys(m.snapshot().x_total).length, 2);
});

// Histograms emit bucket/sum/count lines with an +Inf bucket.
test("histogram renders buckets", () => {
  const m = createMetrics();
  m.observe("ruckus_command_duration_seconds", { command: "flip" }, 0.2);
  const text = m.render();
  assert.match(text, /ruckus_command_duration_seconds_bucket\{command="flip",le="\+Inf"\} 1/);
  assert.match(text, /ruckus_command_duration_seconds_count\{command="flip"\} 1/);
  assert.match(text, /ruckus_command_duration_seconds_sum\{command="flip"\} 0\.2/);
});
