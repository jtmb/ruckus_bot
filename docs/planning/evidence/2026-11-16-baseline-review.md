# Baseline review evidence — 2026-11-16

Observed review of the pulled repository. This file records what was actually executed. It is not a
test of the future implementation, and no claim below is inherited from another machine or chat.

| Field | Value |
| --- | --- |
| Repository | `https://github.com/jtmb/ruckus_bot` |
| Revision | `main` at `711ff12` (2026-09-09) |
| Working checkout | `/home/brajam/repos/ruckus_bot` |
| Host environment | WSL2, Linux, Node `v22.23.1`, npm `10.9.8`, Docker `29.6.2`, Compose `v5.3.1` |
| Database used for probes | `mysql:8.0` container (`MYSQL_DATABASE=db`, user `bot`), port 3306 |
| Harness | OpenCode `v2.3.0` |
| Reviewer | Planning integrator (this session) |

Commands were run from the repository root unless a path is shown. Evidence files referenced below are
in this directory.

---

## 1. Setup performed

1. `git clone https://github.com/jtmb/ruckus_bot.git` → 5,365 tracked files, 92 MB working tree, 25 MB `.git`.
2. `docker run … mysql:8.0` with the compose credentials.
3. `cd api && MYSQL_HOST=127.0.0.1 MYSQL_USER=bot MYSQL_PASSWORD=… MYSQL_DATABASE=db PORT=3003 node src/api.js`.
4. `cd dashboard && npm ci && npx next build && PORT=18080 npx next start -p 18080`.
5. Bot handler probes with mocked Discord message objects (`/tmp` harness, repo modules unchanged) and one
   real `node src/index.js` run with a deliberately invalid token.
6. Browser capture through headless Chromium (DevTools protocol) against the running dashboard.

`npm ci` in `bot/` and `api/` was not required: both applications ship **committed `node_modules`**
(5,290 tracked files under `**/node_modules`), and the vendored versions are what the probes used.

---

## 2. Build and startup observations

| Check | Result |
| --- | --- |
| `node --check` on every tracked JS file outside `node_modules` | Pass (no syntax errors) |
| `next build` exit code | `0`, but two upstream fetches failed during prerender: `connect ECONNREFUSED 127.0.0.1:3003` (`dashboard-build.log` lines 8, 29) |
| Build route table | `/api/bot-status` emitted as **static** (`○`); `/api/check-admin`, `/api/login`, `/api/create-account`, `/api/initialize-db`, `/api/restart-bot` dynamic (`ƒ`) |
| Running dashboard page | `/dashboard` rendered `Bot is Offline ❌🤖` while the API held a current `bot_login` row (`dashboard.png`) |
| Bot start with `BOT_TOKEN=invalid.token.value` | Immediate `Error: Client object or client.user is null.` then uncaught `TokenInvalid`, process exit (`api-runtime.log` + terminal capture) |
| Bot start with MySQL 8 | `ER_NOT_SUPPORTED_AUTH_MODE` — the vendored `mysql@2.18.1` cannot authenticate (`api-runtime.log`) |
| `logEvent` callback | Declared arity `0`; callback passed by `isOnline` was never invoked (`callbackCalled after 3s: false`) |

---

## 3. API probes (unauthenticated, no session)

```
POST /initialize-db                      → 200 {"message":"Database and credentials table are set up successfully"}
GET  /users                              → 200 []
POST /users {"username":"admin",…}       → 200 {"message":"User created successfully",…}
POST /users/authenticate                 → 200 {"message":"Authentication successful","user":{…,"password":"$2b$10$…"}}
POST /users/admin/password {"newPassword":"pwned"} → 200 {"message":"Password updated successfully"}
POST /users/authenticate {"password":"pwned"}      → 200 (takeover confirmed)
DELETE /users/:username                  → 200 (no authentication)
DELETE /bot/logs/1                       → 200 {"message":"Log deleted successfully"}
POST /bot/restart                        → 500 text/html (`supervisorctl: not found` outside the container)
POST /api/initialize-db                  → 404 (path used by the dashboard's check-admin proxy)
```

Additional measured behaviour:

| Case | Result |
| --- | --- |
| `GET /bot/logins?limit=5` with two rows (2026-01-01 and 2026-06-01) | Returned the **oldest** row first; no `ORDER BY` in the query |
| `GET /bot/logs?limit=abc` | `500` |
| `GET /bot/logs?offset=-5` | `500` |
| `GET /bot/logs?limit=1000000000` | `200` (no upper bound) |
| `GET /bot/logs` response headers | `X-Total-Count: 2` present; `Access-Control-Expose-Headers` absent (middleware is registered after the routes) |
| `GET /bot/login_count`, `/bot/count`, `/bot/interactions` | Work, but paginated routes do not expose totals |
| Fresh database | `initialize-db` creates `credentials` only; `bot_logs` is missing until the bot process runs, so log routes return `500 sqlMessage: "Table 'db.bot_logs' doesn't exist"` |
| `MYSQL_PORT=13306` | Ignored by all three pools; connection attempted on 3306 (`ECONNREFUSED 127.0.0.1:3306`) |

---

## 4. Bot handler probes

Harness: mocked `Message` objects with a `reply()` that throws `DiscordAPIError[50006]` for empty content,
`channel.send()` collector, `mentions` stub and an `unhandledRejection` recorder.

