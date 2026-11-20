# 01 — Master plan

## 1. Product

**ruckus_bot** is a self-hosted Discord bot with a web dashboard. A Discord community adds the bot to a
guild; members use short message commands (coin flip, weather, free-game giveaways, jokes), receive an
in-character random quote when they mention the bot, and trigger passive running gags (word chain,
profanity insult, owner easter egg). The operator monitors the bot from a private dashboard: online state,
connected guilds, login events, user interactions and a restart button.

The upgrade described here keeps that product and makes it **safe to expose, correct to operate and
pleasant to use**, then adds a small set of capabilities the current design clearly implies but does not
deliver: live status, log exploration, user management, slash commands and per-guild settings.

## 2. Users and outcomes

| User | Goal | Current obstacle | Outcome after this plan |
| --- | --- | --- | --- |
| Guild member | Get a quick answer from a command | Some documented commands do not work; jokes fire unrequested; repeated spam from giveaway/insult handlers | Every documented command works, replies once, respects cooldowns |
| Guild owner/admin | Control what the bot does in their server | No prefix, channel or feature control | Per-guild feature switches, quiet channels, prefix, units |
| Bot operator | Know the bot is alive and fix problems | Dashboard always says "offline"; no logs UI; restart is an unauthenticated shell call | Live heartbeat, log explorer, safe restart with job state, alerts |
| Maintainer / agent | Change the code safely | No tests, no lint, committed dependencies, hidden contracts | Handler contract, registry, migrations, local verification suite, guides |
| Repository owner | Keep the project credible | Missing licence, invalid setup docs, vulnerable dependencies, stale runtime | Valid setup, supported runtime, clean audit, restored licence |

Explicit non-users: the dashboard is not a public product, has no self-service signup, and no SEO or
marketing surface. Customer-facing billing, multi-tenancy and AI features are out of scope.

## 3. Scope

### 3.1 Launch scope (must ship together)

Grouped by requirement prefix; every item has acceptance criteria in `data/requirements.json`.

1. **Preserve** all 14 existing behaviours (`REG-001`…`REG-014`), including the single-image deployment
   and the compose development stack.
2. **Repair** the 40 verified defects (`FIX-001`…`FIX-040`), including the five that break the product
   outright: no API auth, frozen bot status, account-creation lockout, empty N-chain message, ignored
   `MYSQL_PORT`.
3. **Harden** (`SEC-001`…`SEC-010`): sessions and RBAC, password policy, CSRF, validation, dependency
   gate, least-privilege database user, retention/privacy, abuse limits, image hygiene.
4. **Operate** (`OPS-001`…`OPS-010`): supported runtime and database, reproducible non-root image, health
   and readiness, graceful shutdown, structured logs, backups and restore drill, alert runbook, release
   and rollback evidence, migrations, capacity targets, incident ownership.
5. **Add the dashboard features the product already implies**: live status (`FEAT-001`), log explorer
   (`FEAT-002`), user management (`FEAT-003`), cached integrations (`FEAT-007`), responsive accessible
   theme (`FEAT-015`), config validation (`FEAT-016`).
6. **Document** setup, per-area guides and change log (`DOC-001`…`DOC-004`).

### 3.2 Later scope (designed, not required for the first release)

Slash commands (`FEAT-004`), per-guild settings (`FEAT-005`), cooldowns and quiet channels (`FEAT-006`),
weather upgrade (`FEAT-008`), giveaway digest filters (`FEAT-009`), quote management (`FEAT-010`),
analytics charts (`FEAT-011`), per-guild health (`FEAT-018`).

These are additive and explicitly delayed so the launch slice stays reviewable. Nothing in the later set
removes a launch feature.

### 3.3 Exclusions

- No rewrite in another framework or language; no ORM; no message queue; no Kubernetes manifests.
- No removal of the Uncle Ruckus persona, quotes, disclaimer or demo assets (`DEC-021`).
- No GitHub Actions or hosted CI (`DEC-020`).
- No paid provider tier is required; if a weather quota is insufficient, the plan degrades to a clear
  configuration message rather than a purchase.
- No public hosting, domain purchase, legal review or marketing work.
- No migration of an unknown production database without a dump (`ASM-003`).

## 4. Selected architecture and decisions

Full records with rejected alternatives and reconsideration triggers: `data/decisions.json`. Summary:

