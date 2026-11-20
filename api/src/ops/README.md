# api/src/ops — local observability (WP8)

Dependency-free modules wired from `../api.js`. No external calls, no live webhook by default.

| Module | Purpose |
| --- | --- |
| `metrics.js` | Low-cardinality Prometheus registry. Label **keys** and status/result values are allowlisted; route/id/UUID values are normalised. A per-metric series cap rejects cardinality explosions. |
| `signals.js` | Structured JSON operational signals (`{ts,level,event,...}`). Redacts token/secret/password/hash/user-id/guild-id fields and token-shaped values; optional bounded `recent()` buffer. |
| `alerting.js` | Bounded per-subject state: alert fires **once** per incident, recovery **once** on return. Delivery is off unless an operator supplies an allowlisted provider (`webhook`) with an https URL. Configured URLs with userinfo (`user:pass@host`) are refused and redirects are never followed (`redirect: "error"`). `createWebhookDeliverer` takes an injectable `fetchImpl`. |
| `access.js` | Guards `GET /metrics`: admin session **only**, otherwise 403 `FORBIDDEN`. req.ip, the socket peer and proxy headers are never credentials; there is no private-network bypass or opt-out. |

## Configuration (all optional; delivery off by default)

- `ALERT_WEBHOOK_PROVIDER` — must be `webhook` (only allowlisted value).
- `ALERT_WEBHOOK_URL` — https URL with no userinfo (`user:pass@host` is rejected); redirects are not followed. Never logged. Ignored unless the provider is set.
- `ALERT_OFFLINE_GRACE_MS` — debounce before an alert (default `0`).
- `ALERT_POLL_MS` — heartbeat probe interval (default `30000`, min `5000`).

Bot-offline detection reads `bot_heartbeat.updated_at` in `start()` and feeds `alerting.observe("bot", fresh)`.

## For other packages

`buildApp()` exposes the singletons on `app.locals` (`metrics`, `signals`, `alerting`). Use
`app.locals.metrics.inc("ruckus_command_total", {command, result})`,
`observe("ruckus_command_duration_seconds", ...)`, or `.inc("ruckus_log_queue_dropped_total")`.
Never pass user/guild ids, usernames, tokens or raw message text as labels or signal fields.

## Verification

`node --test api/src/ops/*.test.js` (26 tests: once-only alert/recovery, delivery failure boundaries,
webhook userinfo/redirect refusal, allowlisted metrics, redaction, and the admin-only `/metrics` access
guard including a non-admin behind private-proxy transport). No network, DB or credentials needed.
