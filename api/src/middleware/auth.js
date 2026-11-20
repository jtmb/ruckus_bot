const crypto = require("crypto");
const { pool, config } = require("../db");

const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  await pool.query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, NOW() + INTERVAL ? HOUR)",
    [hash(token), userId, config.sessionTtlHours]
  );
  return token;
}

async function destroySession(token) {
  await pool.query("DELETE FROM sessions WHERE token_hash = ?", [hash(token)]);
}

function readToken(req) {
  const h = req.get("authorization") || "";
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,128})$/.exec(h);
  return m ? m[1] : null;
}

// Attaches req.user when a valid session is presented; never rejects by itself.
async function attachUser(req, _res, next) {
  const token = readToken(req);
  if (!token) return next();
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.username, c.role FROM sessions s JOIN credentials c ON c.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > NOW()`,
      [hash(token)]
    );
    if (rows[0]) {
      req.user = rows[0];
      req.sessionToken = token;
    }
    next();
  } catch (e) {
    next(e);
  }
}

const requireUser = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: "Authentication required", requestId: req.id });

const requireAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Authentication required", requestId: req.id });
  if (req.user.role !== "admin") return res.status(403).json({ error: "Administrator role required", requestId: req.id });
  next();
};

// Login throttle: 5 failures per username+ip within 15 minutes locks that pair for 15 minutes.
const failures = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const key = (u, ip) => `${String(u).toLowerCase()}|${ip}`;

function isLocked(username, ip) {
  const e = failures.get(key(username, ip));
  if (!e) return false;
  if (Date.now() - e.first > WINDOW_MS) {
    failures.delete(key(username, ip));
    return false;
  }
  return e.count >= MAX_FAILURES;
}
function recordFailure(username, ip) {
  const k = key(username, ip);
  const e = failures.get(k);
  if (!e || Date.now() - e.first > WINDOW_MS) failures.set(k, { count: 1, first: Date.now() });
  else e.count += 1;
  if (failures.size > 5000) failures.delete(failures.keys().next().value);
}
const clearFailures = (username, ip) => failures.delete(key(username, ip));

module.exports = { createSession, destroySession, attachUser, requireUser, requireAdmin, isLocked, recordFailure, clearFailures };
