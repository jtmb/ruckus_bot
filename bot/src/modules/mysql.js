const mysql = require("mysql2");

let pool = null;
function getPool() {
  if (!pool) {
    const { load } = require("../config");
    const c = load().mysql;
    pool = mysql.createPool({ ...c, connectionLimit: 5, waitForConnections: true, queueLimit: 200 });
  }
  return pool;
}

const DDL = [
  `CREATE TABLE IF NOT EXISTS bot_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(255) NOT NULL,
    event_data TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS bot_heartbeat (
    id TINYINT PRIMARY KEY,
    bot_id VARCHAR(64) NOT NULL,
    bot_name VARCHAR(255) NOT NULL,
    guilds TEXT,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
];

function createTablesIfNotExists() {
  return Promise.all(DDL.map((sql) => getPool().promise().query(sql)))
    .then(() => console.log("Tables created or already exist."))
    .catch((e) => console.error("Error creating tables:", e.message));
}

// Logs an event. Returns a promise; the optional callback is invoked exactly once (error or success).
// Dropped events are counted instead of queued without bound.
let dropped = 0;
function logEvent(eventType, eventData, cb) {
  let settled = false;
  const done = (err, res) => {
    if (settled) return;
    settled = true;
    if (typeof cb === "function") cb(err || null, res);
  };
  return new Promise((resolve, reject) => {
    getPool().query(
      "INSERT INTO bot_logs (event_type, event_data, timestamp) VALUES (?, ?, ?)",
      [eventType, JSON.stringify(eventData), new Date()],
      (error, results) => {
        if (error) {
          dropped += 1;
          console.error(`Error inserting log (dropped=${dropped}):`, error.message);
          done(error);
          return reject(error);
        }
        done(null, results);
        resolve(results);
      }
    );
  }).catch(() => undefined); // never an unhandled rejection from fire-and-forget callers
}

function writeHeartbeat(client, startedAt) {
  const guilds = JSON.stringify(client.guilds.cache.map((g) => ({ id: g.id, name: g.name })));
  return getPool().promise().query(
    `INSERT INTO bot_heartbeat (id, bot_id, bot_name, guilds, started_at, updated_at) VALUES (1, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE bot_id = VALUES(bot_id), bot_name = VALUES(bot_name), guilds = VALUES(guilds), started_at = VALUES(started_at), updated_at = NOW()`,
    [client.user.id, client.user.username, guilds, startedAt]
  );
}

module.exports = { logEvent, createTablesIfNotExists, writeHeartbeat, getPool, droppedCount: () => dropped };
