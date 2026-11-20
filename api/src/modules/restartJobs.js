// restartJobs.js — bounded, in-memory restart job queue for WP8 (REG-011).
// Holds at most one active job, keeps a small terminal history, and proves success only when the
// bot heartbeat shows a NEW process: the process marker (started_at) must have advanced beyond the
// pre-restart baseline and must not pre-date the restart request. A fresh updated_at from the same
// old process is never proof. The process-manager command is injected by the caller (a fixed
// supervisorctl invocation); no request data ever reaches an executor.
const crypto = require("crypto");

const DEFAULTS = { timeoutMs: 20000, pollMs: 2000, maxHistory: 20 };
// bot_heartbeat.started_at is a plain MySQL TIMESTAMP (whole-second precision). A marker in the
// same second as the baseline is ambiguous, so it is conservatively never treated as proof.
const TIMESTAMP_PRECISION_MS = 1000;

const SUCCESS_DETAIL = "Bot restarted; a new bot process was confirmed.";
const STOPPED_DETAIL = "Restart tracking stopped before a new bot process was confirmed.";
const NO_BASELINE_DETAIL = "Could not confirm a new bot process: no pre-restart heartbeat baseline was available.";
const timeoutDetail = (ms) => `No new bot process was confirmed within ${Math.round(ms / 1000)} s of the restart request.`;

