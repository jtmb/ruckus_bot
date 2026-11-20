# Implementation evidence — 2026-11-17

Baseline `main@711ff12`; all changes uncommitted in the working tree. Nothing was pushed, merged or deployed.

## Executed
| Check | Result |
| --- | --- |
| `./scripts/verify.sh` (clean `npm ci` in api, bot, dashboard) | `ALL CHECKS PASSED` |
| `npm audit --omit=dev` api / bot / dashboard | 0 / 0 / 0 vulnerabilities (baseline 3C+7H / 1C+6H / 1C+3H) |
| API integration tests (MySQL 8.4.13) | 16 pass, 0 fail |
| Bot tests | 13 pass, 0 fail |
| `git ls-files \| grep -c node_modules` | 0 (baseline 5,290) |
| `next build` with API stopped | succeeds; `/api/bot-status` is dynamic (ƒ) |
| `docker build` slim (1.16 GB) and alpine (1.07 GB), Node 26.13.1 | both reach `healthy`; alpine `/ready` -> `{"status":"ready"}` |
| Container with production `PATH`/`NODE_VERSION`/`YARN_VERSION` overrides | healthy, dashboard 200 |
| `docker compose config` | valid; readme compose block parses as YAML |
| charts `scripts/validate.py` with the patch | `passed: true`, 30 charts, 31 HelmReleases, credential scan passed |

## Baseline reproductions re-run against the built container
anonymous `GET /users`, `POST /users` (takeover), `GET /bot/logs`, `POST /bot/restart` -> all **401** (baseline: 200 with data / admin created).
First-run: `/api/check-admin` `{adminExists:false}` -> create-account 201 -> second anonymous create 400 "An Admin account already exists".
Login sets `ruckus_session; HttpOnly; SameSite=strict`; response body has no token and no hash; scan of `/api/users` + `/api/session` for `$2[aby]$` = 0 matches; container log scan for password/hash = 0.
Heartbeat row inserted -> `/api/bot-status` `{"isBotUp":true,"guilds":["TestGuild"]}` with no rebuild; after logout -> 401; cross-origin login POST -> 403.

## Not verified / limits
- No live Discord session: the production `BOT_TOKEN` was intentionally not used locally (it would create a second gateway session for the live bot). Bot behaviour is verified with fakes and a real MySQL, and the invalid-token path (clean exit, logged) in the container.
- Weather needs `OPENWEATHERMAP_API_KEY`, which is not in the production secret.
- Not deployed: no registry credentials (see `docs/deploy/FLUX-DEPLOY.md`).
- Not done from the roadmap: WP0 skill installation/harness matrix (needs approval), WP8 metrics/alerts/backup automation, most WP10 features, LICENSE text (owner decision), removal of stray files (`pagination.js`, `page.js.old`, root `package.json` left untouched).
