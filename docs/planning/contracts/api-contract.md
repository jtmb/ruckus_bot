# API contract

Owner: `implementer-api`. Scope: the Express service in `api/` (mounted at `http://api:3003`
inside the compose network; never published publicly by default).

Base rules:

- All routes except `POST /auth/login`, `GET /health` and `GET /ready` require a valid session.
- All responses are JSON with `Content-Type: application/json`, except `GET /metrics` (text/plain).
- Errors use `{ "error": { "code": "STRING_CODE", "message": "Human readable", "requestId": "uuid" } }`.
- Every request gets a `requestId` (header `X-Request-Id` if supplied and well-formed, otherwise generated)
  echoed in the response header and included in the server log.
- Request bodies are limited to 64 KB. Unknown body fields are ignored, not rejected.
- All pagination parameters are validated (see §5).

## 1. Authentication and roles

| Role | Capabilities |
| --- | --- |
| `viewer` | read status, read logs, read guild list |
| `operator` | viewer + restart bot, prune logs |
| `admin` | operator + user management, settings, delete logs |

Session mechanics are defined in `session-contract.md`.

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| POST | `/auth/login` | anonymous, rate limited | 200 + `Set-Cookie: sid=…; HttpOnly; SameSite=Lax` |
| POST | `/auth/logout` | any session | 204, session revoked server-side |
| GET | `/auth/me` | any session | `{id, username, role, csrfToken}` — never a hash |
| POST | `/auth/change-password` | any session | requires current password; revokes other sessions |

## 2. Status and health

| Method | Path | Roles | Response |
| --- | --- | --- | --- |
| GET | `/health` | anonymous | `200 {status:"ok", uptimeSeconds, version}`; no database access |
| GET | `/ready` | anonymous | `200` when the pool answers `SELECT 1`, else `503 {status:"not_ready", reason}` |
| GET | `/bot/status` | viewer | `{online, botName, botId, lastHeartbeatAt, heartbeatAgeSeconds, uptimeSeconds, latencyMs, guildCount, guilds:[{id,name,memberCount,channelCount,lastActivityAt}]}` |

`online` is computed server-side: a heartbeat younger than 90 s. A bot process that crashed leaves a stale
heartbeat and therefore reports offline. `lastHeartbeatAt` must be a UTC ISO-8601 string.

`GET /bot/login_count` and `GET /bot/count` keep their shapes (`{totalCount}`) for compatibility.

## 3. Bot logs

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/bot/logs` | viewer | filters + paging; `X-Total-Count` |
| GET | `/bot/logs/:id` | viewer | 404 when missing |
| POST | `/bot/logs` | admin | internal use; validates `event_type` |
| PUT | `/bot/logs/:id` | admin | full replace of editable fields |
| DELETE | `/bot/logs/:id` | admin | 404 when missing |
| GET | `/bot/logins` | viewer | `event_type='bot_login'`, newest first |
| GET | `/bot/interactions` | viewer | `event_type='user_interaction'`, newest first |

Supported query parameters (all optional, combined with AND):

| Parameter | Type | Default | Validation |
| --- | --- | --- | --- |
| `offset` | integer | 0 | `0 <= offset <= 1,000,000`; else 400 |
| `limit` | integer | 10 | `1 <= limit <= 100`; else 400 |
| `event_type` | enum | — | `bot_login`, `user_interaction`, `bot_response`, `error`, `command` |
| `guild_id` | snowflake string | — | 1–32 digits |
| `user_id` | snowflake string | — | 1–32 digits |
| `from` / `to` | ISO-8601 | — | `from <= to` |
| `q` | string | — | max 100 chars, matched against indexed fields only |

Ordering is `timestamp DESC, id DESC` for every list route. Deterministic paging is required by `FIX-018`;
`FIX-035` defines the retention window that keeps these queries cheap.

## 4. Restart

| Method | Path | Roles | Behaviour |
| --- | --- | --- | --- |
| POST | `/bot/restart` | operator | `202 {jobId, state:"queued"}` |
| GET | `/bot/restart/:jobId` | operator | `{jobId, state:"queued"\|"running"\|"succeeded"\|"failed", startedAt, finishedAt, detail}` |

- The restart is executed asynchronously; the HTTP request never blocks on the process manager.
- Exactly one restart job may be active; a second request returns `409 RESTART_IN_PROGRESS`.
- Success requires a fresh process heartbeat within 20 s; otherwise the job fails with a readable detail.
- Only a fixed, configured command may be executed. No request data reaches the shell (no `exec` with
  interpolation, no user-supplied command names).
- `REG-011` is satisfied by job state, not by an HTTP 200 that may be untrue.

## 5. Users

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/users` | admin | `[{id, username, role, disabled, createdAt}]`, no hashes |
| GET | `/users/:id` | admin | 404 when missing |
| POST | `/users` | admin, or anonymous **only** during first-run bootstrap | `{username, password, role}` |
| PUT | `/users/:id` | admin | role/disabled changes; cannot demote the last admin |
| POST | `/users/:id/password` | admin or self | hashes with cost 12; revokes target sessions |
| DELETE | `/users/:id` | admin | cannot delete the last admin or self |

Validation (all return `400 VALIDATION_ERROR` with a field name):

| Field | Rule |
| --- | --- |
| `username` | 3–32 chars, `[a-z0-9._-]`, unique, case-insensitive compare |
| `password` | 12–200 chars, not equal to username, not in the top-1000 common list |
| `role` | one of `admin`, `operator`, `viewer` |

First-run bootstrap: `POST /users` is accepted without a session **only** when zero accounts exist. After
the first account, the route requires an admin session (`FIX-004`, `SEC-001`).

## 6. Settings

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/guilds` | viewer | configured guilds and their settings summary |
| GET | `/guilds/:id/settings` | viewer | full settings |
| PUT | `/guilds/:id/settings` | admin | validated, audited |

## 7. Metrics and operations

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/metrics` | admin session required (403 otherwise); Prometheus text: `ruckus_http_requests_total{route,status}`, `ruckus_command_total{command,result}`, `ruckus_command_duration_seconds` histogram, `ruckus_db_errors_total`, `ruckus_log_queue_dropped_total` |
| POST | `/admin/prune-logs` | admin, `{olderThanDays}`; returns `{deleted}` |

`GET /metrics` requires an admin session and is not exposed by the dashboard. Client or proxy addresses are
never treated as credentials and there is no private-network bypass; this admin-only rule is a valid
contract choice recorded as `DEC-025`, not a defect to fix by loosening authorisation.

## 8. Correlation, limits and failure semantics

- Login: 5 attempts per 15 minutes per IP and per username; then `429` with `Retry-After`.
- Other mutating routes: 60 requests/minute/session.
- Database errors return `503 DATABASE_UNAVAILABLE` after one retry for reads; writes are not retried
  automatically (idempotency is the caller's contract).
- A request that times out on the database is cancelled and logged with the `requestId`.
- CORS: only the configured dashboard origin is allowed; credentials enabled; `X-Total-Count` exposed
  through the middleware registered **before** the routers (`FIX-019`).
- `HEAD` on `GET` routes returns the same headers with an empty body.
- No route may return a password, hash, session id or secret in a body, header or log.

## 9. Compatibility

`REG-013` requires the existing paths to keep working for authorised callers: `/bot/logs*`,
`/bot/logins`, `/bot/interactions`, `/bot/count`, `/bot/login_count`, `/users*`, `/initialize-db`.
`/initialize-db` remains available to an admin session and is idempotent; first-run creation no longer
depends on it.
