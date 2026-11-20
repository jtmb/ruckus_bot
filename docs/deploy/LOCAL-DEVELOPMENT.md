# Local development and smoke guide (`ruckus_bot`)

Scope: **local setup, configuration and smoke checks only**. Nothing here authorises deployment, a live-service
mutation, a production credential, a production database dump, installing skills, or changing root config.
This is the accurate, currently-supportable companion to the original `../../readme.md` and the historical
`../localtesting.md` (which is outdated). Authoritative sources are linked, not duplicated.

## 1. Layout and entrypoints

| Area | Local guide | Run |
| --- | --- | --- |
| Bot (Discord gateway) | [`../../bot/AGENTS.md`](../../bot/AGENTS.md) | `npm start` in `bot/` (real login — see safety) |
| API (Express + MySQL) | [`../../api/AGENTS.md`](../../api/AGENTS.md) | `npm start` in `api/` (migrations run on boot) |
| Dashboard (Next.js) | [`../../dashboard/AGENTS.md`](../../dashboard/AGENTS.md) | `npm run dev` / `npm run build` in `dashboard/` |

The image is a single process managed by supervisor (`config/supervisord.conf`); `docker-compose.yml` is for
local build testing and requires `BOT_TOKEN`. The prebuilt-image compose example is in `../../readme.md`.
Never publish API port 3003 or the database port.

## 2. Prerequisites (measured)

- Node **>=24** is the pinned engine in each `package.json`; the full verifier runs in a `node:24` container.
  The local environment measured here is Node 22.23.1 / npm 10.9.8, which is enough for the dependency-free
  suites below but not the shipped engine target.
- Docker CLI plus an existing H-backed daemon for the full verifier. MySQL 8.4 is supplied as a throwaway
  container by `scripts/verify.sh` — no host database install is needed.
- `npm ci` installs run **only** inside the verifier's H-backed volumes, never into the checkout. Dependencies
  are not installed in this tree; do not add `node_modules/` or `.next/`.
- A Discord token with Message Content + Server Members intents is an external activation input (ASM-001);
  it is **not** required for local verification and must not be the production token.

## 3. Configuration

Copy `../../.env.example` to a git-ignored `.env` and fill placeholders. Authoritative variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `BOT_TOKEN` | required | Discord login (use a throwaway dev bot, never production) |
| `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` | required | API/bot database connection |
| `MYSQL_PORT` | `3306` | database port |
| `PORT` | `3003` | API listen port |
| `OPENWEATHERMAP_API_KEY` | unset | enables `!weather`; quota is an activation input (ASM-006) |
| `CORS_ORIGINS` | same-origin only | comma-separated browser origins allowed to call the API |
| `SESSION_TTL_HOURS`, `LOG_RETENTION_DAYS`, `HEARTBEAT_STALE_SECONDS` | `12`, `0`, `90` | session lifetime, log retention, offline threshold |
| `API_URL` | `http://localhost:3003` | how the dashboard server reaches the API |

Validation is in `../../api/src/config.js` and `../../bot/src/config.js` (fails fast on missing/invalid values).
The planning document `../planning/operations/06_SECURITY_AND_OPERATIONS.md` §4 mentions a `SESSION_SECRET`;
the shipped code uses DB-backed hashed bearer sessions and has no such variable — do not document it as active.
`SESSION_SECRET` rotation and other in-flight items are not guaranteed here.

## 4. One-command full verification

The shipped orchestrator is **`../../scripts/verify.sh`**. The roadmap shorthand `npm run verify` is **not** a
root script in the current `../../package.json`; confirm the root package before claiming that command. The
script header is the authority. Exact invocation (all variables required; no credential defaults):

```bash
RUCKUS_VERIFY_H_DIR=/mnt/h/AgentArtifacts/projects/ruckus_bot/verify \
TEST_MYSQL_ALLOW_DESTRUCTIVE_TESTS=1 TEST_MYSQL_PASSWORD=<throwaway-password> \
TEST_MYSQL_USER=verify_fixture TEST_MYSQL_HOST=127.0.0.1 TEST_MYSQL_PORT=33061 \
  ./scripts/verify.sh
```

- `RUCKUS_VERIFY_H_DIR` must resolve under `/mnt/h/AgentArtifacts/projects/ruckus_bot/`; generated compose,
  fixture SQL and logs land there. Peak check requires >=5 GiB free on H.
- `TEST_MYSQL_ALLOW_DESTRUCTIVE_TESTS=1` is an explicit opt-in; `TEST_MYSQL_USER` must be a dedicated fixture
  user (the runtime `bot` account is refused); password uses plain chars only; host must be literal loopback;
  `TEST_MYSQL_DATABASE` must be unset (the API test creates its own `ruckus_test_*` schema).
