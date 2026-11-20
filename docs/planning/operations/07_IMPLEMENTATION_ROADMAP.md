# 07 — Implementation roadmap

Numbers are execution order. Every work package is bounded, has one owner role, lists its requirement IDs
(from `data/requirements.json`), its acceptance evidence and a stop condition. A package is done only when a
reviewer has recorded the evidence in `docs/planning/evidence/` and the gate row in `data/gates.json` is
updated.

**No application code may be written before WP0 passes.** WP0 installs the operating kit and proves the
harness integration; WP1 then removes the repository hazards (committed dependencies, EOL runtime) that
would otherwise pollute every later diff.

Owners are roles, not people: `integrator`, `implementer-bot`, `implementer-api`, `implementer-ui`, `operator`,
`reviewer` (`docs/operating-kit/roles/`).

## Milestones

| Milestone | Packages | Outcome |
| --- | --- | --- |
| M0 — Operating kit | WP0 | Skills/guides installed and verified in the selected harnesses |
| M1 — Safe base | WP1, WP2 | Clean build on supported runtime, config and migrations, data contract |
| M2 — Secure API | WP3 | Sessions, RBAC, validation, no hash leakage |
| M3 — Correct bot | WP4, WP5 | All preserved commands correct, providers bounded |
| M4 — Live dashboard | WP6, WP7 | Real status, log explorer, user management, accessible UI |
| M5 — Operable | WP8 | Health, metrics, alerts, backups, release/rollback evidence |
| M6 — Verified release | WP9 | `npm run verify`, docs, CHANGELOG, all launch gates passed |
| M7 — Feature set | WP10 | Additive features behind their own acceptance tests |

---

## WP0 — Operating kit and harness compatibility checks

- **Owner**: integrator. **Depends on**: nothing. **Gate**: G1, G2. **Requirements**: none (enabling work).
- **Tasks**
  1. Review the four role cards, five skill designs and three feature-guide templates with the owner.
  2. On approval, install the skills into `.opencode/skills/<id>/` after verifying the current discovery path
     for OpenCode v2.3.0.
  3. Execute the seven-check harness matrix in `04_SKILL_AND_AGENT_DESIGNS.md` §6 for each available harness.
  4. Record results in `docs/planning/evidence/<date>-harness-matrix.md`.
- **Acceptance evidence**: skill list in a fresh session, explicit invocation, natural trigger, nested guide
  load, permission block, concurrent-task isolation, fresh-session continuation.
- **Stop condition**: if installation is not approved, keep designs in the operating kit, leave G1–G2
  unpassed and proceed to WP1 only if the owner authorises application work without installed skills.

## WP1 — Repository hygiene and dependency baseline

