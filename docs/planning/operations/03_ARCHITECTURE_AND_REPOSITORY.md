# 03 — Architecture and repository

## 1. Shape

Three Node processes and one database, shipped as one image by default:

```
Discord gateway ──► bot (discord.js)  ──┐
                                        ├──► MySQL 8.4
Browser ──HTTPS──► dashboard (Next.js) ─┘        ▲
                        │ server-side fetch      │
                        └──► api (Express) ──────┘
```

- `bot/` speaks to Discord and writes events/heartbeats.
- `api/` owns authentication, data access and process control.
- `dashboard/` renders the operator UI and never exposes the API to the browser (`DEC-012`).
- MySQL is the only durable store. No cache server, queue broker or object store is required at this scale.

Exact diagrams (SVG, generated and inspected):

- [`context.svg`](../../visuals/diagrams/context.svg) — actors, systems, trust boundaries.
- [`architecture.svg`](../../visuals/diagrams/architecture.svg) — components and allowed dependency direction.
- [`command-flow.svg`](../../visuals/diagrams/command-flow.svg) — message → dispatch → handler → reply/log.
- [`data-model.svg`](../../visuals/diagrams/data-model.svg) — tables and relationships after migrations.

## 2. Runtime responsibilities

| Component | Owns | Must not |
| --- | --- | --- |
| `bot/` | Gateway connection, command registry, handlers, provider clients, heartbeat, event emission | Own HTTP routes, render HTML, run migrations |
| `api/` | Sessions, RBAC, validation, SQL, restart jobs, metrics, migrations, log retention | Contain Discord gateway logic or UI markup |
| `dashboard/` | Sessions cookie forwarding, server components, presentation, client polling | Talk to MySQL directly, hold the bot token, read the API from the browser |
| MySQL | Durable state | Enforce business rules alone |

Allowed dependency direction: `dashboard → api (HTTP)`, `bot → shared contracts (code only)`, `api → MySQL`,
`bot → MySQL`. There is no `bot → api` runtime dependency and no `dashboard → bot`.

## 3. Proposed repository structure

Existing files stay where they are; new files are added only where the feature lives.

```
bot/
  src/
    index.js                 # process bootstrap: config, client, heartbeat, shutdown
    config.js                # validated env for the bot process        (new)
    core/
      dispatcher.js          # pipeline, dedupe, cooldowns, error policy (new)
      context.js             # command context factory                  (new)
      registry.js            # command metadata → help/slash/cooldowns  (new)
      logger.js              # structured logger + redaction            (new)
    modules/
      commands/              # one file per command, existing modules move here
        flip.js  weather.js  joke.js  freegames.js  help.js  quote.js
        chain.js insult.js easterEgg.js
      providers/             # gamerpower, weather, joke, insults, quotes (cached)
      db/                    # pool, event queue, heartbeat writer
  AGENTS.md  README.md       # local guide (created when the area is implemented)
api/
  src/
    api.js                   # express app factory + server bootstrap
    config.js                # validated env                              (new)
    middleware/              # requestId, session, csrf, roles, rate limit, errors
    routes/                  # auth, status, logs, users, guilds, ops
    modules/                 # database access per aggregate
    migrations/              # 0001… numbered SQL + runner
  AGENTS.md  README.md
dashboard/
  app/
    (auth)/login/page.js     # public
    (app)/dashboard/page.js  # session required
    (app)/logs/page.js       # session required
    (app)/users/page.js      # admin only
    api/…                    # thin server proxies to the API
  lib/                       # api client, session helpers, formatting
  app/styles/                # tokens, components, responsive rules
  AGENTS.md  README.md
config/                      # compose-adjacent config (supervisor, env examples)
docs/                        # planning, operating kit, memory, research, visuals
data/                        # canonical planning records + workbooks
ops/                         # backup/restore/verify scripts (new, local only)
```

Rules:

- One feature = one module with a single entrypoint exported. No `utils/` catch-all; shared helpers live in
  `core/` (bot), `middleware/` or `modules/` (api), `lib/` (dashboard) with a named owner.
- Search-before-create: extend an existing registry entry, route or component, or record why extraction is
  justified in the task record.