- Add `VERIFY_DRY_RUN=1` to generate and validate the workflow without starting containers or installing deps.
- The script bind-mounts the checkout **read-only**, runs `npm ci` + `npm audit --omit=dev` for api/bot/dashboard
  into H-backed volumes, runs API and bot tests, builds the dashboard with the API stopped, validates both the
  generated and repository compose files, and removes its containers/volumes afterwards. A previous run
  recorded `ALL CHECKS PASSED` (`../planning/evidence/2026-11-17-implementation.md`); re-run to confirm current
  state — do not treat that record as proof of today's checkout.

## 5. Supportable smoke paths (tested vs blocked)

| Path | Command | Status |
| --- | --- | --- |
| Dashboard log tests | `node --test dashboard/test/logs.test.mjs dashboard/test/logs.routes.test.mjs` | **Verified here**: 15/15 pass, no install/DB/network |
| API fail-closed guards | `node --test api/test/isolation.test.js api/src/migrations/safety.test.js` | **Verified here**: 19/19 pass, no install/DB |
| Full stack (deps, MySQL, build, audits) | `./scripts/verify.sh` with §4 env | Supported; requires Docker + H. Last recorded pass 2026-11-17 |
| Live Discord gateway / intents / slash commands | `bot/npm start` with a dev token | **Blocked**: no dev token/guild; do not use production token |
| `!weather` against a real provider | requires `OPENWEATHERMAP_API_KEY` | **Blocked**: key/quota unknown (ASM-006); use fixtures |
| Browser visual / keyboard-only review | dashboard deps + browser | **Blocked**: deps not installed in this checkout |
| Deployment / registry / live host | `../deploy/FLUX-DEPLOY.md` | **Blocked**: no registry credentials; no production access |

There is no `npm run lint`, `npm run smoke:bot`, `npm run smoke:ui`, `npm run migrate` or `npm run seed:demo`
script in the shipped area `package.json` files. Do not present these as runnable. Dashboard tests use direct
`node --test` (`../../dashboard/test/README.md`); migrations run at API startup (`../../api/src/migrations/index.js`).

## 6. Data, credential and H safety

- Use only throwaway loopback fixtures and dedicated test users. Never point a test at production/cluster
  MySQL, reuse a runtime credential, or import the original production dump. That dump is explicitly
  **not qualified** and must be left untouched — see [`BACKUP-RESTORE.md`](BACKUP-RESTORE.md) §1.
- Never commit `.env`, tokens, passwords or dumps (`.gitignore` excludes them). No secret belongs in a log,
  error response, client bundle or image layer.
- All generated output (deps, `.next`, logs, dumps, screenshots, containers) goes under
  `/mnt/h/AgentArtifacts/projects/ruckus_bot/`; keep the tracked tree clean and reuse this single checkout —
  no clones, worktrees or dependency copies.

## 7. Troubleshooting quick reference

| Symptom | First check |
| --- | --- |
| `TEST_MYSQL_*` guard throws | opt-in, literal loopback host, dedicated fixture user, plain password, `TEST_MYSQL_DATABASE` unset |
| `ECONNREFUSED 3306` / `ER_ACCESS_DENIED` | fixture port (`MYSQL_PORT`) and credentials |
| `SCHEMA_INCOMPATIBLE` on startup | a pre-migration table is missing columns; take a dump before upgrading (ASM-003) |
| API 5xx / blank dashboard | `/health` then `/ready`; route dynamic vs build-time snapshot; cookie domain |
| Dashboard tests cannot import | run without install only via the dependency-free `node --test` paths in §5 |

Full runbooks: `../planning/operations/06_SECURITY_AND_OPERATIONS.md` §8 and [backup/restore](BACKUP-RESTORE.md).

## 8. References

[`../../readme.md`](../../readme.md), [`../../.env.example`](../../.env.example),
[`../../scripts/verify.sh`](../../scripts/verify.sh),
[`../planning/operations/07_IMPLEMENTATION_ROADMAP.md`](../planning/operations/07_IMPLEMENTATION_ROADMAP.md) §WP9,
[`../planning/evidence/2026-11-17-implementation.md`](../planning/evidence/2026-11-17-implementation.md),
[`../planning/contracts/api-contract.md`](../planning/contracts/api-contract.md),
[`../planning/contracts/session-contract.md`](../planning/contracts/session-contract.md),
[`../operating-kit/RULES.md`](../operating-kit/RULES.md), [`../../AGENTS.md`](../../AGENTS.md).
