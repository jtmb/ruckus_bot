# Data model and lifecycle

Owner: `implementer-api` (schema) with `implementer-bot` (event payloads). Database: MySQL 8.4 LTS,
`utf8mb4` / `utf8mb4_0900_ai_ci`.

## 1. Tables

### `schema_migrations`

| Column | Type | Notes |
| --- | --- | --- |
| `version` | `VARCHAR(64)` PK | file stem, e.g. `0003_sessions` |
| `checksum` | `CHAR(64)` | SHA-256 of the applied file, detects edited migrations |
| `applied_at` | `TIMESTAMP` | UTC |

Forward-only. A changed checksum for an applied version aborts startup with the file name.

### `bot_logs`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED AUTO_INCREMENT` PK | |
| `event_type` | `VARCHAR(64)` | indexed; enum enforced in code |
| `event_data` | `JSON` | payload; replaces the stringified TEXT column |
| `guild_id` | `VARCHAR(32) NULL` | indexed |
| `user_id` | `VARCHAR(32) NULL` | indexed |
| `request_id` | `CHAR(36) NULL` | correlates API and bot events |
| `timestamp` | `TIMESTAMP(3)` | default current UTC, indexed |

Indexes: `(event_type, timestamp)`, `(guild_id, timestamp)`, `(user_id, timestamp)`, `(timestamp)`.
Retention (`DEC-016`): interaction rows 30 days, aggregate rows 180 days, errors 90 days; pruned by a
scheduled job with a hard delete count in bursts of 5,000.

### `credentials`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `INT UNSIGNED AUTO_INCREMENT` PK | |
| `username` | `VARCHAR(32)` | unique, stored lower-cased |
| `password_hash` | `VARCHAR(255)` | bcrypt cost 12; column renamed from `password` so a leaked query cannot be confused with plaintext |
| `role` | `ENUM('admin','operator','viewer')` | |
| `disabled` | `TINYINT(1)` | default 0 |
| `created_at`, `updated_at` | `TIMESTAMP` | |
| `last_login_at` | `TIMESTAMP NULL` | |

Invariant: at least one enabled `admin` must exist at all times (enforced in the route transaction).

### `sessions`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `CHAR(64)` PK | random 32 bytes, hex; never the raw cookie value |
| `credential_id` | `INT UNSIGNED` FK | cascade delete |
| `created_at` | `TIMESTAMP` | |
| `expires_at` | `TIMESTAMP` | absolute, default 12 h |
| `last_seen_at` | `TIMESTAMP` | idle timeout 2 h |
| `ip_hash`, `user_agent` | `VARBINARY(64)` / `VARCHAR(255)` | truncated, for audit only |

Index: `(credential_id)`, `(expires_at)`.

### `bot_heartbeat`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `TINYINT` PK, always 1 | single-row upsert |
| `bot_id`, `bot_name` | `VARCHAR` | |
| `started_at` | `TIMESTAMP` | process start |
| `heartbeat_at` | `TIMESTAMP(3)` | updated every 30 s |
| `latency_ms` | `INT` | gateway ping |
| `guilds` | `JSON` | `[{id,name,memberCount,channelCount}]` |
| `session_id` | `CHAR(36)` | restart job correlation |

The bot writes the first heartbeat on `clientReady` and every 30 s afterwards. The API computes
`online = now - heartbeat_at < 90 s` (`REG-010`, `FEAT-001`).

### `guild_settings`

| Column | Type | Notes |
| --- | --- | --- |
| `guild_id` | `VARCHAR(32)` PK | |
| `prefix` | `VARCHAR(8)` | default `!` |
| `disabled_features` | `JSON` | array of registry ids |
| `quiet_channels` | `JSON` | channel ids where only explicit commands run |
| `units` | `ENUM('metric','imperial')` | weather |
| `owner_user_id` | `VARCHAR(32) NULL` | easter egg target per guild |
| `updated_at` | `TIMESTAMP` | |

