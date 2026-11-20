// metrics.js — dependency-free, low-cardinality Prometheus text registry for WP8 observability.
// Inputs: a metric definition allowlist plus inc/observe/set calls with label objects.
// Outputs: render() -> Prometheus text; snapshot() -> plain debug object.
// Side effects: in-memory maps only; invalid or over-cardinality writes are counted, never thrown.
// Failure behaviour: unknown metric names, unknown label keys and unsafe values are rejected
// and increment ruckus_metrics_invalid_total, so instrumentation can never break a request.

"use strict";

// The five contract metrics from contracts/api-contract.md §7 plus one internal rejection counter.
// Label keys are the allowlist: a write with any other key is refused.
const DEFAULT_METRICS = Object.freeze([
  { name: "ruckus_http_requests_total", type: "counter", help: "HTTP requests by normalised route and status bucket.", labels: ["route", "status"], values: { status: ["2xx", "3xx", "4xx", "5xx"] } },
  { name: "ruckus_http_request_duration_seconds", type: "histogram", help: "HTTP request duration in seconds by normalised route.", labels: ["route"], buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] },
  { name: "ruckus_command_total", type: "counter", help: "Bot commands by name and result.", labels: ["command", "result"], values: { result: ["ok", "error"] } },
  { name: "ruckus_command_duration_seconds", type: "histogram", help: "Bot command duration in seconds by command name.", labels: ["command"], buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] },
  { name: "ruckus_db_errors_total", type: "counter", help: "Database errors observed by the API.", labels: [] },
  { name: "ruckus_log_queue_dropped_total", type: "counter", help: "Log-queue entries dropped by the bot (fed by the bot dependency).", labels: [] },
  { name: "ruckus_metrics_invalid_total", type: "counter", help: "Rejected metric writes by reason.", labels: ["reason"] },
]);

const MAX_SERIES = 200; // per metric: hard ceiling on label combinations (cardinality guard)
const MAX_VALUE_LENGTH = 64;
const SAFE_VALUE = /^[A-Za-z0-9_:/.\-]+$/;

// Coerce a label value to a short, safe string: numbers pass, unsafe/overlong values collapse to "other".
function sanitizeLabelValue(value) {
  if (value === null || value === undefined) return "other";
  const s = String(value);
  if (s.length > MAX_VALUE_LENGTH || !SAFE_VALUE.test(s)) return "other";
  return s;
}

// Map an HTTP status code to one of four fixed buckets so labels stay low-cardinality.
function statusBucket(code) {
  const n = Number(code);
  if (!Number.isInteger(n) || n < 100 || n > 599) return "other";
  return `${Math.floor(n / 100)}xx`;
}

// Normalise a request path to a route pattern: strip query, collapse numeric/id and UUID segments.
function normalizeRoute(path) {
  if (typeof path !== "string" || !path.startsWith("/")) return "other";
  let p = path.split("?")[0];
  p = p.replace(/\/[0-9]{4,}/g, "/:id");
  p = p.replace(/\/[0-9a-f]{8}-[0-9a-f-]{20,}/gi, "/:id");
  p = p.replace(/\/+$/, "") || "/";
  if (p.length > MAX_VALUE_LENGTH || !SAFE_VALUE.test(p)) return "other";
  return p;
}

