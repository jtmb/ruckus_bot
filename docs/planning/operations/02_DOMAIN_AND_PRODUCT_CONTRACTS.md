# 02 — Domain and product contracts

This document defines the behaviour the implementation must produce. Detailed field-level rules live in
the contracts under `docs/planning/contracts/`; requirement IDs resolve in `data/requirements.json`.

| Area | Authoritative contract |
| --- | --- |
| Bot commands, dispatch, dedupe, chain state, provider fallbacks | [`../contracts/command-contract.md`](../contracts/command-contract.md) |
| HTTP routes, roles, paging, errors, restart jobs, metrics | [`../contracts/api-contract.md`](../contracts/api-contract.md) |
| Tables, migrations, indexes, event payloads, retention, backups | [`../contracts/data-model.md`](../contracts/data-model.md) |
| Login, cookie, CSRF, roles, bootstrap, lockout | [`../contracts/session-contract.md`](../contracts/session-contract.md) |

## 1. End-to-end workflows

### W1 — Guild member uses a command

1. Message arrives with the required intents approved.
2. Dispatcher filters bots, resolves guild settings, applies quiet mode.
3. Explicit command matched from the registry; duplicate message id exits.
4. Handler validates arguments, calls a provider through the cached client, and returns `true`.
5. Exactly one reply is sent; the interaction and response events are queued for logging.
6. If the provider fails, the user receives one readable failure line and the error event is logged.

Failure/cancel behaviour: a user deleting the message mid-flight does not break the pipeline; a failed
send is logged once; a cooldown hit answers with the remaining time and does not reach the provider.

### W2 — Member mentions the bot

Mention without a recognised command → one random quote (REG-001). Mention with `weather in X`,
`free games` or `tell me a joke` → that command only, never also a quote (FIX-012, FIX-014, FIX-025).

### W3 — Operator monitors the bot

Dashboard loads → server-side session check → status card with bot name, online state, uptime, latency,
guild list and last heartbeat age. Data refreshes every 15 s (polling or SSE). A stale heartbeat (> 90 s)
renders offline with the age, not a generic icon. Errors render an inline retry banner, never an empty page.

### W4 — Operator investigates activity

Log explorer → filters (type, guild, user, date, text) → deterministic newest-first paging with totals →
CSV export of the current filter. Empty result renders an empty state, not "0 rows" error.

### W5 — Operator restarts the bot

Restart button → confirmation → `POST /bot/restart` → `202` + job id → UI polls job state → success within
20 s or a readable failure detail. A second click while a job is active is rejected with a message.

### W6 — Administrator manages accounts

First run: create the first admin (no session required, only while zero accounts exist). Afterwards:
user list → create user with role → role change → disable → delete, each with server-side validation,
last-admin protection and audit entry. Self-demotion and self-deletion are refused with an explanation.

### W7 — Maintainer adds a command

Register metadata → implement handler against the context → add fixtures → registry updates help and slash
registration → tests → docs. Removing a command requires a decision record, because help and users depend on
the registry.

### W8 — Recovery after an outage

Host restarts → database container becomes healthy → API readiness reports ready → bot writes a heartbeat →
dashboard shows online. If the bot cannot authenticate, the operator sees an offline card plus the last
error event and follows the runbook in `06_SECURITY_AND_OPERATIONS.md` §8.

## 2. Domain entities and invariants

| Entity | Identity | Invariants |
| --- | --- | --- |
| Guild | Discord guild id (string) | Settings row optional; defaults apply without one |
| Member | Discord user id (string) | Never trusted for authorisation |
| Account | `credentials.id` | Unique username (case-insensitive); ≥ 1 enabled admin; hash never leaves the API |
| Session | hashed token | Bound to one account; absolute 12 h, idle 2 h; revoked on logout/password/role change |
| Log event | `bot_logs.id` | Append-only through the API except admin delete; UTC timestamps; content only when enabled |
| Heartbeat | single row | One active bot process; `online` derived, never stored as a flag |
| Restart job | `jobId` | One active job; terminal states immutable |
| Command | registry id | One trigger set; help derived; cooldown defined |

## 3. State machines

### 3.1 Restart job

```
queued ──> running ──> succeeded
   │           └────> failed
   └── (expired 60 s) ──> failed
```