| ID | Decision | Why | Main tradeoff |
| --- | --- | --- | --- |
| DEC-001 | Baseline = `main@711ff12`; reuse verified parts of the Oct-2026 maintenance branch | The owner pulled `main`; the branch is unmerged and contains infrastructure-specific files | Loses that branch's Kubernetes/publish tooling from scope |
| DEC-002 | Fix-first, additive-only | Owner constraint | Some awkward existing behaviour (persona, help format) is retained deliberately |
| DEC-003 | Node 26.13.1 LTS, fallback 24.22.3 | Node 18 is EOL; 26 is Active LTS to 2027-10 | Very new runtime for native modules; fallback recorded |
| DEC-004 | MySQL 8.4 LTS + mysql2 | 5.7 and 8.0 are EOL; 8.4 supported to 2029 | Requires a schema/data upgrade path from 5.7 |
| DEC-005 | Express 4.22.3 + express.json + pinned proxy-addr | Keeps routes, removes audited 4.18 issues | Not the newest major |
| DEC-006 | Server-side sessions in MySQL | LocalStorage is not auth; no external IdP requested | One more table and session cleanup |
| DEC-007 | Next 16.4.6 + React 19.3.1 | Next 14.2.7 has critical advisories | Migration effort; cache semantics must be verified |
| DEC-008 | mysql2 in the bot | mysql v2 cannot auth to MySQL 8 (measured) | Touches every bot module that logs |
| DEC-009 | One command context/dispatcher | Fixes signature drift, dedupe and error handling in one place | Refactor of all handlers |
| DEC-010 | Registry-driven help/slash/cooldowns | Removes hardcoded bot id and drifted help | Small upfront abstraction |
| DEC-011 | Message commands stay; slash commands additive | Owner constraint | Two entry points to maintain |
| DEC-012 | Browser → Next → API only | Keeps API private; session handling server-side | Slightly more server code |
| DEC-013 | Validated config per process | `MYSQL_PORT` is documented but ignored today | Startup fails without required env |
| DEC-014 | Numbered SQL migrations | Two small tables; no ORM needed | Hand-written migration discipline |
| DEC-015/016 | Structured logs, explicit retention | Operator needs correlation; table is unbounded | Privacy switch to document |
| DEC-017 | `node:test` + HTTP contract tests | No new infrastructure | No browser E2E in the base suite |
| DEC-018 | Keep single supervisor image | Preserves the documented deployment | One image runs three processes |
| DEC-019 | Keep current free providers with caching/fallback | Already integrated | Dependent on third-party availability |
| DEC-020 | Local verification only | Owner brief | No hosted CI signal |
| DEC-023 | Keep three packages, add root scripts | Minimal churn | No shared workspace tooling |
| DEC-024 | Remove stray files unless claimed | They are unreferenced and broken | Owner may reclaim before WP1 |

## 5. Quality bar and success criteria

The plan is successful when all of the following have **evidence**, not assertions:

1. A clean clone builds the image with `npm ci` and no committed `node_modules` (`G4`).
2. `npm audit --omit=dev` reports zero critical/high findings in all three packages at the release commit.
3. Every API route is covered by a role matrix test; anonymous access is rejected (`G5`).
4. The dashboard shows a real bot heartbeat and flips to offline within 90 s of the bot stopping, without a
   rebuild (`G7`).
5. All 14 preserved behaviours pass an automated or scripted manual check; the N-chain never sends an empty
   message (`G6`).
6. A fresh empty MySQL 8.4 instance is initialised by migrations with no manual SQL (`G2`).
7. Restore drill, restart job, offline alert and rollback are each executed once and recorded (`G8`).
8. `npm run verify` passes locally from a clean checkout (`G9`).

Latency, capacity and uptime numbers below are **targets**, not measurements, until WP8 records them.

## 6. Initial scale and growth

| Dimension | Initial target | Evidence before scaling |
| --- | --- | --- |
| Guilds | ≤ 50 | Heartbeat + guild list size, memory RSS |
| Messages | ≤ 20/min sustained, 100/min burst | Queue depth, command latency p95 |
| Dashboard users | ≤ 5 concurrent operators | Session count, API p95 |
| Log volume | ≤ 50k rows/day | Table size, prune duration |
| Retention | 30 d interaction / 180 d aggregate | Disk growth measurement |

Growth trigger: sustained > 200 msg/min, > 500 guilds, or p95 command latency > 800 ms would justify
sharding, a queue or a managed database — none of which belong in this scope.

## 7. Cost

Editable model: `data/cost-model.xlsx`. Basis: single Hetzner Cloud Regular Performance host from
EUR 5.49/month excl. VAT (quoted 2026-11-16), one small domain, backup storage, and labour at a stated
internal rate. Discord, JokeAPI, gamerpower, purgomalum/evilinsult are free; OpenWeatherMap has a free
plan whose exact quota is an activation input (`ASM-006`). The low/base/high scenarios and every unknown
are itemised in the workbook and summarised in `06_SECURITY_AND_OPERATIONS.md` §9.

## 8. Risks and mitigations

| Risk | Impact | Mitigation | Trigger to revisit |
| --- | --- | --- | --- |
| No Discord token/intents during implementation | Bot gateway work cannot be verified | Mocked handler tests now; live check as an explicit gate item | Token still absent at WP4 exit |
| Unknown production data | Migration could lose history | `ASM-003` dump requirement; `0001` adopts the existing schema | No dump before WP2 |
| Next 14→16 migration surprises | Dashboard unstable | Pin and verify cache/route behaviour per version (`DEC-007`, `FIX-002`) | Two failed migration attempts |
| Provider change/outage | Commands fail | Cache + last-known-good + explicit failure lines | Upstream schema change |
| Persona content sensitivity | Reputational | Preserve disclaimer; no new persona content in scope | Owner request |
| Scope creep into later features | Launch slips | Launch/later split in §3 and gates in `07` | Owner reprioritises explicitly |
| Single host failure | Bot offline | Documented restore drill; alerting; no redundancy claim | Uptime requirement stated |

## 9. What this package does not do

It does not change application code, install skills, create a production environment, purchase anything,
merge branches or deploy. That boundary is recorded as `SH-004` and verified in
`docs/planning/validation-report.md`.