- **Owner**: implementer (shared). **Depends on**: WP0. **Gate**: G4.
- **Requirements**: FIX-009, FIX-028, FIX-029, FIX-030, FIX-034, FIX-040, REG-014.
- **Tasks**
  1. `git rm -r --cached` the committed `node_modules` trees (1,350 api + 3,940 bot files) and extend
     `.gitignore` (`node_modules/`, `.next/`, `.env*`, dumps, screenshots).
  2. Add `.dockerignore` covering dependencies, build output, docs, data, `.git`, evidence.
  3. Pin Node 26.13.1 (fallback 24.22.3), Next 16.4.6/React 19.3.1, Express 4.22.3, mysql2 3.24.6,
     bcrypt 6.0.0, discord.js 14.28.1, axios 1.21.1, cheerio 1.2.0, dotenv 18.0.10, `proxy-addr` override
     2.0.8; drop `mysql` v2, `node-fetch`, unused `url`; regenerate lockfiles with `npm ci` verification.
  4. Replace `mysql` with `mysql2` in `bot/src/modules/mysql.js` (finishes FIX-009 with WP2's config).
  5. Remove or claim `pagination.js`, `dashboard/app/page.js.old`, root `package.json`/lock (DEC-024).
  6. Make the build hermetic: no upstream fetch during `next build`; mark live routes dynamic.
  7. Rewrite the readme compose example, environment table, prerequisites and troubleshooting; restore the
     GPLv3 `LICENSE` text (owner confirms) or correct the licence claim.
  8. Run `npm audit --omit=dev` in all three packages; record before/after counts.
- **Acceptance evidence**: clean clone + `docker build` succeeds; `docker compose config` valid;
  `git ls-files | grep node_modules` empty; audit shows no critical/high; build succeeds with the API stopped.
- **Stop condition**: a required pin cannot be installed from the registry — record the package, version and
  error, and keep the previous version with the residual advisory named rather than silently skipping.
- **Reviewer focus**: did anything user-visible change in the readme that is not true yet?

## WP2 — Data, configuration and migration foundation

- **Owner**: implementer-api (bot config in pair with implementer-bot). **Depends on**: WP1. **Gate**: G2.
- **Requirements**: FIX-001, FIX-007, FIX-008, FIX-018, FIX-020, FIX-027, FIX-035, REG-013.
- **Tasks**
  1. Add `api/src/config.js` and `bot/src/config.js` with validation and `MYSQL_PORT` support (default 3306).
  2. Add the numbered migration runner and `0001_baseline` that adopts an existing pre-migration schema;
     create `bot_logs` and `credentials` idempotently; add indexes.
  3. Replace `config/schema.sql` with a pointer or convert it into `0001`; remove the plaintext seed.
  4. Fix `logEvent(type, data, cb)` to invoke the callback exactly once and return a promise; add the bounded
     queue and drop counter.
  5. Order all list queries by `timestamp DESC, id DESC`; clamp `limit`/`offset`; expose totals; return 400
     on invalid values.
  6. Remove the duplicate `getTotalLogsCountFromDatabase`, the dead `getTotalLogsCount` and unused deps.
  7. Add the retention prune job and its counted result.
- **Acceptance evidence**: empty MySQL 8.4 → migrations create everything; re-running is a no-op; paging
  tests for `0`, `-1`, `abc`, `101`, `1000000000`; one log row written through the bot path; prune removes
  seeded old rows.
- **Stop condition**: an existing production schema cannot be adopted safely — require a dump (`ASM-003`) and
  record the exact mismatch before touching data.

## WP3 — API security and contracts

- **Owner**: implementer-api. **Depends on**: WP2. **Gate**: G5.
- **Requirements**: FEAT-016, FIX-003, FIX-004, FIX-005, FIX-006, FIX-019, FIX-024, FIX-026, FIX-031, FIX-039,
  SEC-001…SEC-010, REG-012.
- **Tasks**
  1. Session middleware, `sessions` table, cookie flags, CSRF, roles, login throttling and lockout.
  2. Safe projections everywhere; add a response/log scan test for `$2[aby]$`, tokens and secrets.
  3. First-run bootstrap route and the dashboard create-account path; remove forced `admin` role.
  4. Validation middleware for every body/query; consistent error envelope with request ids.
  5. CORS allowlist with `Access-Control-Expose-Headers` registered before the routers.
  6. Graceful startup/shutdown, `/health`, `/ready`, token/intent failure handling.
  7. `.env.example` and startup validation.
- **Acceptance evidence**: route/role matrix (anonymous/viewer/operator/admin) green; takeover reproduction
  from the baseline now returns 401/403; hash scan clean; CORS preflight from a disallowed origin rejected.
- **Stop condition**: the owner requires an external identity provider — record it and implement the session
  contract behind the same interface instead of blocking other work.

## WP4 — Bot command core refactor

- **Owner**: implementer-bot. **Depends on**: WP1, WP2. **Gate**: G6.
- **Requirements**: FIX-010, FIX-011, FIX-012, FIX-013, FIX-014, FIX-022, FIX-023, FIX-025, FIX-038,
  REG-001, REG-002, REG-003, REG-006, REG-007, REG-009.
- **Tasks**
  1. Add `core/dispatcher.js`, `core/context.js`, `core/registry.js`, `core/logger.js`; move handlers to
     `modules/commands/` with the documented contract.
  2. Bounded dedupe (TTL 10 min, cap 5,000); per-channel chain state machine with expiry; no empty sends.
  3. Single `clientReady` handler; heartbeat writer; dynamic help; correct intent set and documentation.
  4. Await/handle every send; classify errors; add fault injection for rejected sends.
- **Acceptance evidence**: handler fixtures for all REG-* in this package; 50k synthetic messages leave the
  cache under 5,000 entries; no `unhandledRejection`; help snapshot lists every registered command once.
- **Stop condition**: a fix would change preserved reply wording — record a decision and ask the owner.

## WP5 — Command-specific fixes

- **Owner**: implementer-bot. **Depends on**: WP4. **Gate**: G6.
- **Requirements**: FIX-015, FIX-016, FIX-017, REG-004, REG-005, REG-008.
- **Tasks**
  1. Weather: both documented forms, city normalization/encoding, units, 5 s timeout, typed results, exact
     preserved error strings.
  2. Free games: one digest message, ≤ 10 entries, 5,500-character budget, deterministic ordering, filters.
  3. Profanity: bundled baseline list, TTL refresh, last-known-good, fail-closed, per-channel cooldown.
  4. Provider fixtures: success, empty, malformed, timeout, 5xx.
- **Acceptance evidence**: fixtures for each provider outcome; ordinary message causes zero outbound calls
  (network stub); one message per freegames invocation; no "undefined" in any reply.
- **Stop condition**: an upstream API shape changed — capture a sanitized fixture and record the difference.

## WP6 — Live status and dashboard data

- **Owner**: implementer-ui. **Depends on**: WP2, WP3. **Gate**: G7.
- **Requirements**: FEAT-001, FEAT-018, FIX-002, REG-010.
- **Tasks**
  1. Heartbeat table + writer + status endpoint with derived online/stale state and uptime.
  2. Make `/api/bot-status` and the dashboard route dynamic for the pinned Next version; verify by inserting
     a row and reloading without a rebuild.
  3. Per-guild health (members, channels, last activity) from the bot cache.
  4. Loading/empty/error/stale states; polling every 15 s.
- **Acceptance evidence**: insert login row → dashboard reflects it within one refresh; stop bot → offline
  within 90 s with heartbeat age; API down → error banner, no blank page.
- **Stop condition**: dynamic rendering cannot be verified in the pinned version — record the version-specific
  mechanism and the probe, do not ship a static snapshot.

## WP7 — Dashboard security and operator UI

- **Owner**: implementer-ui. **Depends on**: WP3, WP6. **Gate**: G7.
- **Requirements**: FEAT-002, FEAT-003, FEAT-007, FEAT-015, FIX-032, FIX-036.
- **Tasks**
  1. Server-validated session flow, login/logout, CSRF forwarding, protected route groups; remove the
     `localStorage` hook.
  2. Log explorer (filters, deterministic paging, CSV export) and user management (create/role/disable/delete).
  3. Design tokens, responsive layout, focus states, reduced motion, self-hosted assets, meaningful titles.
  4. Error/empty/loading states for every view.
- **Acceptance evidence**: `localStorage` bypass fails; keyboard journey completes; 360 px and 1280 px
  screenshots; contrast table re-measured from the implemented tokens; CSV matches the active filter.
- **Stop condition**: no browser available for visual verification — record the unverified visual gate rather
  than claiming it.

## WP8 — Observability, backups and operations

- **Owner**: operator. **Depends on**: WP3, WP6. **Gate**: G8.
- **Requirements**: FEAT-012, FEAT-013, FEAT-014, FIX-021, FIX-037, OPS-001…OPS-010, REG-011.
- **Tasks**
  1. Restart job endpoint + supervisor integration + job state UI; no shell interpolation.
  2. `/metrics`, structured logs, alert webhook with one alert and one recovery.
  3. Compose stack with MySQL 8.4 healthcheck, API/dashboard/bot healthchecks, non-root image, pinned digests.
  4. Backup/restore scripts and a drill; release and rollback runbook; capacity measurement.
- **Acceptance evidence**: restart job succeeds within 20 s and fails readably when the process manager is
  absent; restore drill record; alert fires once and recovers once; rollback to the previous digest verified.
- **Stop condition**: no host access — keep local evidence, mark OPS-006/007 unpassed with the exact access
  needed.

## WP9 — Verification suite and documentation

- **Owner**: integrator. **Depends on**: WP5, WP7. **Gate**: G9.
- **Requirements**: DOC-001, DOC-002, DOC-003, DOC-004, FEAT-017, FIX-033.
- **Tasks**
  1. Root `npm run verify`: lint, unit, HTTP contract, handler fixtures, hermetic build, migration dry-run.
  2. Local dev command with seeded data (`FEAT-017`); smoke script.
  3. Per-area guides (`bot/AGENTS.md`, `api/AGENTS.md`, `dashboard/AGENTS.md`), updated readme, CHANGELOG.
  4. Memory records: decisions, dependencies, scope history updated; handoff refreshed.
- **Acceptance evidence**: `npm run verify` output from a clean clone; docs match shipped commands; CHANGELOG
  lists closed IDs; no stale statement about current behaviour.
- **Stop condition**: a check needs credentials not present — mark it as an activation input and keep the rest.

## WP10 — Additive feature set

- **Owner**: split by area (bot/api/ui). **Depends on**: WP5, WP6, WP9. **Gate**: G10.
- **Requirements**: FEAT-004, FEAT-005, FEAT-006, FEAT-008, FEAT-009, FEAT-010, FEAT-011.
- **Tasks**: slash commands as aliases; per-guild settings; cooldowns/quiet channels; weather geocoding,
  units and forecast; giveaway digest filters; quote management; analytics charts.
- **Acceptance evidence**: one test per feature; the full REG regression still passes; message commands keep
  working; no existing page or action removed.
- **Stop condition**: any feature would remove or rename a preserved behaviour — stop and require a decision.

---

## Cross-cutting execution rules

1. One work package per branch/change set; do not mix WP2 migrations with WP7 UI work in one review.
2. Each task records failing-before evidence for fixes and a stated oracle for new tests.
3. Contracts are updated in the same change as the behaviour; a contract change without a code change must
   say why.
4. Every gate closure cites an evidence file path with revision, environment and observed output.
5. Context checkpoints at each milestone: update `docs/memory/08_FRESH_CHAT_HANDOFF.txt`, `data/gates.json`
   and the tracker, then start the next package from the records — not from memory of the chat.
6. Continue authorised work autonomously until the package's acceptance criteria are met; stop only for a
   genuine missing requirement, a failed safety check, or an action outside authority.
7. Cleanup at each checkpoint: remove regenerable build output, keep evidence, report measured sizes.

## What "done" means

WP9's gate `G9` is the release gate: all launch requirements verified, all later requirements explicitly
outstanding, all assumptions either confirmed or recorded as blockers, and the evidence paths present. The
plan stays active in `docs/planning/operations/` until then; it is not archived because planning is finished.

---

## 2026-11-19 — Remaining work (reconciliation + ordered exit plan)

This section answers "what is left to do" from the authoritative records as of 2026-11-19. It is planning
only: no source, gate, record, workbook, commit, deployment, credential or live-service change is made
here. Later work continues from the records, not from chat memory.

### Reconciliation: late rollout evidence vs stale gate narratives

- Current (dated 2026-11-18) evidence: WP0 installed the five skills and passed the seven-check matrix on
  OpenCode v2.3.2 (G1/G2); the final image was pushed and anonymously pullable; exact-SHA chart checks ran
  at `217f24f…` (45 unittests, 30 charts/31 HelmReleases, credential scan and render pass) and the owner
  promoted `validated`; the pinned image runs with pod ready, 0 restarts, in-pod `/health` OK; a qualified
  mode-0600 backup with offline restore and a recorded prior-digest rollback target exists. Sources:
  `docs/planning/evidence/2026-11-18-harness-and-registry.md`, `2026-11-18-flux-rollout.md`,
  `2026-11-18-production-backup-receipt.json`, handoff §10–§11.
- Stale narratives that must not be read as current: `data/gates.json` G9 still says "no registry
  credentials… nothing was pushed or deployed"; `docs/planning/evidence/2026-11-18-final-local.md` still
  says "G1/G2 still not_passed"; `docs/deploy/FLUX-DEPLOY.md` header still says "candidate preparation
  only". The dated 11-18+/handoff §11 evidence supersedes these phrases. These files are **not** edited by
  this plan; the reconciliation is recorded here.
- Gate states are unchanged by that rollout: G0–G2 passed, G3 retired, G4–G6 `passed_local`, G7
  `partial_local`, G8–G11 `not_passed`, independent reviewer sign-off open. A deployment observation or
  `/health` OK is not gate closure (DEC-028, DEC-029). Do not redo the completed install, push, rollout or
  backup.

### T0 — First task: non-mutating end-to-end live service path (operator, read-only)

- **Depends on**: nothing. **Owner**: operator/reviewer. **Exit**: one evidence file recording, with
  revision/environment/observer and observed status for each read: LAN ingress TLS
  `https://ruckus.branconet.lan/` (certificate/hostname, HTTP status), dashboard page shell and
  `/api/bot-status` (anonymous 401 is the expected admin-only result; no sign-in), heartbeat freshness from
  already-recorded read-only observations, and `/ready` readiness 200/503 (FIX-037/OPS-003). Correlate with
  the recorded in-pod `/health` OK; do not claim more than was read.
- **Stop**: if TLS, auth or a probe blocks a read, record the exact unverified item rather than working
  around it. **Boundary**: no credentials requested or used, no login, no DB read or mutation, no secret,
  and no message sent. Test-guild interaction (using a token or posting commands) needs separate explicit
  owner authorization; private-guild message content is out of scope entirely (DEC-015/SEC-008).

### P1 — Migration, role/session/CSRF and richer dashboard/logging gaps

- **Owner/deps**: implementer-api for migration + role/session/CSRF (WP2/WP3); implementer-ui for richer
  dashboard/logging (WP6/WP7); depends on T0 and an owned fixture. **Gates**: G11, G5, G7.
- **Exit**: G11 — fresh owned MySQL 8.4 initialises from migrations `0001/0002/0003` with no manual SQL,
  re-run is a no-op, pre-migration schema is adopted idempotently, paging `0/-1/abc/101/1000000000` returns
  400, retention prunes seeded rows (DEC-026/031; ASM-003 confirmation). G5 — complete role model, sessions
  and CSRF behind the production ingress, admin-only `/metrics` (DEC-025), route/role matrix green, no hash
  leak. G7 — rich filters, role model views and structured JSON logs surfaced in the log explorer; keyboard
  and contrast re-measured against the current source, not the stale PNGs (DEC-030).
- **Stop**: no owned fixture or production-dump decision (ASM-003) — keep G11 unpassed with the exact
  missing input. Do not recount the retained 75 API / 31 bot / 23 dashboard or 28 browser checks as new
  tests; add only tests for these gaps.

### P2 — Missing bot fixes (implementer-bot, WP5, G6)

- **Exit**: FIX-015 weather (both documented forms, encoding, 5 s timeout, exact preserved error strings),
  FIX-016 free-games (one message, ≤10 entries, 5,500-char budget, deterministic order), FIX-017 profanity
  (bundled list, TTL refresh, last-known-good, fail-closed, no outbound call for ordinary messages), with
  success/empty/malformed/timeout/5xx fixtures; no "undefined" output and full REG-001…014 regression green.
- **Stop**: upstream shape change — capture a sanitized fixture. No live Discord token or weather key used
  here; OPENWEATHERMAP_API_KEY/quota stays ASM-006.

### P3 — Operations: rollout/rollback/alert/restart, staged and non-production (operator, WP8, G8)

- **Exit**: execute once in a staged fixture — rollback to the already-recorded digest
  `sha256:f63dd607…` using the qualified mode-0600 backup receipt (do not recreate either), one alert fire
  and one recovery, restart job (FIX-021/REG-011) success within 20 s and a readable failure without a
  process manager, and `/ready` 200/503. **Stop**: live restore remains disabled until an owned fixture
  exists (DEC-026); no live data, no production mutation.

### P4 — Source-to-image reproducibility, commit constraints, publisher repair (infrastructure owner)

- **Exit**: record the exact source revision that produced the deployed digest `45c942c9…` (working tree is
  currently at local HEAD `751c44c` with WP1–WP9 source uncommitted), verify a clean-clone rebuild at that
  revision reproduces the digest, and keep commit constraints: one change set per WP, no commit/push by this
  planning task, future commits owner-authorised, no second checkout or dependency copy. Separately, the
  named infrastructure owner resolves `wsl_path_failed` / `native_wsl_exact_sha_required` and the missing
  native WSL charts clone under the existing checkout rules so the standard publisher path works; the
  owner's one-off exact-SHA promote was not a bypass or a replacement of that policy.
- **Stop**: do not clone the charts repo or change the Flux controller for this planning task; no new push
  or deployment is authorised here.

### P5 — Gate closure G8–G11 with independent reviewer sign-off

- **Owner/deps**: G8/G9 operator, G10 reviewer, G11 implementer-api; depends on P1–P4. **Exit**: each gate
  cites an evidence path with source revision, environment and observed output and is signed by a reviewer
  independent of the implementer; G9 additionally needs the clean-clone commit↔digest record (P4) and a
  CHANGELOG of closed IDs. No synthetic, focused or deployment-only observation closes a gate (DEC-028/029).
- **Stop**: any gate without that evidence stays `not_passed`; the plan stays active.

### P6 — WP10 additive features (split by area, WP5/WP6/WP9 → G10)

- **Order/IDs**: FEAT-004 slash aliases, FEAT-005 per-guild settings, FEAT-006 cooldowns/quiet channels,
  FEAT-008 weather geocoding/units/forecast, FEAT-009 digest filters, FEAT-010 quote management, FEAT-011
  analytics charts. **Exit**: one acceptance test per feature, full REG regression green, message commands
  still work. **Stop**: any feature that removes or renames a preserved behaviour needs a recorded decision
  and owner approval (DEC-002).

### P7 — Minimal owner decisions and preserved scope

- Confirm only ASM-008 (restore GPLv3 `LICENSE` or correct the claim — FIX-028/WP1) and ASM-006 (weather key
  and quota — WP5/WP10); keep ASM-001/002/003 recorded, not re-requested. No credential or login request.
- All REG-001…014 behaviours remain unchanged (DEC-002, DEC-021); the 14 must still be demonstrated at G9.
  Do not double-count test sets (156/129, 28, 23, 46 are distinct), do not redo completed rollout/backup,
  and do not conflate gates with deployment.

**Routine check performed**: `python3 -B docs/operating-kit/scripts/check_planning_package.py` → 17 checks,
0 failures (73 links, 31 decisions). Known gap left for an authorised docs revision: the 2026-11-16
snapshot in `docs/planning/validation-report.md` still quotes 50 links / 24 decisions, now stale.
