# 04 — Skills, agent guides and development memory

The project must stay maintainable by people and LLM agents who did not write it. This document defines the
operating kit: one shared policy, four role cards, five proposed skills, local guide templates, memory rules
and the harness checks that must pass before application scaffolding.

Nothing here is installed. Complete skill bodies live in `docs/operating-kit/skill-designs/<id>/SKILL.md`
and become active only in **WP0** after authorisation (`G1`).

## 1. Ownership model

| Role | Owns | Does not |
| --- | --- | --- |
| Integrator | Shared rules, records, plan status, path map, reconciliation of concurrent edits, memory index | Write feature code without a work package |
| Implementer (bot / api / ui) | One area's feature code, local tests, local guides | Change shared policy, close gates, install skills |
| Reviewer | Independent verification against acceptance criteria and contracts; test quality | Rewrite the implementation silently |
| Operator | Deployment, backups, monitoring, incidents, release/rollback evidence | Redesign features during an incident |

One integrator is authoritative for shared indexes. Concurrent agents own separate task records under
`docs/memory/tasks/<task-id>.md`; overlaps are reconciled by the integrator before a gate is closed.

## 2. Proposed skills

Each skill has a single purpose, triggers on a class of task, and points at authoritative files rather than
restating policy. Full bodies are installable as written.

| Skill id | Triggering description (frontmatter text) | Purpose | Primary references |
| --- | --- | --- | --- |
| `ruckus-command-change` | Use when adding, changing or debugging a Discord command, passive bot reaction, provider call or reply behaviour in ruckus_bot. | Keep command behaviour registered, deduplicated, awaited and tested | `contracts/command-contract.md`, `02`, `data/requirements.json` |
| `ruckus-api-change` | Use when adding or changing an HTTP route, database query, migration, session/role rule or error shape in the ruckus_bot API. | Preserve auth, validation, paging and data invariants | `contracts/api-contract.md`, `contracts/data-model.md`, `contracts/session-contract.md` |
| `ruckus-dashboard-change` | Use when changing the ruckus_bot dashboard UI, its server proxies, session forwarding, polling or accessibility. | Keep the UI live, authenticated, accessible and self-hosted | `05`, `contracts/session-contract.md`, `contracts/api-contract.md` |
| `ruckus-release-verify` | Use when preparing, verifying or rolling back a ruckus_bot release, image build or compose stack change. | Produce reproducible evidence before and after a release | `06`, `docs/planning/operations/07`, `data/gates.json` |
| `ruckus-ops-recovery` | Use when the ruckus_bot is offline, the database is unreachable, login is locked out or data must be restored. | Diagnose and recover within the documented authority | `06` runbooks, `contracts/session-contract.md`, `data/assumptions.json` |

Shared workflow body (all skills, in order):

1. Read `AGENTS.md`, `MEMORY.md`, the handoff, then the specific contract and requirement IDs.
2. Confirm the current revision and that the task is authorised by a work package; stop and ask only for a
   genuinely missing requirement or an action outside authority.
3. Search for an existing function/route/component before creating one; record the reuse or the reason for
   extraction.
4. Make the smallest change that satisfies the requirement; keep existing user-visible behaviour unless a
   decision record changes it.
5. Add or update the permanent test that protects the requirement; state the observable oracle.
6. Update the local guide and any affected canonical record (decision, dependency, assumption).
7. Run the layer's verification command; record what ran and its result. Do not claim a gate you did not
   execute.
8. Report changed paths, requirement IDs, checks, and remaining limits.

Permission boundaries common to all five: no secret disclosure, no dependency installation outside the
lockfile flow, no production mutation without the operator role, no skill or CI installation, no removal of
a feature, no fabricated evidence.

Representative evaluation cases (each skill also has 3 specific cases in its body):

- **Reuse check**: a request to add "a new reminder command" must be matched against the registry and
  rejected as duplicate if an equivalent exists.
- **Contract drift**: a request that changes a reply string must surface the affected `REG-*` ID and require a
  decision before editing.
- **Evidence honesty**: a task with no Discord token must record the gateway path as unverified, not passed.

## 3. Agent guide templates

Root `AGENTS.md` (exists) holds reading order, shared rules and current-state pointer. Feature templates in
`docs/operating-kit/feature-guides/`:

- `bot-area.AGENTS.md` — module map, dispatch order, registries, provider rules, fixtures, verification.
- `api-area.AGENTS.md` — route table, auth matrix, validation, migrations, error envelope, verification.
- `dashboard-area.AGENTS.md` — route groups, session flow, polling, tokens, accessibility, verification.

Each template requires: purpose, entrypoints, data owned, allowed dependencies, local commands (read vs
mutating clearly separated), test oracles, troubleshooting, and links to the authoritative contracts.
Guides are created beside real areas during implementation, not now.

## 4. Shared rules

`docs/operating-kit/RULES.md` is the one authoritative engineering policy: scope control, reuse, comments on
every authored function, error handling, logging, security defaults, testing quality, documentation, and
storage/cleanup. Role cards reference it; they do not copy it.

## 5. Development memory

- `MEMORY.md` — short index of durable decisions; links to `data/decisions.json`.
- `docs/memory/README.md` — note format and rules (created by the repository memory helper).
- `docs/memory/08_FRESH_CHAT_HANDOFF.txt` — paste-ready continuation.
- `docs/memory/tasks/<task-id>.md` — one file per concurrent task with owner, work package, requirement IDs,
  state, blockers and evidence links.
- Canonical facts live in `data/*.json`; memory never overrides them. No secrets, transcripts or raw logs.
- Supersession: a changed decision is added with `supersedes` and the old record gets `superseded_by`; nothing
  is rewritten in place.

Reconciliation rules: the integrator merges task records at each milestone, re-reads the current revision,
quotes conflicting edits, and records the resolution with its authority. A stale handoff is replaced, not
appended to.

## 6. Harness compatibility

Observed on this machine (2026-11-16):

| Harness | Version | Status |
| --- | --- | --- |
| OpenCode | `v2.3.0` | Available; checks not yet executed (`G2` not passed) |

Conventions are verified at installation time, not assumed from another repository. Required evidence:

| Check | Procedure | Pass condition |
| --- | --- | --- |
| Skill discovery | Start a fresh session in the repository and ask for the available skills | All five ids listed with their descriptions |
| Explicit reference | Invoke `ruckus-command-change` by name | Body is loaded and its reading order is followed |
| Natural triggering | Ask "add a `/uptime` command" without naming a skill | `ruckus-command-change` is selected |
| Nested guidance | Enter `bot/` and ask about reply dedupe | Local `bot/AGENTS.md` is read in addition to root rules |
| Permissions | Attempt a forbidden action (edit outside the checkout) | Blocked or requires explicit approval per configured policy |
| Concurrent ownership | Run two tasks touching separate areas | No shared-file overwrite; task records remain separate |
| Fresh-session continuity | New session with only the handoff | Reads records, names the next task and requirement IDs |

Installation destination after approval: `.opencode/skills/<skill-id>/` (verify the current discovery path
first). Installation itself is WP0.

## 7. Skill index and change control

- New skill requires: a repeated task class, a distinct workflow, no overlap with an existing skill, and an
  evaluation case. Otherwise extend an existing skill.
- Retiring a skill requires recording where its guidance moved.
- The integrator keeps this table as the index; installed copies must match their designs at install time.
