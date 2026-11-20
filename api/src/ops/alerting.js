// alerting.js — bounded, once-only alert/recovery state with off-by-default delivery (FEAT-012/OPS-006).
// Inputs: observe(subject, healthy, at) plus an optional injected deliverer and signal logger.
// Outputs: per-subject state snapshots and a bounded event history; local structured signals always.
// Side effects: in-memory state only unless an operator explicitly supplies a delivery provider.
// Failure behaviour: delivery errors are counted and signalled, never propagated; bad observations
// are ignored; subject/history maps are hard-capped to bound memory. A configured webhook URL with
// userinfo is refused and redirects are never followed, so delivery stays pinned to that one endpoint.

"use strict";

// Only this operator-configured provider may receive deliveries; anything else disables delivery.
const ALLOWED_PROVIDERS = Object.freeze(["webhook"]);
const SAFE_SUBJECT = /^[a-z0-9_.:-]{1,64}$/;

// Normalise a subject name; invalid names become null so the caller can refuse the observation.
function safeSubject(subject) {
  const s = String(subject == null ? "" : subject);
  return SAFE_SUBJECT.test(s) ? s : null;
}

// Reduce an error to an allowlisted code plus a fixed message, so no secret/error text is logged.
function safeError(err) {
  const code = err && typeof err.code === "string" && /^[A-Z0-9_]{1,32}$/.test(err.code) ? err.code : "unknown";
  return { code, message: "alert delivery failed" };
}

// Parse alert-related environment without throwing. Delivery is off unless provider AND url are valid.
function readAlertConfig(env = process.env) {
  const int = (name, def, min, max) => {
    const raw = env[name];
    if (raw === undefined || raw === "") return def;
    const n = Number(raw);
    return Number.isInteger(n) && n >= min && n <= max ? n : def;
  };
  const provider = env.ALERT_WEBHOOK_PROVIDER || null;
  const url = env.ALERT_WEBHOOK_URL || null;
  return {
    provider,
    url,
    deliveryEnabled: Boolean(provider && url && ALLOWED_PROVIDERS.includes(provider)),
    graceMs: int("ALERT_OFFLINE_GRACE_MS", 0, 0, 600000),
    pollMs: int("ALERT_POLL_MS", 30000, 5000, 3600000),
  };
}

// Build an allowlisted webhook deliverer. The URL is never logged; fetchImpl is injectable so tests
// never make a live call. Returns a function with a describe() that exposes only the provider name.
function createWebhookDeliverer(opts = {}) {
  if (!opts.provider || !ALLOWED_PROVIDERS.includes(opts.provider)) {
    throw new Error("delivery disabled: provider is not allowlisted");
  }
  if (typeof opts.url !== "string" || !opts.url) throw new Error("delivery disabled: no webhook URL");
  let target;
  try { target = new URL(opts.url); } catch { throw new Error("delivery disabled: invalid webhook URL"); }
  // Reject embedded credentials (user:pass@host): they can leak via proxies/logs and are never needed.
  if (target.username !== "" || target.password !== "") {
    throw new Error("delivery disabled: webhook URL must not contain userinfo");
  }
  const insecure = opts.allowInsecureLoopback === true && ["localhost", "127.0.0.1", "::1"].includes(target.hostname);
  if (target.protocol !== "https:" && !insecure) throw new Error("delivery disabled: webhook URL must be https");
  const fetchImpl = typeof opts.fetchImpl === "function"
    ? opts.fetchImpl
    : (typeof globalThis.fetch === "function" ? globalThis.fetch : null);
  if (!fetchImpl) throw new Error("delivery disabled: no fetch implementation");
  const timeoutMs = Number.isInteger(opts.timeoutMs) && opts.timeoutMs >= 100 ? opts.timeoutMs : 5000;

  // POST one safe event as JSON; reject non-2xx so the caller can count a delivery failure.
  async function deliver(event) {
    const label = event.type === "alert" ? "ALERT" : "RECOVERED";
    const body = JSON.stringify({ text: `[ruckus_bot] ${label}: ${event.subject}` });
    const res = await fetchImpl(target.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      // Never follow a 3xx: the operator-pinned endpoint must stay the only delivery target.
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res || !res.ok) {
      const err = new Error("webhook rejected");
      err.code = "DELIVERY_REJECTED";
      throw err;
    }
  }
  deliver.describe = () => ({ provider: ALLOWED_PROVIDERS[ALLOWED_PROVIDERS.indexOf(opts.provider)] });
  return deliver;
}

