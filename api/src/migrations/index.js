// Numbered, idempotent migrations. 0001 adopts a pre-migration schema (tables may already exist).
// Adoption is never silent: an existing table must actually carry the columns the code reads,
// otherwise migration aborts with SCHEMA_INCOMPATIBLE before that version is certified (ASM-003).
async function hasIndex(pool, table, name) {
  const [rows] = await pool.query(
    "SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1",
    [table, name]
  );
  return rows.length > 0;
}

// Lists the column names of a table in the active schema. Input: pool + table name.
// Output: array of column-name strings (empty when the table does not exist yet).
// Side effects: one read-only information_schema query. Failure: propagates DB errors.
async function listColumns(pool, table) {
  const [rows] = await pool.query(
    "SELECT COLUMN_NAME AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?",
    [table]
  );
  return rows.map((r) => r.name);
}

// Verifies a pre-existing table is compatible before a CREATE TABLE IF NOT EXISTS "adopts" it.
// Input: pool, table name and the columns required by the current code. Output: none.
// Side effects: none on compatible/missing tables; throws SCHEMA_INCOMPATIBLE on a live mismatch.
async function assertSchemaCompatible(pool, table, required) {
  const present = await listColumns(pool, table);
  if (present.length === 0) return; // table absent: the migration will create it
  const set = new Set(present);
  const missing = required.filter((c) => !set.has(c));
  if (missing.length) {
    const err = new Error(
      `Incompatible pre-migration schema for ${table}: missing column(s) ${missing.join(", ")}; take a dump before upgrading`
    );
    err.code = "SCHEMA_INCOMPATIBLE";
    err.table = table;
    err.missingColumns = missing;
    throw err;
  }
}

const migrations = [
  {
    id: "0001_baseline",
    async up(pool) {
      // Check the live schema before adopting/certifying any pre-migration table.
      await assertSchemaCompatible(pool, "bot_logs", ["id", "event_type", "event_data", "timestamp"]);
      await assertSchemaCompatible(pool, "credentials", ["id", "username", "password", "role"]);
      await pool.query(`CREATE TABLE IF NOT EXISTS bot_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_type VARCHAR(255) NOT NULL,
        event_data TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS credentials (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(255) NOT NULL
      )`);
    },
  },
  {
    id: "0002_sessions_and_heartbeat",
    async up(pool) {
      await assertSchemaCompatible(pool, "sessions", ["token_hash", "user_id", "created_at", "expires_at"]);
      await assertSchemaCompatible(pool, "bot_heartbeat", ["id", "bot_id", "bot_name", "guilds", "started_at", "updated_at"]);
      await pool.query(`CREATE TABLE IF NOT EXISTS sessions (
        token_hash CHAR(64) PRIMARY KEY,
        user_id INT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        INDEX idx_sessions_user (user_id),
        INDEX idx_sessions_expiry (expires_at)
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS bot_heartbeat (
        id TINYINT PRIMARY KEY,
        bot_id VARCHAR(64) NOT NULL,
        bot_name VARCHAR(255) NOT NULL,
        guilds TEXT,
        started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    },
  },
  {
    id: "0003_log_indexes",
    async up(pool) {
      if (!(await hasIndex(pool, "bot_logs", "idx_bot_logs_type_time"))) {
        await pool.query("CREATE INDEX idx_bot_logs_type_time ON bot_logs (event_type, timestamp, id)");
      }
      if (!(await hasIndex(pool, "bot_logs", "idx_bot_logs_time"))) {
        await pool.query("CREATE INDEX idx_bot_logs_time ON bot_logs (timestamp, id)");
      }
    },
  },
];

async function migrate(pool) {
  // A legacy schema_migrations with a different shape must not be certified as ours.
  await assertSchemaCompatible(pool, "schema_migrations", ["id", "applied_at"]);
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(64) PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const [done] = await pool.query("SELECT id FROM schema_migrations");
  const applied = new Set(done.map((r) => r.id));
  const ran = [];
  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    await m.up(pool);
    await pool.query("INSERT INTO schema_migrations (id) VALUES (?)", [m.id]);
    ran.push(m.id);
  }
  return ran;
}

module.exports = { migrate, migrations, assertSchemaCompatible };
