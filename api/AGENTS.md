# Area guide — `api/`

OpenCode loads this file automatically when working in this directory. It replaces the aspirational template
in `../docs/operating-kit/feature-guides/api-area.AGENTS.md` with the layout that actually ships. Keep this
guide short; update it here when the code changes, not in the template.

## Purpose

Express 4 service that owns the HTTP surface, sessions/RBAC, validation, persistence, migrations, log paging,
heartbeat status and the restart job. It listens on `PORT` (default 3003) and is **not** meant to be published.

## Entrypoints (real files)

| File | Role |
| --- | --- |
| `src/api.js` | `buildApp()` middleware order, `/health`, `/ready`, error envelope, `start()` |
| `src/config.js` | `load(env)` validates MySQL vars and bounded ints (`PORT`, `MYSQL_PORT`, TTLs, stale threshold) |
| `src/db.js` | mysql2 promise pool built from validated config |
| `src/middleware/auth.js` | DB-backed opaque bearer sessions (`attachUser`, `requireUser`, `requireAdmin`), login throttle |
| `src/middleware/validate.js` | request validation helpers (id, pagination, log body, credentials) |
| `src/routes/dashboardRoutes.js` | auth/session, first-admin bootstrap, user management |
| `src/routes/botRoutes.js` | logs paging/count, `/bot/status`, `/bot/restart` |
| `src/modules/{botDatabase,dashboardDatabase}.js` | SQL per aggregate |
| `src/migrations/index.js` | numbered, idempotent, forward-only migrations (0001–0003) |

Layering: `routes → middleware → modules → pool`. Routes never build SQL strings; modules never read
`req`/`res`. There is no generic `src/middleware/*` chain beyond the two files above; do not assume
requestId/CSRF/rate-limit middleware that does not exist.

## Configuration (authoritative: `../.env.example` + `src/config.js`)

Required: `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`.
Optional: `MYSQL_PORT` (3306), `PORT` (3003), `CORS_ORIGINS` (same-origin only when empty),
`SESSION_TTL_HOURS` (12), `LOG_RETENTION_DAYS` (0), `HEARTBEAT_STALE_SECONDS` (90).
Sessions are opaque tokens hashed with SHA-256 in the `sessions` table; there is no `SESSION_SECRET`
or shared-secret header in the shipped code — do not document one as active.

## Local commands

| Command | Mutates? | Purpose / status |
| --- | --- | --- |
| `npm start` | yes (schema on boot) | runs `src/api.js`; `migrate(pool)` applies pending migrations at startup |
| `npm test` | yes (throwaway schema) | `node --test`; `api.test.js` fails closed without the throwaway-DB opt-in/env; use `../scripts/verify.sh` which supplies it |
| `node --test test/isolation.test.js src/migrations/safety.test.js` | no | pure Node fail-closed guard tests, no DB/deps; verified passing on Node 22.23.1 |
| dry-run migration | no | no `npm run migrate` script exists; migrations run automatically at startup — do not promise a migrate CLI |

There is no `npm run seed:demo` script; demo data comes from the throwaway fixture in `../scripts/verify.sh`.

## Test oracles (shipped tests)

| Test file | Guarantee / requirement |
| --- | --- |
| `test/api.test.js` | migrations idempotent and adopt a pre-migration schema with data; anonymous callers get 401 on all protected routes; bootstrap-first-admin; hash redaction and no leaked token/hash; bounded ordered paging and retention prune; heartbeat status reflects a new login without rebuild (REG-010/012, SEC-001–010) |
| `test/isolation.test.js` | fail-closed DB guard: needs explicit opt-in, literal loopback only, dedicated fixture user, unique `ruckus_test_*` schema, DROP only with positive create acknowledgement |
| `src/migrations/safety.test.js` | schema-adoption guard throws `SCHEMA_INCOMPATIBLE` on a live mismatch; first-admin/concurrency guards |

## Rules specific to this area

- Deny by default; declare the role per route and add it to the matrix test. Hiding a control in the UI is not a control.
- Every query parameterised, ordered and clamped; no dynamic identifiers from request input.
- Error envelope carries `X-Request-Id`; never put a hash, token, password or secret in a response or log.
- A pre-migration table missing required columns aborts with `SCHEMA_INCOMPATIBLE`: take a dump before upgrading
  (ASM-003). Do not silently adopt an incompatible schema.

## Data, credentials and H routing

- API tests create and drop their **own** uniquely named schema on a throwaway **loopback** MySQL; the guard
  refuses remote hosts, the runtime `bot` account, a pinned `MYSQL_DATABASE` and any production credential.
- Never run tests against a production/cluster database, and never import the original production dump.
  That dump is explicitly not qualified — see `../docs/deploy/BACKUP-RESTORE.md` §1.
- Generated SQL/compose/log output belongs under `/mnt/h/AgentArtifacts/projects/ruckus_bot/`; `npm ci`
  installs into H-backed container volumes, not the checkout. See `../docs/deploy/LOCAL-DEVELOPMENT.md`.

## Troubleshooting

`ER_ACCESS_DENIED` → wrong fixture credentials. `ECONNREFUSED 3306` → check `MYSQL_PORT`. `SCHEMA_INCOMPATIBLE`
→ dump before upgrade (do not delete tables). Cookie not accepted → HttpOnly/SameSite=strict and the browser
origin; session bearer must be forwarded by the dashboard. Full runbook: `../docs/planning/operations/06_SECURITY_AND_OPERATIONS.md` §8.

## Tested vs blocked

Verified with a MySQL 8.4 throwaway fixture in `../docs/planning/evidence/2026-11-17-implementation.md`
(16 integration pass; anonymous routes 401; no hash in responses/logs). **Blocked/unverified:** no production
host or credentials, no deployed metrics/alerts, no external identity provider — keep these as activation inputs.

## References

`../docs/planning/contracts/api-contract.md`, `../docs/planning/contracts/data-model.md`,
`../docs/planning/contracts/session-contract.md`, `../docs/operating-kit/RULES.md`,
`../data/requirements.json`, `../docs/deploy/LOCAL-DEVELOPMENT.md`.