Transitions are written with a conditional update (`WHERE state='queued'`), so concurrent operators cannot
both start a job. `succeeded` requires a fresh heartbeat; a timeout is `failed` with `detail`.

### 3.2 Bot presence in the dashboard

```
unknown ──first heartbeat──> online ──heartbeat age > 90 s──> stale ──new heartbeat──> online
                                  └──explicit stop/SIGTERM──> offline
```

`stale` renders as offline with the heartbeat age. The API never reports `online` from a stored flag.

### 3.3 Chain gag

Per-channel states `idle → expect_g → expect_e → expect_r → closed`, with a 10-minute expiry. The full table
is in the command contract §5. No state is global.

## 4. Input, output and edge cases

| Case | Required result |
| --- | --- |
| Empty/whitespace command argument | One usage line, no provider call |
| City > 100 chars or non-UTF8 | Rejected before the request |
| Provider returns HTML or malformed JSON | Treated as failure, cached list used if available |
| Provider returns > 100 giveaways | Digest capped at 10, deterministic order |
| Profanity list empty/unavailable | Feature silent, one warning per hour |
| Message content intent missing | Bot logs which intent and exits 1 with the portal instruction |
| Duplicate gateway event | Second copy exits before logging |
| User has no DM permission | Guild-only commands answer in guild only; no crash |
| Discord 429 | discord.js handles retry; the pipeline does not add its own retry loop |
| Database down | Chat keeps working; log warnings rate-limited; API returns 503 |
| Clock skew | All comparisons use server UTC; heartbeat uses UTC timestamps |
| Unicode/emoji in usernames or quotes | Preserved; length limits count code points, not bytes |
| Concurrent admin edits to last admin | Transaction + `FOR UPDATE` prevents zero-admin state |

Adversarial cases: forged session cookie (rejected), CSRF-less mutation (403), SQL injection attempts
(parameterised queries only), path traversal in exports (fixed filenames only), oversized body (413),
replayed restart request (409), and message content attempting to mention `@everyone` (allowed-mentions
restriction on bot sends).

## 5. API surface summary

Authoritative details: `contracts/api-contract.md`.

```
POST   /auth/login | /auth/logout | /auth/change-password      GET /auth/me
GET    /health | /ready | /metrics
GET    /bot/status | /bot/count | /bot/login_count
GET    /bot/logs | /bot/logs/:id | /bot/logins | /bot/interactions
POST   /bot/logs            PUT /bot/logs/:id        DELETE /bot/logs/:id
POST   /bot/restart         GET /bot/restart/:jobId
GET    /users | /users/:id  POST /users  PUT /users/:id  POST /users/:id/password  DELETE /users/:id
GET    /guilds | /guilds/:id/settings   PUT /guilds/:id/settings
POST   /admin/prune-logs    POST /initialize-db (admin, idempotent)
```

## 6. Data lifecycle

- **Create**: log events from bot and API; accounts by admin or first-run bootstrap; sessions on login.
- **Read**: dashboard only, role-filtered.
- **Update**: settings, roles, log edit (admin), heartbeat upsert.
- **Delete**: admin log delete, retention prune, account delete (cascades sessions, nullable log references),
  session revoke.
- **Export**: CSV of filtered logs; JSON account list for admins.
- **Retention**: 30/90/180 days by event class (`DEC-016`), enforced by a prune job with a counted result.

## 7. Launch acceptance (measurable)

1. Every `REG-*` behaviour is demonstrated by a test or a scripted check with output recorded.
2. Every `FIX-*` item has a reproduction that fails before and passes after; the five headline defects have
   dedicated checks (`MYSQL_PORT`, frozen status, account lockout, empty chain message, anonymous takeover).
3. Role matrix: 100 % of routes have an allow/deny assertion for anonymous, viewer, operator, admin.
4. A fresh empty database initialises and the dashboard reads it.
5. The dashboard works at 360 px and 1280 px, keyboard-only, with visible focus.
6. Restore drill, offline alert, restart job and rollback are executed and recorded.
7. `npm run verify` passes from a clean clone with no network calls during build.

Later-scope acceptance is defined per requirement in `data/requirements.json` and must not weaken these.
