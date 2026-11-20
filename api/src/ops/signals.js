// signals.js — structured, redacted JSON operational signals for WP8 (OPS-004).
// Inputs: level, event name and a flat/nested field object from callers.
// Outputs: one JSON line per emit through an injected sink (console.log by default).
// Side effects: optional bounded in-memory ring buffer for local inspection.
// Failure behaviour: a throwing sink is swallowed; sensitive keys and token-like values are
// redacted so no secret, token or raw per-user/guild field can reach stdout or the buffer.

"use strict";

const LEVELS = ["debug", "info", "warn", "error"];
const SAFE_EVENT = /^[a-z0-9_.:-]{1,64}$/;
const MAX_STRING = 256;
const MAX_DEPTH = 4;
const MAX_ARRAY = 20;

// Match camelCase and snake_case sensitive field names by normalising to snake segments.
function isSensitiveKey(key) {
  const k = String(key).replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  return /(^|_)(token|secret|password|passwd|authorization|authorisation|cookie|session|sid|hash|credential|credentials|api_key|apikey|email|ip|ip_address|user_id|guild_id|username|discord_id|snowflake|bearer|auth)(_|$)/.test(k);
}

// Redact token-shaped values (bcrypt hashes, JWTs, generic long opaque strings) inside strings.
function redactString(value) {
  let s = String(value);
  s = s.replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, "[redacted:hash]");
  s = s.replace(/\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{16,}\b/g, "[redacted:token]");
  s = s.replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted:secret]");
  return s.length > MAX_STRING ? `${s.slice(0, MAX_STRING)}…` : s;
}

// Recursively build a safe object: drop sensitive keys, cap depth/arrays, coerce scalars.
function redact(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return redactString(value);
  if (depth >= MAX_DEPTH) return "[redacted:depth]";
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) {
      if (isSensitiveKey(key)) continue;
      out[key] = redact(value[key], depth + 1);
    }
    return out;
  }
  return null; // functions/symbols are never serialised
}

// Create a signal logger. opts.sink collects lines; opts.bufferSize enables a bounded recent() ring.
function createSignalLogger(opts = {}) {
  const sink = typeof opts.sink === "function" ? opts.sink : (line) => console.log(line);
  const now = typeof opts.now === "function" ? opts.now : () => new Date().toISOString();
  const bufferSize = Number.isInteger(opts.bufferSize) && opts.bufferSize > 0 ? opts.bufferSize : 0;
  const buffer = [];
  let dropped = 0;

  // Emit one structured signal; returns true when the sink accepted the line.
  function emit(level, event, fields = {}) {
    const safeLevel = LEVELS.includes(level) ? level : "info";
    const safeEvent = SAFE_EVENT.test(String(event)) ? String(event) : "unknown";
    const record = Object.assign({ ts: now(), level: safeLevel, event: safeEvent }, redact(fields));
    let line;
    try { line = JSON.stringify(record); } catch { return false; }
    if (bufferSize) {
      if (buffer.length >= bufferSize) { buffer.shift(); dropped += 1; }
      buffer.push(record);
    }
    try { sink(line); return true; } catch { return false; }
  }

  return {
    emit,
    debug: (event, fields) => emit("debug", event, fields),
    info: (event, fields) => emit("info", event, fields),
    warn: (event, fields) => emit("warn", event, fields),
    error: (event, fields) => emit("error", event, fields),
    recent: () => buffer.slice(),
    dropped: () => dropped,
  };
}

module.exports = { createSignalLogger, redact, redactString, isSensitiveKey, LEVELS };