### `quotes`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `INT UNSIGNED` PK | |
| `text` | `VARCHAR(500)` | unique |
| `category` | `VARCHAR(32)` | default `general` |
| `added_by` | `VARCHAR(32)` | |
| `created_at` | `TIMESTAMP` | |

Seeded from `bot/src/modules/ruckus_quotes.txt` by migration `0005`; the file stays the source for a fresh
seed and the database becomes authoritative afterwards (`FEAT-010`).

## 2. Migration sequence

| Version | Change |
| --- | --- |
| `0001_baseline` | `bot_logs`, `credentials` with current column names, preserved data |
| `0002_indexes` | log indexes, `credentials.username` unique |
| `0003_sessions` | `sessions` table |
| `0004_heartbeat` | `bot_heartbeat` single row |
| `0005_quotes` | `quotes` + seed from file if empty |
| `0006_guild_settings` | `guild_settings` |
| `0007_password_column` | rename `password` → `password_hash`, widen to 255 |
| `0008_logs_json` | `event_data` → JSON with a validated conversion, add `guild_id`, `user_id`, `request_id` |

Migration rules:

- Each file is a single SQL transaction where MySQL allows DDL transactions; otherwise the file must be
  written as resumable steps and documented as such.
- Migrations never destroy a column in the same release that stops reading it (two-step deprecation).
- `0001` detects an existing pre-migration schema (as created by the current `initialize-db`) and adopts it
  instead of failing, so an existing deployment can upgrade without a dump (`ASM-003`).
- `config/schema.sql` is deleted once `0001` exists, or rewritten as a pointer to the migration directory.

## 3. Identifiers and units

- Discord ids are strings, never numbers (snowflakes exceed safe integer range).
- All timestamps are stored UTC; the API returns ISO-8601 with `Z`.
- Durations are seconds unless a field name says `_ms`.
- `event_data` is JSON; free-text message content is stored only when
  `LOG_MESSAGE_CONTENT=true` (default `false`, `SEC-008`).

## 4. Event types

| `event_type` | Producer | Payload |
| --- | --- | --- |
| `bot_login` | bot | `{botId, botName, guilds:[{id,name}], startupMs}` |
| `bot_ready` | bot | `{botId, latencyMs, guildCount}` — replaces the duplicate login write (`FIX-010`) |
| `user_interaction` | bot | `{userId, username, channelId, guildId, command, contentLength}` |
| `bot_response` | bot | `{command, outcome: 'ok'|'error', durationMs, errorCode?}` |
| `api_request` | api | `{route, status, durationMs, requestId}` |
| `error` | api, bot | `{scope, code, message, requestId?}` — never secrets |

`content` is not part of the payload unless explicitly enabled. `REG-013` keeps reading existing rows.

## 5. Concurrency and failure rules

- The heartbeat is an `INSERT … ON DUPLICATE KEY UPDATE`; no read-modify-write race.
- Log inserts go through a bounded in-memory queue (max 1,000). On overflow the oldest is dropped and
  `ruckus_log_queue_dropped_total` increments; the bot never blocks on logging (`FIX-035`).
- Restart jobs use a row with a state machine (`queued → running → succeeded|failed`) and a unique partial
  index on the active state, so two operators cannot start two restarts.
- User creation/deletion/last-admin checks run in one transaction with `SELECT … FOR UPDATE` on the
  credential row set.
- Session deletion is idempotent; a missing session is not an error.

## 6. Backup, restore and retention

- Backup: `mysqldump --single-transaction --routines --triggers`, gzip, checksum, retention 14 daily +
  8 weekly (`FEAT-013`, `OPS-005`).
- Restore drill: restore into a scratch database, run `SELECT COUNT(*)` on each table, start the API
  against it and load `/bot/status`. Record the result in `docs/planning/evidence/`.
- Deleting a user cascades sessions and keeps log rows but replaces `user_id` with `NULL` where required by
  the retention policy; the privacy statement must match this behaviour (`SEC-008`).
