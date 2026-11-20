# Changelog

## 1.1.0 — 2026-11-17

All existing commands, replies, dashboard pages and endpoints are preserved. Changes are fixes and additions only.

### Security
- Every API route except `/health` and `/ready` now requires a server-side session; user management, log mutation and bot restart require the admin role. Previously anonymous callers could create admins, read/alter logs and restart the bot.
- Password hashes are never returned (`/users/authenticate` previously returned the stored bcrypt hash).
- Sessions are random 256-bit tokens stored hashed; the dashboard keeps the token in an HttpOnly, SameSite=Strict cookie instead of `localStorage`.
- Login throttling (5 failures / 15 minutes), same-origin checks on state-changing dashboard routes, CORS allow-list (`CORS_ORIGINS`), request ids, JSON body limit, validation on every body/query.
- First account is created through a transactional first-run bootstrap; later accounts need an admin. The forced `admin` role for every new account is gone.
- Removed credential/user logging from the API; `supervisorctl` is invoked without a shell.
- Dependencies pinned to supported versions: Node 26.13.1, Next 16.4.6, React 19.3.1, Express 4.22.3, mysql2 3.24.6, bcrypt 6.0.0, discord.js 14.28.1. `npm audit --omit=dev` reports 0 vulnerabilities in api, bot and dashboard (baseline: 5 critical, 16 high).

### Fixes
- Dashboard status is live (heartbeat-derived, polls every 15 s) instead of a build-time snapshot; offline within 90 s of the bot stopping.
- `/api/check-admin` called a non-existent path; fixed.
- `MYSQL_PORT` is honoured by API and bot; `bot_logs` is created by migration, not only by the bot.
- Log lists are ordered newest-first with a stable tie-break; `limit`/`offset` are validated (400) and clamped; totals are returned in `X-Total-Count` for all three list routes.
- `!flipacoin` no longer falls through to other handlers; n-chain never sends an empty message and tracks state per channel with expiry; handlers return consistent booleans.
- `!weather in CITY` and `!weather CITY` now work, as documented; city names are URL-encoded; failure replies never contain `undefined`.
- Profanity list is cached (6 h) with last-known-good; a failed fetch no longer matches every message; per-channel reply cooldown.
- `!freegames` sends one message with up to 10 embeds inside Discord's size limits.
- Replied-message cache is bounded (TTL 10 min, 5,000 entries). All sends are awaited and errors logged. Single ready handler. Discord login failure is reported and exits instead of crashing with an unhandled rejection.
- `logEvent` returns a promise and calls its callback exactly once.
- Removed committed `node_modules` from Git (5,290 files), added `.gitignore`/`.dockerignore`, lockfile-based `npm ci` image builds, healthcheck, hermetic dashboard build.
- Removed the plaintext `changeme` seed user from `config/schema.sql`; readme compose example is valid YAML.

### Added
- Numbered, idempotent migrations (adopts existing databases), `sessions` and `bot_heartbeat` tables, log indexes, optional retention (`LOG_RETENTION_DAYS`, off by default).
- `/health`, `/ready`, `/bot/status`, `/auth/*` endpoints; dashboard User Management page (list/create/delete) replacing the placeholder alert.
- `scripts/verify.sh`.
