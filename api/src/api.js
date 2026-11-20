// api.js
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { pool, config } = require("./db");
const { migrate } = require("./migrations");
const { attachUser } = require("./middleware/auth");
const { pruneLogs } = require("./modules/botDatabase");
const { createMetrics } = require("./ops/metrics");
const { createSignalLogger } = require("./ops/signals");
const { createAlertState, createWebhookDeliverer, readAlertConfig } = require("./ops/alerting");
const { createMetricsAccess } = require("./ops/access");

// Module-scope observability singletons: local-only by default, injectable through buildApp for tests.
const signals = createSignalLogger({ bufferSize: 100 });
const metrics = createMetrics();

// Delivery is off unless an operator explicitly configures an allowlisted provider and a URL.
function buildDelivery(cfg) {
  if (!cfg.deliveryEnabled) return null;
  try {
    return createWebhookDeliverer({ provider: cfg.provider, url: cfg.url });
  } catch (err) {
    signals.warn("alert_delivery_disabled", { code: "INVALID_CONFIG" });
    return null;
  }
}
const alertConfig = readAlertConfig(process.env);
const alerting = createAlertState({ graceMs: alertConfig.graceMs, deliverer: buildDelivery(alertConfig), signalLogger: signals });
const metricsAccess = createMetricsAccess({ signalLogger: signals });

// Detect a database-shaped error without ever logging its raw message (it may contain query data).
function isDbError(err) {
  const code = err && err.code;
  return typeof code === "string" && (code.startsWith("ER_") || ["ECONNREFUSED", "ETIMEDOUT", "PROTOCOL_CONNECTION_LOST", "EPIPE"].includes(code));
}

function buildApp(deps = {}) {
  const app = express();
  const m = deps.metrics || metrics;
  const sig = deps.signals || signals;
  const alerts = deps.alerting || alerting;
  const guard = deps.metricsAccess || metricsAccess;
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback, linklocal, uniquelocal");
  app.locals.metrics = m;
  app.locals.signals = sig;
  app.locals.alerting = alerts;

  app.use((req, res, next) => {
    req.id = crypto.randomUUID();
    res.set("X-Request-Id", req.id);
    next();
  });
  app.use(express.json({ limit: "100kb" }));

  // Same-origin by default. Only listed origins get CORS headers.
  app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : false, exposedHeaders: ["X-Total-Count", "X-Request-Id"] }));

  // Low-cardinality HTTP instrumentation: normalised route pattern + status bucket only.
  app.use((req, res, next) => {
    const started = process.hrtime.bigint();
    res.on("finish", () => {
      const route = m.normalizeRoute((req.baseUrl || "") + (req.route && req.route.path ? req.route.path : "/unmatched"));
      m.inc("ruckus_http_requests_total", { route, status: m.statusBucket(res.statusCode) });
      m.observe("ruckus_http_request_duration_seconds", { route }, Number(process.hrtime.bigint() - started) / 1e9);
    });
    next();
  });

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/ready", async (_req, res) => {
    try { await pool.query("SELECT 1"); res.json({ status: "ready" }); }
    catch (err) {
      m.inc("ruckus_db_errors_total");
      sig.error("readiness_db_unavailable", { code: isDbError(err) ? err.code : "unknown" });
      res.status(503).json({ status: "database unavailable" });
    }
  });

  app.use(attachUser);

  // FEAT-012/FEAT-014: local Prometheus text, readable by admin session or private network only.
  app.get("/metrics", guard, (_req, res) => {
    res.type("text/plain").send(m.render());
  });

  app.use("/", require("./routes/dashboardRoutes"));
  app.use("/bot", require("./routes/botRoutes"));

  app.use((req, res) => res.status(404).json({ error: "Not found", requestId: req.id }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const status = err.type === "entity.parse.failed" ? 400 : err.status || 500;
    if (status >= 500) {
      if (isDbError(err)) m.inc("ruckus_db_errors_total");
      sig.error("request_failed", { status, code: typeof err.code === "string" && /^[A-Z0-9_]{1,32}$/.test(err.code) ? err.code : "unknown" });
      console.error(`[${req.id}]`, err.message);
    }
    res.status(status).json({ error: status === 400 ? "Invalid request body" : "Internal Server Error", requestId: req.id });
  });
  return app;
}

async function start() {
  const ran = await migrate(pool);
  if (ran.length) console.log("Applied migrations:", ran.join(", "));

  const sweep = async () => {
    try {
      await pool.query("DELETE FROM sessions WHERE expires_at < NOW()");
      const n = config.logRetentionDays > 0 ? await pruneLogs(config.logRetentionDays) : 0;
      if (n) console.log(`Retention prune removed ${n} log rows`);
    } catch (e) { console.error("Maintenance sweep failed:", e.message); }
  };
  sweep();
  const timer = setInterval(sweep, 6 * 60 * 60 * 1000);
  timer.unref();

  // FEAT-012: feed bot offline/recovery into the bounded state machine from the heartbeat row.
  const alertTimer = setInterval(async () => {
    try {
      const [rows] = await pool.query("SELECT TIMESTAMPDIFF(SECOND, updated_at, NOW()) AS age_seconds FROM bot_heartbeat WHERE id = 1");
      const age = rows[0] && Number(rows[0].age_seconds);
      const fresh = Number.isFinite(age) && age <= config.heartbeatStaleSeconds;
      alerting.observe("bot", fresh, Date.now());
    } catch (err) {
      signals.error("heartbeat_probe_failed", { code: typeof err.code === "string" && /^[A-Z0-9_]{1,32}$/.test(err.code) ? err.code : "unknown" });
    }
  }, alertConfig.pollMs);
  alertTimer.unref();

  const server = buildApp().listen(config.port, "0.0.0.0", () => console.log(`Server is running on port ${config.port}`));
  const stop = () => {
    clearInterval(alertTimer);
    server.close(() => pool.end().finally(() => process.exit(0)));
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

process.on("unhandledRejection", (r) => console.error("Unhandled rejection:", r));

if (require.main === module) {
  start().catch((e) => { console.error("Startup failed:", e.message); process.exit(1); });
}

module.exports = { buildApp, metrics, signals, alerting, readAlertConfig };