// Create a bounded alert state machine. graceMs delays the transition from suspect to alerting;
// recovery fires exactly once on the first healthy observation after an alert.
function createAlertState(opts = {}) {
  const now = typeof opts.now === "function" ? opts.now : () => Date.now();
  const graceMs = Number.isFinite(opts.graceMs) && opts.graceMs >= 0 ? opts.graceMs : 0;
  const maxSubjects = Number.isInteger(opts.maxSubjects) && opts.maxSubjects > 0 ? opts.maxSubjects : 64;
  const maxHistory = Number.isInteger(opts.maxHistory) && opts.maxHistory > 0 ? opts.maxHistory : 100;
  const deliverer = typeof opts.deliverer === "function" ? opts.deliverer : null;
  const signals = opts.signalLogger && typeof opts.signalLogger.info === "function" ? opts.signalLogger : null;
  const subjects = new Map();
  const history = [];
  const counts = { alerts: 0, recoveries: 0, deliveryFailed: 0, invalid: 0, evicted: 0 };

  // Record an event locally (signal + bounded history), then attempt delivery without propagating errors.
  function dispatch(event) {
    if (history.length >= maxHistory) { history.shift(); counts.evicted += 1; }
    history.push(Object.freeze({ ...event }));
    if (signals) signals.info(event.type === "alert" ? "alert_fired" : "alert_recovered", { subject: event.subject, at: event.at, kind: event.kind || "health" });
    if (!deliverer) return; // delivery off by default
    try {
      const result = deliverer(event);
      if (result && typeof result.then === "function") {
        result.catch((err) => {
          counts.deliveryFailed += 1;
          if (signals) signals.error("alert_delivery_failed", Object.assign({ subject: event.subject }, safeError(err)));
        });
      }
    } catch (err) {
      counts.deliveryFailed += 1;
      if (signals) signals.error("alert_delivery_failed", Object.assign({ subject: event.subject }, safeError(err)));
    }
  }

  // Observe one health sample. A new incident alerts once; the first healthy sample recovers once.
  function observe(subject, healthy, at) {
    const key = safeSubject(subject);
    const time = Number.isFinite(at) ? at : now();
    if (!key || typeof healthy !== "boolean") { counts.invalid += 1; return null; }
    let s = subjects.get(key);
    if (!s && subjects.size >= maxSubjects) {
      // Evict the least recently seen subject rather than growing without bound.
      let oldest = null;
      for (const [k, v] of subjects) if (oldest === null || v.lastSeen < subjects.get(oldest).lastSeen) oldest = k;
      if (oldest !== null) { subjects.delete(oldest); counts.evicted += 1; }
    }
    if (!s) {
      s = { state: "unknown", unhealthySince: null, lastSeen: time, alerts: 0, recoveries: 0, lastAlertAt: null, lastRecoveryAt: null };
      subjects.set(key, s);
    }
    s.lastSeen = time;

    if (healthy) {
      s.unhealthySince = null;
      if (s.state === "alerting") {
        s.state = "healthy";
        s.recoveries += 1;
        s.lastRecoveryAt = time;
        counts.recoveries += 1;
        dispatch({ type: "recovery", subject: key, at: time });
      } else {
        s.state = "healthy"; // suspect never alerted: no recovery notice needed
      }
    } else {
      if (s.state === "healthy" || s.state === "unknown" || s.state === "recovering") {
        s.state = "suspect";
        s.unhealthySince = time;
      }
      if (s.state === "suspect" && time - s.unhealthySince >= graceMs) {
        s.state = "alerting";
        s.alerts += 1;
        s.lastAlertAt = time;
        counts.alerts += 1;
        dispatch({ type: "alert", subject: key, at: time });
      }
      // state === "alerting": intentionally no further alert until a recovery intervenes.
    }
    return snapshot(key);
  }

  // Return a copy of one subject's state, or all subjects when no name is given.
  function snapshot(subject) {
    if (subject !== undefined) {
      const s = subjects.get(safeSubject(subject));
      return s ? { ...s } : null;
    }
    const out = {};
    for (const [k, v] of subjects) out[k] = { ...v };
    return out;
  }

  return {
    observe,
    snapshot,
    history: () => history.slice(),
    counts: () => ({ ...counts, subjects: subjects.size }),
    reset: (subject) => (subject === undefined ? subjects.clear() : subjects.delete(safeSubject(subject))),
    graceMs: () => graceMs,
  };
}

module.exports = { createAlertState, createWebhookDeliverer, readAlertConfig, ALLOWED_PROVIDERS, safeSubject };