| Probe | Observed |
| --- | --- |
| `handleHeadsOrTails("!flipacoin heads")` | Sent one reply, **returned `undefined`** → dispatcher treats it as unhandled and can send a second (quote) reply |
| `handleHeadsOrTails("!flipacoin")` | Replied "Please specify either heads or tails", returned `undefined` |
| `nChain("hello there")` | No reply, but **inserted the message id into `repliedMessages`** (every message is marked processed) |
| `nChain("e")` before `g` | Called `reply('')` → `DiscordAPIError[50006]` surfaced as an **unhandled rejection** |
| `handleJokeCommand("my friend said tell me a joke yesterday")` without mention | Returned `true` and posted a joke (unsolicited) |
| `handleWeatherCommands("!weather in London")` without mention | Returned `false`, no reply — the documented command is not implemented |
| `getCommandList()` | `…- \`!help\` - Display the full help dialog.- \`!commands\`…` (missing newline) and hardcodes bot id `922579269639618640` |
| `handleInsults("hello world this is a normal sentence")` | Took **153 ms** (network fetch of the 205-term list) for one ordinary message; not triggered because the fetch succeeded |
| Same handler with an empty list | Regex `\b(?:)\b` **matches any word** → ordinary messages would receive insults (severe fail-open) |

`repliedMessages` is only ever `.set()`; no delete, TTL or size cap exists in `bot/src`.

---

## 5. External provider checks

| Provider | Observation (2026-11-16) |
| --- | --- |
| `gamerpower.com/api/giveaways?platform=pc&type=game` | 12 giveaways; all current titles/descriptions/instructions fit the Discord embed limits today (no overflow found), but the handler sends **one message per giveaway** with no cap |
| `purgomalum.com/profanitylist.html` | 205 list items, HTML scraped with cheerio each message; 128 ms |
| `jokeapi.dev` via `import('node-fetch')` | Resolves inside `bot/`, so the dynamic import works, but it adds a module load per call |
| Discord limits used for validation | title 256, description 4096, field value 1024, 25 fields, 6000 chars per message (SRC-007) |

---

## 6. Dependency and runtime risk

`npm audit --omit=dev` at the baseline:

| App | Critical | High | Moderate | Low | Total |
| --- | --- | --- | --- | --- | --- |
| `api` | 3 | 7 | 1 | 3 | 14 |
| `bot` | 1 | 6 | 2 | 0 | 9 |
| `dashboard` | 1 | 3 | 0 | 0 | 4 |

Named critical/high findings include `mysql2` RCE and prototype pollution (api), `proxy-addr` IP spoofing
(api), `next` authorization bypass and RCE classes (dashboard), `form-data` weak boundary (bot),
`axios` SSRF/credential-leak set (bot) and multiple `body-parser`/`path-to-regexp` DoS advisories (api).

Runtime pins measured in the tree: Node `18.19.1` in both Dockerfiles, `discord.js 14.14.1`,
`express 4.18.2`, `next 14.2.7`, `mysql 2.18.1`, `mysql2 3.9.1`, `bcrypt 5.1.1`.

---

## 7. Repository hygiene

| Observation | Measured |
| --- | --- |
| Tracked `node_modules` | 5,290 files (`api` 1,350, `bot` 3,940) |
| `.gitignore` | one line: `dev` |
| `.dockerignore` | absent; Docker build context includes all committed dependencies |
| Stray files | `pagination.js` (hardcodes `http://localhost:3001`, marked "CURRENTLY THIS DOES NOT WORK"), `dashboard/app/page.js.old`, root `package.json` with only `discord.js` |
| `LICENSE` | absent although readme claims GNU GPL v3 |
| Readme compose example | `docker compose config` → `services.bot.environment.[0]: unexpected type map[string]interface {}` (invalid `- KEY: value` form) |
| Tests | none; `npm test` in each package exits 1 |
| Schema seed | `config/schema.sql` inserts `('user','changeme','user')` in plaintext and is not idempotent |

---

## 8. Visual observation

Captured screens (headless Chromium, 1280×900):

- `login.png` — dark login card, no visible error/empty states, small cyan link on dark background.
- `create-account.png` — no feedback that the admin check failed; the page silently proceeds.
- `dashboard.png` — a single large error icon and "Bot is Offline" despite live data; no navigation, no logs,
  no users, no uptime; header has a "Restart Bot" button, a GitHub icon and a settings menu whose
  "User Management" entry is an `alert()` placeholder.

Assets are hotlinked from `sndcdn.com`, `freeiconspng.com` and `iconfinder.com`; an offline or filtered
network leaves broken images.

---

## 9. Limitations of this review

- No valid Discord token or guild was available, so gateway behaviour (intent approval, real message
  traffic, slash-command registration) was not exercised. Handler logic was exercised with mocks.
- The database probes used MySQL 8.0, not the pinned 5.7 image; the bot driver failure is therefore a
  forward-compatibility finding, and MySQL 5.7-specific behaviour was not tested.
- No production data, hosting target or owner infrastructure was provided.
- Visual review covers three desktop screens; no mobile or assistive-technology pass was performed.
- Provider quotas (OpenWeatherMap in particular) were not verifiable from the rendered pages.