// Normalises the timestamp shapes a heartbeat provider may return into epoch milliseconds.
// Input: Date | number | parseable string | null. Output: finite number or null. No side effects.
function toMs(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Date.parse(value);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

// Pulls the observed heartbeat time (updated_at / heartbeat_at) out of a provider result.
// Input: provider result (object or bare timestamp). Output: epoch ms or null. No side effects.
function heartbeatTime(result) {
  if (!result) return null;
  if (typeof result === "object") {
    return toMs(result.updatedAt) ?? toMs(result.at) ?? toMs(result.heartbeatAt);
  }
  return toMs(result);
}

// Pulls the bot process marker (started_at) out of a provider result.
// Input: provider result object. Output: epoch ms or null. No side effects.
function heartbeatProcessMarker(result) {
  if (!result || typeof result !== "object") return null;
  return toMs(result.startedAt) ?? toMs(result.processMarker);
}

// Conservative proof of a NEW bot process. The marker must be at least one whole second newer than
// the pre-restart baseline (avoids same-second TIMESTAMP ambiguity) and must not pre-date the
// restart request (allowing one second of truncation for MySQL TIMESTAMP precision).
// Input: provider result, baseline marker ms, request-time lower bound ms. Output: boolean.
function provesNewProcess(result, baselineMarkerMs, lowerBoundMs) {
  const marker = heartbeatProcessMarker(result);
  if (marker === null || baselineMarkerMs === null || !Number.isFinite(lowerBoundMs)) return false;
  if (marker - baselineMarkerMs < TIMESTAMP_PRECISION_MS) return false;
  if (marker < lowerBoundMs - TIMESTAMP_PRECISION_MS) return false;
  return true;
}

// Internal error used when the shared wall-clock budget is exhausted; carries a safe uppercase code.
class BudgetError extends Error {
  constructor() { super("restart budget exceeded"); this.code = "RESTART_BUDGET_EXCEEDED"; }
}

// Turns an executor error into a short readable detail that cannot leak command output/secrets.
// Input: unknown error. Output: string. No side effects; only a safe uppercase code is retained.
function safeExecutorDetail(error) {
  const code = error && typeof error.code === "string" && /^[A-Z0-9_]{1,32}$/.test(error.code)
    ? error.code
    : null;
  return code
    ? `Restart command could not be executed (${code}).`
    : "Restart command could not be executed (process manager unavailable).";
}

// Builds the bounded queue. Input: injected executor, heartbeat reader and optional clocks/sinks.
// Output: { enqueue, get, waitFor, count, stop }. Side effects: owns in-memory state and, by
// default, short-lived internal timers; no process-manager call happens here.
function createRestartJobs(options = {}) {
  const { executor, readHeartbeat, onEvent } = options;
  if (typeof executor !== "function") throw new TypeError("executor must be a function");
  if (typeof readHeartbeat !== "function") throw new TypeError("readHeartbeat must be a function");

  const bounded = (value, min, max, fallback) =>
    Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  const timeoutMs = bounded(options.timeoutMs, 200, 120000, DEFAULTS.timeoutMs);
  const pollMs = bounded(options.pollMs, 10, timeoutMs, DEFAULTS.pollMs);
  const maxHistory = Math.floor(bounded(options.maxHistory, 1, 200, DEFAULTS.maxHistory));
  const now = typeof options.now === "function" ? options.now : () => Date.now();

  const jobs = new Map();
  const timers = new Set();
  const wakers = new Set();
  let activeId = null;
  let order = 0;
  let stopped = false;

  // Abortable delay; stop() resolves and clears the pending timer. Input: ms. Output: promise.
  // Side effect: tracks one timer. No rejection path.
  function delay(ms) {
    return new Promise((resolve) => {
      let timer = null;
      const wake = () => {
        if (timer !== null) { clearTimeout(timer); timers.delete(timer); timer = null; }
        wakers.delete(wake);
        resolve();
      };
      timer = setTimeout(wake, Math.max(0, ms));
      timers.add(timer);
      wakers.add(wake);
    });
  }

  // Races a promise against the shared wall-clock deadline so a slow/hanging executor or heartbeat
  // reader cannot outlive the job budget. Registers a timer/waker so stop() releases it as well.
  // Input: promise, wallDeadline (epoch ms). Output: promise resolving/rejecting within the budget.
  // Failure: rejects with a BudgetError on deadline or stop; settles with the original result/error.
  function withBudget(promise, wallDeadline) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        if (timer !== null) { clearTimeout(timer); timers.delete(timer); timer = null; }
        wakers.delete(wake);
        fn(value);
      };
      const wake = () => settle(reject, new BudgetError());
      timer = setTimeout(wake, Math.max(0, wallDeadline - Date.now()));
      timers.add(timer);
      wakers.add(wake);
      Promise.resolve(promise).then(
        (value) => settle(resolve, value),
        (error) => settle(reject, error)
      );
    });
  }

  // Public, mutation-free view of a job (contract fields, ISO timestamps).
  // Input: internal job. Output: plain object. No side effects.
  function view(job) {
    return {
      jobId: job.jobId,
      state: job.state,
      startedAt: new Date(job.startedAtMs).toISOString(),
      finishedAt: job.finishedAtMs === null ? null : new Date(job.finishedAtMs).toISOString(),
      detail: job.detail,
    };
  }

  // Notifies an optional observer without ever letting it break the job state machine.
  // Input: event name + internal job. Output: none. Side effect: calls onEvent inside try/catch.
  function emit(event, job) {
    if (typeof onEvent !== "function") return;
    try { onEvent(event, view(job)); } catch { /* observer failures are isolated */ }
  }

  // Removes the oldest terminal jobs beyond maxHistory; active/queued jobs are never pruned.
  // Input: none. Output: none. Side effect: deletes entries from the jobs map.
  function prune() {
    const terminal = [...jobs.values()].filter((j) => j.state === "succeeded" || j.state === "failed");
    if (terminal.length <= maxHistory) return;
    terminal.sort((a, b) => a.order - b.order);
    for (const job of terminal.slice(0, terminal.length - maxHistory)) jobs.delete(job.jobId);
  }

  // Marks a job terminal, frees the active slot, prunes history and resolves waiters.
  // Input: internal job, final state, readable detail. Output: none. Side effects: state + emit.
  function finish(job, state, detail) {
    job.finishedAtMs = now();
    job.state = state;
    job.detail = detail;
    if (activeId === job.jobId) activeId = null;
    prune();
    emit(state, job);
    job.resolve(view(job));
  }

  // Moves a job to running. Input: internal job. Output: none. Side effect: state + emit.
  function startRun(job) {
    job.state = "running";
    job.detail = "Restart command in progress.";
    emit("running", job);
  }

  // Runs the injected command once, then confirms a NEW process heartbeat inside the bounded window.
  // Input: internal job. Output: resolves when terminal. Side effects: executor + heartbeat reads.
  // Failure: any error/timeout/stop finishes the job with a safe detail; no raw message is logged.
  async function run(job) {
    startRun(job);
    const wallDeadline = Date.now() + timeoutMs;
    const lowerBoundMs = job.startedAtMs;

    // Capture the pre-restart process marker first. Without a baseline, success cannot be proven.
    let baseline;
    try {
      baseline = await withBudget(readHeartbeat(), wallDeadline);
    } catch { /* unavailable baseline: still restart, but a new process cannot be confirmed */ }
    if (stopped) { finish(job, "failed", STOPPED_DETAIL); return; }
    const baselineMarker = heartbeatProcessMarker(baseline);

    // Exactly one fixed command; bounded by the same wall deadline, so a hang cannot hold the slot.
    try {
      await withBudget(executor(), wallDeadline);
    } catch (error) {
      if (stopped) { finish(job, "failed", STOPPED_DETAIL); return; }
      if (error instanceof BudgetError) { finish(job, "failed", timeoutDetail(timeoutMs)); return; }
      finish(job, "failed", safeExecutorDetail(error));
      return;
    }
    if (stopped) { finish(job, "failed", STOPPED_DETAIL); return; }

    if (baselineMarker === null) {
      finish(job, "failed", NO_BASELINE_DETAIL);
      return;
    }

    const maxChecks = Math.max(2, Math.ceil(timeoutMs / pollMs) + 1);
    let checks = 0;
    while (checks < maxChecks && !stopped && Date.now() < wallDeadline) {
      checks += 1;
      let result = null;
      try {
        result = await withBudget(readHeartbeat(), wallDeadline);
      } catch (error) {
        if (stopped || error instanceof BudgetError) break;
        // A transient read failure is not fatal; keep probing within the bounded window.
      }
      if (stopped) break;
      if (provesNewProcess(result, baselineMarker, lowerBoundMs)) {
        finish(job, "succeeded", SUCCESS_DETAIL);
        return;
      }
      const remaining = wallDeadline - Date.now();
      if (remaining <= 0) break;
      await delay(Math.min(pollMs, remaining));
    }

    if (stopped) { finish(job, "failed", STOPPED_DETAIL); return; }
    finish(job, "failed", timeoutDetail(timeoutMs));
  }

  // Accepts one job at a time; a second request while active is a conflict, never a second command.
  // Input: none. Output: { job, conflict, unavailable }. Side effect: starts an async, unawaited run.
  function enqueue() {
    if (stopped) return { job: null, conflict: false, unavailable: true };
    if (activeId !== null) {
      const active = jobs.get(activeId);
      return { job: active ? view(active) : null, conflict: true };
    }

    let resolve;
    const done = new Promise((r) => { resolve = r; });
    const job = {
      jobId: crypto.randomUUID(),
      state: "queued",
      startedAtMs: now(),
      finishedAtMs: null,
      detail: "Restart queued.",
      order: ++order,
      resolve,
      done,
    };
    jobs.set(job.jobId, job);
    activeId = job.jobId;
    emit("queued", job);
    // Snapshot the queued view before run() flips state to running, so the 202 body is truthful.
    const result = { job: view(job), conflict: false };
    // HTTP responses never block on the process manager or the heartbeat window.
    run(job).catch(() => {
      if (job.state === "queued" || job.state === "running") {
        finish(job, "failed", "Restart job failed unexpectedly.");
      }
    });
    return result;
  }

  // Reads a job by id. Input: jobId. Output: view or null. Side effects: none.
  function get(jobId) {
    const job = jobs.get(String(jobId));
    return job ? view(job) : null;
  }

  // Resolves with the terminal view of a job. Input: jobId. Output: promise. Side effects: none.
  function waitFor(jobId) {
    const job = jobs.get(String(jobId));
    return job ? job.done : Promise.resolve(null);
  }

  // Reports queue occupancy. Input: none. Output: { total, active }. Side effects: none.
  function count() {
    return { total: jobs.size, active: activeId ? 1 : 0 };
  }

  // Cancels pending timers and blocks new jobs during shutdown. Input: none. Output: none.
  function stop() {
    stopped = true;
    for (const wake of [...wakers]) wake();
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  }

  return { enqueue, get, waitFor, count, stop };
}

module.exports = { createRestartJobs, toMs, heartbeatTime, heartbeatProcessMarker, provesNewProcess };
