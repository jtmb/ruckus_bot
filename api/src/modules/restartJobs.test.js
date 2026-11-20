// restartJobs.test.js — focused, dependency-free checks for the bounded restart queue (REG-011).
// Uses injected heartbeat readers/executors and short real budgets: no DB, supervisor or network.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createRestartJobs, toMs, heartbeatTime, heartbeatProcessMarker, provesNewProcess,
} = require("./restartJobs");

// Builds a deterministic queue. Input: overrides. Output: { queue, events }.
// Side effects: none outside memory; budgets are short so hanging providers stay bounded.
function build(overrides = {}) {
  const events = [];
  const queue = createRestartJobs({
    executor: overrides.executor || (async () => {}),
    readHeartbeat: overrides.readHeartbeat || newProcessProvider(),
    onEvent: (event, job) => events.push({ event, state: job.state, detail: job.detail }),
    pollMs: overrides.pollMs ?? 30,
    timeoutMs: overrides.timeoutMs ?? 400,
    maxHistory: overrides.maxHistory ?? 20,
  });
  return { queue, events };
}

// Provider whose process marker advances after the baseline read (a genuine new process).
// Input: none. Output: async provider returning { startedAt, updatedAt }. Side effects: call count.
function newProcessProvider() {
  let calls = 0;
  const oldStart = Date.now() - 60000;
  return async () => {
    calls += 1;
    const startedAt = calls === 1 ? new Date(oldStart) : new Date(Date.now() + calls * 1000);
    return { startedAt, updatedAt: new Date(Date.now()) };
  };
}

// Provider that keeps the SAME old process marker but ticks updated_at (stale-process fresh tick).
// Input: none. Output: async provider returning a fresh updatedAt and unchanged startedAt.
function staleProcessProvider() {
  const startedAt = new Date(Date.now() - 60000);
  return async () => ({ startedAt, updatedAt: new Date(Date.now() + 5000) });
}

test("enqueue is queued/202 and a second request conflicts while one is active", async () => {
  let execCalls = 0;
  const { queue } = build({ executor: () => { execCalls += 1; return new Promise(() => {}); } });
  const first = queue.enqueue();
  assert.equal(first.conflict, false);
  assert.equal(first.job.state, "queued");
  assert.match(first.job.jobId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(first.job.finishedAt, null);
  const second = queue.enqueue();
  assert.equal(second.conflict, true);
  assert.equal(second.job.jobId, first.job.jobId);
  await new Promise((r) => setImmediate(r)); // let run() progress past the baseline read
  assert.equal(execCalls, 1, "no second command may launch while the first is uncertain");
  assert.equal(queue.count().active, 1);
  queue.stop();
  await queue.waitFor(first.job.jobId);
});

test("succeeds only when a NEW process marker is confirmed (REG-011)", async () => {
  const { queue, events } = build({ readHeartbeat: newProcessProvider() });
  const { job } = queue.enqueue();
  const final = await queue.waitFor(job.jobId);
  assert.equal(final.state, "succeeded");
  assert.ok(final.finishedAt);
  assert.match(final.detail, /new bot process/i);
  assert.deepEqual(events.map((e) => e.event), ["queued", "running", "succeeded"]);
});

test("a fresh updated_at from the SAME process is not proof (REG-011)", async () => {
  const { queue } = build({ readHeartbeat: staleProcessProvider() });
  const { job } = queue.enqueue();
  const final = await queue.waitFor(job.jobId);
  assert.equal(final.state, "failed");
  assert.match(final.detail, /No new bot process/i);
});

test("a process marker advanced within the same second is treated as ambiguous", async () => {
  const base = Date.now() - 60000;
  let calls = 0;
  const readHeartbeat = async () => {
    calls += 1;
    const startedAt = calls === 1 ? new Date(base) : new Date(base + 500);
    return { startedAt, updatedAt: new Date(Date.now()) };
  };
  const { queue } = build({ readHeartbeat });
  const { job } = queue.enqueue();
  const final = await queue.waitFor(job.jobId);
  assert.equal(final.state, "failed", "same-second ambiguity must not be claimed as a new process");
});

test("a missing heartbeat provider fails without claiming success", async () => {
  const { queue } = build({ readHeartbeat: async () => null });
  const { job } = queue.enqueue();
  const final = await queue.waitFor(job.jobId);
  assert.equal(final.state, "failed");
  assert.match(final.detail, /baseline|confirm/i);
});

test("a slow heartbeat reader is bounded by the job budget", async () => {
  const startedAt = new Date(Date.now() - 60000);
  let calls = 0;
  const readHeartbeat = async () => {
    calls += 1;
    return calls === 1 ? { startedAt } : new Promise(() => {});
  };
  const t0 = Date.now();
  const { queue } = build({ readHeartbeat, timeoutMs: 300, pollMs: 30 });
  const { job } = queue.enqueue();
  const final = await queue.waitFor(job.jobId);
  const elapsed = Date.now() - t0;
  assert.equal(final.state, "failed");
  assert.ok(elapsed >= 250, `expected a budget-bounded wait, got ${elapsed}ms`);
  assert.ok(elapsed < 2000, `a hanging reader must not hang the job, got ${elapsed}ms`);
});

test("a slow executor is bounded and no second command launches while uncertain", async () => {
  let execCalls = 0;
  const executor = () => { execCalls += 1; return new Promise(() => {}); };
  const { queue } = build({ executor, readHeartbeat: newProcessProvider(), timeoutMs: 300 });
  const { job } = queue.enqueue();
  assert.equal(queue.enqueue().conflict, true);
  await new Promise((r) => setImmediate(r)); // let run() reach the executor
  assert.equal(execCalls, 1);
  const t0 = Date.now();
  const final = await queue.waitFor(job.jobId);
  assert.ok(Date.now() - t0 < 2000, "slow executor must be bounded");
  assert.equal(final.state, "failed");
  const next = queue.enqueue(); // a definite outcome frees the slot
  assert.equal(next.conflict, false);
  await new Promise((r) => setImmediate(r)); // allow the next run() to reach its executor
  assert.equal(execCalls, 2);
  queue.stop();
  await queue.waitFor(next.job.jobId);
});

test("executor errors produce safe details and never log raw messages", async () => {
  const secret = "secret path /srv/private supervisor output";
  const { queue } = build({
    executor: async () => { const e = new Error(secret); e.code = "ENOENT"; throw e; },
    readHeartbeat: async () => null,
  });
  const original = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args.join(" "));
  try {
    const { job } = queue.enqueue();
    const final = await queue.waitFor(job.jobId);
    assert.equal(final.state, "failed");
    assert.match(final.detail, /ENOENT/);
    assert.doesNotMatch(final.detail, /secret path/);
    assert.ok(!logs.some((line) => line.includes(secret)), "raw error message must not be logged");
  } finally {
    console.error = original;
  }
});

