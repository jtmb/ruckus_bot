const express = require("express");
const { execFile } = require("child_process");
const router = express.Router();
const q = require("../modules/botDatabase");
const { config } = require("../db");
const { requireUser, requireAdmin } = require("../middleware/auth");
const { pagination, idParam, bad } = require("../middleware/validate");
const { createRestartJobs } = require("../modules/restartJobs");

const fail = (req, res, error, label) => {
  console.error(`[${req.id}] ${label}:`, error.message);
  res.status(500).json({ error: "Internal Server Error", requestId: req.id });
};

const listRoute = (path, list, count) =>
  router.get(path, requireUser, pagination, async (req, res) => {
    try {
      const [rows, total] = await Promise.all([list(req.page.offset, req.page.limit), count()]);
      res.set("X-Total-Count", String(total));
      res.json(rows);
    } catch (e) { fail(req, res, e, path); }
  });

listRoute("/logs", q.getAllLogs, q.getTotalLogsCountFromDatabase);
listRoute("/logins", q.getBotLoginLogs, q.getTotalLoginLogsCountFromDatabase);
listRoute("/interactions", q.getUserInteractionLogs, q.getTotalInteractionLogsCount);

router.get("/logs/:id", requireUser, idParam, async (req, res) => {
  try {
    const log = await q.getLogById(req.params.id);
    log ? res.json(log) : res.status(404).json({ error: "Log not found", requestId: req.id });
  } catch (e) { fail(req, res, e, "get-log"); }
});

const logBody = (req, res, next) => {
  const { event_type, event_data, timestamp } = req.body || {};
  if (typeof event_type !== "string" || !event_type || event_type.length > 255) return bad(res, req, "event_type is required (max 255 chars)");
  if (event_data !== undefined && event_data !== null && typeof event_data !== "string") return bad(res, req, "event_data must be a string");
  if (timestamp !== undefined && timestamp !== null && Number.isNaN(Date.parse(timestamp))) return bad(res, req, "timestamp must be a valid date");
  next();
};

router.post("/logs", requireAdmin, logBody, async (req, res) => {
  try {
    const { event_type, event_data, timestamp } = req.body;
    const result = await q.insertLog(event_type, event_data ?? null, timestamp ? new Date(timestamp) : null);
    res.status(201).json({ message: "Log inserted successfully", insertId: result.insertId });
  } catch (e) { fail(req, res, e, "insert-log"); }
});

router.put("/logs/:id", requireAdmin, idParam, logBody, async (req, res) => {
  try {
    const { event_type, event_data, timestamp } = req.body;
    const result = await q.updateLogById(req.params.id, event_type, event_data ?? null, timestamp ? new Date(timestamp) : null);
    result.affectedRows === 0 ? res.status(404).json({ error: "Log not found", requestId: req.id }) : res.json({ message: "Log updated successfully" });
  } catch (e) { fail(req, res, e, "update-log"); }
});

router.delete("/logs/:id", requireAdmin, idParam, async (req, res) => {
  try {
    const result = await q.deleteLogById(req.params.id);
    result.affectedRows === 0 ? res.status(404).json({ error: "Log not found", requestId: req.id }) : res.json({ message: "Log deleted successfully" });
  } catch (e) { fail(req, res, e, "delete-log"); }
});

router.get("/count", requireUser, async (req, res) => {
  try { res.json({ totalCount: await q.getTotalLogsCountFromDatabase() }); } catch (e) { fail(req, res, e, "count"); }
});
router.get("/login_count", requireUser, async (req, res) => {
  try { res.json({ totalCount: await q.getTotalLoginLogsCountFromDatabase() }); } catch (e) { fail(req, res, e, "login-count"); }
});

// Live status derived from the bot heartbeat: online only while the heartbeat is fresh.
router.get("/status", requireUser, async (req, res) => {
  try {
    const hb = await q.getHeartbeat();
    if (!hb) return res.json({ botName: "", isBotUp: false, guilds: [], heartbeatAgeSeconds: null });
    const online = hb.age_seconds <= config.heartbeatStaleSeconds;
    let guilds = [];
    try { guilds = JSON.parse(hb.guilds || "[]"); } catch { /* keep empty */ }
    res.json({ botName: hb.bot_name, isBotUp: online, guilds: guilds.map((g) => g.name), heartbeatAgeSeconds: hb.age_seconds, startedAt: hb.started_at });
  } catch (e) { fail(req, res, e, "status"); }
});

// WP8 restart: a single bounded queue behind the existing admin boundary. The executor holds the
// one fixed supervisorctl command; no request data is ever interpolated into it (API contract §4).
const RESTART_COMMAND = "supervisorctl";
const RESTART_ARGS = ["restart", "bot_run"];
const restartJobs = createRestartJobs({
  // execFile's own 15 s timeout kills the child before the job's 20 s wall-clock budget expires,
  // so a timed-out job never frees the single slot while a supervisorctl child is still running.
  executor: () => new Promise((resolve, reject) => {
    execFile(RESTART_COMMAND, RESTART_ARGS, { timeout: 15000 }, (error) => {
      if (error) return reject(error);
      resolve();
    });
  }),
  readHeartbeat: async () => {
    const hb = await q.getHeartbeat();
    // startedAt is the process marker (bot_heartbeat.started_at); a fresh updatedAt alone is not proof.
    return hb ? { updatedAt: hb.updated_at, startedAt: hb.started_at } : null;
  },
});

// Queues a restart without blocking on the process manager: 202, or 409 while one is active.
router.post("/restart", requireAdmin, (req, res) => {
  const { job, conflict, unavailable } = restartJobs.enqueue();
  if (unavailable) {
    return res.status(503).json({ error: "Restart service unavailable", message: "Restart service is shutting down.", requestId: req.id });
  }
  if (conflict) {
    return res.status(409).json({ error: "RESTART_IN_PROGRESS", message: "A restart is already in progress.", requestId: req.id });
  }
  res.status(202).json({ jobId: job.jobId, state: job.state });
});

// Reads the bounded state of one job so the UI can show a definite pending/success/failure.
router.get("/restart/:jobId", requireAdmin, (req, res) => {
  const job = restartJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "NOT_FOUND", message: "Unknown restart job.", requestId: req.id });
  res.json(job);
});

module.exports = router;