// Create an isolated registry. opts.definitions overrides the allowlist; opts.maxSeries sets the cap.
function createMetrics(opts = {}) {
  const definitions = Array.isArray(opts.definitions) ? opts.definitions : DEFAULT_METRICS;
  const maxSeries = Number.isInteger(opts.maxSeries) && opts.maxSeries > 0 ? opts.maxSeries : MAX_SERIES;
  const byName = new Map(definitions.map((d) => [d.name, d]));
  const store = new Map(definitions.map((d) => [d.name, new Map()]));

  // Emit a zero sample from startup for label-less metrics so scrapers always see them.
  for (const def of definitions) {
    if (def.labels.length === 0) {
      store.get(def.name).set("", def.type === "histogram"
        ? { labels: {}, count: 0, sum: 0, buckets: def.buckets.map(() => 0) }
        : { labels: {}, value: 0 });
    }
  }

  // Internal helper: record a rejected write without risking recursion into an unknown metric.
  function reject(reason) {
    const m = byName.get("ruckus_metrics_invalid_total");
    if (!m) return;
    const series = store.get(m.name);
    const key = `reason=${reason}`;
    if (!series.has(key)) series.set(key, { labels: { reason }, value: 0 });
    series.get(key).value += 1;
  }

  // Validate labels against the metric's allowlist and apply per-key value allowlists.
  function prepare(name, rawLabels) {
    const def = byName.get(name);
    if (!def) return null;
    const source = rawLabels && typeof rawLabels === "object" && !Array.isArray(rawLabels) ? rawLabels : {};
    const labels = {};
    for (const key of Object.keys(source)) {
      if (!def.labels.includes(key)) return null; // unknown label key: refuse whole write
      let value = sanitizeLabelValue(source[key]);
      const allowed = def.values && def.values[key];
      if (allowed && !allowed.includes(value)) value = "other";
      labels[key] = value;
    }
    for (const key of def.labels) if (!(key in labels)) labels[key] = "other";
    return { def, labels, key: def.labels.map((k) => `${k}=${labels[k]}`).join(",") };
  }

  // Fetch or create a bounded series; false when the per-metric series cap is reached.
  function getSeries(def, labels, key) {
    const series = store.get(def.name);
    let entry = series.get(key);
    if (!entry) {
      if (series.size >= maxSeries) return null;
      entry = def.type === "histogram"
        ? { labels, count: 0, sum: 0, buckets: def.buckets.map(() => 0) }
        : { labels, value: 0 };
      series.set(key, entry);
    }
    return entry;
  }

  // Increment a counter by a positive finite amount. Returns true on success.
  function inc(name, labels, amount = 1) {
    const p = prepare(name, labels);
    const n = Number(amount);
    if (!p || p.def.type !== "counter" || !Number.isFinite(n) || n <= 0) { reject("invalid_write"); return false; }
    const entry = getSeries(p.def, p.labels, p.key);
    if (!entry) { reject("cardinality"); return false; }
    entry.value += n;
    return true;
  }

  // Observe a value into a histogram; buckets are inclusive (le).
  function observe(name, labels, amount) {
    const p = prepare(name, labels);
    const n = Number(amount);
    if (!p || p.def.type !== "histogram" || !Number.isFinite(n)) { reject("invalid_write"); return false; }
    const entry = getSeries(p.def, p.labels, p.key);
    if (!entry) { reject("cardinality"); return false; }
    entry.count += 1;
    entry.sum += n;
    p.def.buckets.forEach((b, i) => { if (n <= b) entry.buckets[i] += 1; });
    return true;
  }

  // Set a gauge-style value on a counter series (used for bootstrap gauges; additive only).
  function set(name, labels, amount) {
    const p = prepare(name, labels);
    const n = Number(amount);
    if (!p || p.def.type !== "counter" || !Number.isFinite(n) || n < 0) { reject("invalid_write"); return false; }
    const entry = getSeries(p.def, p.labels, p.key);
    if (!entry) { reject("cardinality"); return false; }
    entry.value = n;
    return true;
  }

  // Format one label set in stable key order for deterministic output.
  function formatLabels(labels, extra) {
    const parts = Object.keys(labels).sort().map((k) => `${k}="${labels[k]}"`);
    if (extra) parts.push(`${extra[0]}="${extra[1]}"`);
    return parts.length ? `{${parts.join(",")}}` : "";
  }

  // Render all series as Prometheus text with HELP/TYPE headers.
  function render() {
    const lines = [];
    for (const def of definitions) {
      lines.push(`# HELP ${def.name} ${def.help}`);
      lines.push(`# TYPE ${def.name} ${def.type}`);
      for (const entry of store.get(def.name).values()) {
        if (def.type === "histogram") {
          def.buckets.forEach((b, i) => lines.push(`${def.name}_bucket${formatLabels(entry.labels, ["le", String(b)])} ${entry.buckets[i]}`));
          lines.push(`${def.name}_bucket${formatLabels(entry.labels, ["le", "+Inf"])} ${entry.count}`);
          lines.push(`${def.name}_sum${formatLabels(entry.labels)} ${entry.sum}`);
          lines.push(`${def.name}_count${formatLabels(entry.labels)} ${entry.count}`);
        } else {
          lines.push(`${def.name}${formatLabels(entry.labels)} ${entry.value}`);
        }
      }
    }
    return `${lines.join("\n")}\n`;
  }

  // Return a deep plain copy for diagnostics/tests; no live references into the store.
  function snapshot() {
    const out = {};
    for (const def of definitions) {
      out[def.name] = Array.from(store.get(def.name).values(), (e) => JSON.parse(JSON.stringify(e)));
    }
    return out;
  }

  return { inc, observe, set, render, snapshot, normalizeRoute, statusBucket, sanitizeLabelValue, definitions };
}

module.exports = { createMetrics, DEFAULT_METRICS, MAX_SERIES, sanitizeLabelValue, statusBucket, normalizeRoute };
