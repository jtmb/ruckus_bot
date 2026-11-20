// Central, validated configuration. Fails fast on bad values.
function int(name, def, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return n;
}

function load(env = process.env) {
  const need = ["MYSQL_HOST", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE"];
  const missing = need.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing required environment: ${missing.join(", ")}`);
  return {
    port: int("PORT", 3003, 1, 65535),
    mysql: {
      host: env.MYSQL_HOST,
      port: int("MYSQL_PORT", 3306, 1, 65535),
      user: env.MYSQL_USER,
      password: env.MYSQL_PASSWORD,
      database: env.MYSQL_DATABASE,
    },
    corsOrigins: (env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
    sessionTtlHours: int("SESSION_TTL_HOURS", 12, 1, 24 * 30),
    logRetentionDays: int("LOG_RETENTION_DAYS", 0, 0, 3650),
    heartbeatStaleSeconds: int("HEARTBEAT_STALE_SECONDS", 90, 10, 3600),
  };
}

module.exports = { load };