test("terminal job history is bounded and the oldest entries are pruned", async () => {
  const { queue } = build({ maxHistory: 2, readHeartbeat: newProcessProvider() });
  const ids = [];
  for (let i = 0; i < 4; i += 1) {
    const { job } = queue.enqueue();
    ids.push(job.jobId);
    await queue.waitFor(job.jobId);
  }
  assert.equal(queue.count().total, 2);
  assert.equal(queue.get(ids[0]), null);
  assert.equal(queue.get(ids[1]), null);
  assert.ok(queue.get(ids[2]));
  assert.ok(queue.get(ids[3]));
});

test("get and waitFor return null for an unknown job", async () => {
  const { queue } = build();
  assert.equal(queue.get("unknown"), null);
  assert.equal(await queue.waitFor("unknown"), null);
  queue.stop();
});

test("stop cancels pending tracking and blocks new jobs", async () => {
  const { queue } = build({
    readHeartbeat: () => new Promise(() => {}),
    timeoutMs: 60000,
    pollMs: 50000,
  });
  const { job } = queue.enqueue();
  await new Promise((r) => setImmediate(r)); // let run() reach its bounded await
  queue.stop();
  const final = await queue.waitFor(job.jobId);
  assert.equal(final.state, "failed");
  assert.match(final.detail, /tracking stopped/i);
  assert.equal(queue.enqueue().unavailable, true);
});

test("timestamp helpers normalise Date/number/string and reject invalid values", () => {
  const at = 1700000000000;
  assert.equal(toMs(new Date(at)), at);
  assert.equal(toMs(at), at);
  assert.equal(toMs(new Date(at).toISOString()), at);
  assert.equal(toMs(undefined), null);
  assert.equal(toMs("not-a-date"), null);
  assert.equal(heartbeatTime({ updatedAt: new Date(at) }), at);
  assert.equal(heartbeatTime({ at }), at);
  assert.equal(heartbeatTime(null), null);
  assert.equal(heartbeatProcessMarker({ startedAt: new Date(at) }), at);
  assert.equal(heartbeatProcessMarker({ startedAt: at }), at);
  assert.equal(heartbeatProcessMarker(null), null);
});

test("provesNewProcess enforces baseline, lower bound and same-second caution", () => {
  const t = 1700000000000;
  assert.equal(provesNewProcess({ startedAt: t + 2000 }, t, t), true);
  assert.equal(provesNewProcess({ startedAt: t }, t, t), false);            // unchanged marker
  assert.equal(provesNewProcess({ startedAt: t + 500 }, t, t), false);      // same-second ambiguity
  assert.equal(provesNewProcess({ startedAt: t + 2000 }, null, t), false);  // no baseline
  assert.equal(provesNewProcess({ startedAt: t - 5000 }, t, t), false);     // pre-request process
  assert.equal(provesNewProcess({ startedAt: t + 2000 }, t, t + 5000), false); // pre-dates lower bound
});