- No circular imports; `core/` never imports a command, commands never import each other.
- Generated output (`.next/`, `node_modules/`, dumps, screenshots) is never committed (`.gitignore`).

## 4. Local and deployed topology

| Mode | Services | Ports | Notes |
| --- | --- | --- | --- |
| Development | `db`, `api`, `dashboard`, `bot` (compose profile `dev`) | 3306 (optional), 3003, 3000, — | Hot reload, seeded demo data, `.env` |
| Default deployment | single container, supervisor runs three processes | 8080 published | Preserves `REG-014` |
| Diagnostics | `db`, `phpmyadmin` | 8081 | Existing compose service; not published in production |

The image runs as a non-root user, exposes only 8080, and includes a `HEALTHCHECK` that calls the API
readiness endpoint.

## 5. Configuration

| Variable | Consumer | Required | Default | Validation |
| --- | --- | --- | --- | --- |
| `BOT_TOKEN` | bot | yes | — | non-empty |
| `MYSQL_HOST` | all | yes | — | hostname |
| `MYSQL_PORT` | all | no | 3306 | 1–65535 (**currently ignored — FIX-001**) |
| `MYSQL_USER` / `MYSQL_PASSWORD` | all | yes | — | non-empty |
| `MYSQL_DATABASE` | all | yes | — | `[a-z0-9_]+` |
| `OPENWEATHERMAP_API_KEY` | bot | no | — | weather disabled with a message if absent |
| `SESSION_SECRET` | api | yes | — | ≥ 32 bytes |
| `DASHBOARD_ORIGIN` | api | yes | — | absolute URL, CORS allowlist |
| `API_INTERNAL_URL` | dashboard | yes | — | absolute URL |
| `LOG_LEVEL` | all | no | `info` | enum |
| `LOG_MESSAGE_CONTENT` | bot | no | `false` | boolean |
| `LOG_RETENTION_DAYS` | api | no | `30` | 1–3650 |
| `PORT` | api | no | `3003` | 1–65535 |
| `TRUST_PROXY` | api | no | `false` | boolean |
| `RESTART_COMMAND` | api | no | supervisor command | fixed allowlist |

A committed `.env.example` lists every row with purpose and safe default (`FEAT-016`, `SEC-004`).

## 6. Feature ownership

| Feature | Entrypoint | Owner | Local guide |
| --- | --- | --- | --- |
| Command dispatch and registry | `bot/src/core/dispatcher.js` | implementer-bot | `bot/AGENTS.md` (WP4) |
| Each command | `bot/src/modules/commands/<id>.js` | implementer-bot | same, per command section |
| Provider clients | `bot/src/modules/providers/` | implementer-bot | same |
| Event logging and heartbeat | `bot/src/modules/db/` | implementer-bot | `contracts/data-model.md` |
| Auth/session | `api/src/middleware/session.js` | implementer-api | `api/AGENTS.md` (WP3) |
| Logs and users API | `api/src/routes/logs.js`, `users.js` | implementer-api | same |
| Restart job | `api/src/routes/ops.js` | operator | `06` runbook |
| Status UI | `dashboard/app/(app)/dashboard/` | implementer-ui | `dashboard/AGENTS.md` (WP7) |
| Log explorer | `dashboard/app/(app)/logs/` | implementer-ui | same |
| User management | `dashboard/app/(app)/users/` | implementer-ui | same |
| Design tokens | `dashboard/app/styles/` | implementer-ui | `05_DESIGN_AND_ACCESSIBILITY.md` |

Local `AGENTS.md`/`README.md` files are created **when the area is implemented**, not now; templates exist in
`docs/operating-kit/feature-guides/`.

## 7. Effective artifact path map

This is the single routing table for this repository. Navigation links point here.

| Artifact | Actual path | Purpose | Owner | Authoritative source / derived view |
| --- | --- | --- | --- | --- |
| Project introduction | `readme.md` | Public project overview, setup, demo | repository owner | Human-readable; links to the plan |
| Agent entrypoint | `AGENTS.md` | Reading order, working rules | integrator | Summarises `docs/operating-kit/RULES.md` |
| Repository memory index | `MEMORY.md` | Durable decision pointers | integrator | Derived from `data/decisions.json` |
| Documentation index | `docs/README.md` | Navigation | integrator | Links only |
| Planning status and validation | `docs/planning/README.md`, `docs/planning/validation-report.md` | Status, checks, limitations | integrator | Derived from records + executed checks |
| Active plan (00–07) | `docs/planning/operations/` | The single active plan | integrator | Derived from `data/*.json` |
| Detailed contracts | `docs/planning/contracts/` | Command, API, data, session rules | implementers | Authoritative for behaviour |
| Evidence | `docs/planning/evidence/` | Executed checks with revision and result | whoever ran them | Primary observations |
| Shared rules | `docs/operating-kit/RULES.md` | One authoritative policy | integrator | — |
| Role cards | `docs/operating-kit/roles/` | Integrator/implementer/reviewer/operator | integrator | — |
| Feature guide templates | `docs/operating-kit/feature-guides/` | Local AGENTS/README templates | integrator | Copied when an area exists |
| Skill designs (not installed) | `docs/operating-kit/skill-designs/<id>/` | Reviewable skill bodies | integrator | Installed only after authorisation |
| Installed skills (future) | `.opencode/skills/<id>/` | Active harness skills | integrator | Created only in WP0 with approval |
| Current state and handoff | `docs/memory/` | Fresh-session continuity | integrator | Handoff is authoritative for the next task |
| Research | `docs/research/` | Stack and provider notes | integrator | Links to `data/sources.json` |
| Diagrams | `docs/visuals/diagrams/` | Exact structure/flows | integrator | — |
| Concept mockups | `docs/visuals/mockups/` | Proposed UI, concept only | implementer-ui | Not implementation evidence |
| Visual manifest | `docs/visuals/manifest.json` | Maps each visual to purpose/requirement | integrator | Derived list |
| Requirements | `data/requirements.json` | Single canonical requirement store | integrator | All other views derive from it |
| Decisions | `data/decisions.json` | Accepted choices, rejected alternatives | integrator | — |
| Dependencies | `data/dependencies.json` | Pins, reasons, sources | implementer/operator | Verified at implementation |
| Assumptions | `data/assumptions.json` | Activation inputs and unknowns | integrator | — |
| Sources | `data/sources.json` | Access dates and supported claims | integrator | — |
| Scope history | `data/scope-history.json` | Origin, amendments, authority | integrator | — |
| Gates | `data/gates.json` | Release criteria and state | integrator | — |
| Work packages | `data/work-packages.json` | Executable units + requirement links | integrator | Derived from requirements |
| Acceptance tracker | `data/acceptance_tracker.xlsx` | Readable derived status view | integrator | Derived from the three records above |
| Cost model | `data/cost-model.xlsx` | Editable low/base/high model | integrator | Estimates + quoted prices |
| Source, tests, assets | `bot/`, `api/`, `dashboard/`, `config/`, `src/` | Unchanged locations | implementers | — |
| Release/handoff artifacts | `ops/` (future), `docs/planning/evidence/` | Scripts and records | operator | — |

Deviations from the default layout: the project introduction is `readme.md` (existing name) rather than
`README.md`; the numbered plan lives under `docs/planning/operations/` while the handoff lives in
`docs/memory/`, matching the planning contract. No parallel plan tree exists.

## 8. Workbook reconciliation

`data/acceptance_tracker.xlsx` is regenerated from `requirements.json`, `work-packages.json` and `gates.json`
by `python3 -B docs/operating-kit/scripts/build_tracker.py` (a planned helper; the generation used for this
package is described in the validation report). Reviewers may edit only the `Status`, `Evidence` and
`Reviewer` columns. The integrator imports those three columns by requirement ID before regenerating;
conflicts are resolved in favour of the canonical JSON with the workbook edit quoted in the task record.

## 9. Scale and evolution

The architecture is intentionally a single host and a single database. Expansion is justified only by
measured evidence in `06` §10: sustained throughput above the target, p95 latency above 800 ms, or a second
writer process needing coordinated state. At that point a queue for log writes or a managed database is the
next step — not microservices.
