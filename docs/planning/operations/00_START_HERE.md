# 00 — Start here

## Purpose

This is the single active planning package for **ruckus_bot**, a Node.js Discord bot with an Express API
and a Next.js operator dashboard. It turns the baseline review of 2026-11-16 into an executable plan that
fixes verified defects, hardens the service and adds new features **without removing any existing
user-visible behaviour**.

The owner asked for: pull and set up the repository, inspect it, find what is broken, suggest
improvements and new features, fix current issues, and then build a project-planning package. This package
is the result. Application code was **not** modified: the planning brief authorises research, design and
planning artifacts, not production implementation.

## Current baseline

| Item | Value |
| --- | --- |
| Repository | `https://github.com/jtmb/ruckus_bot` |
| Revision | `main` @ `711ff12` (2026-09-09) |
| Working checkout | `/home/brajam/repos/ruckus_bot` |
| Local verification | MySQL 8.0 container, API on 3003, dashboard on 18080, mocked bot handlers, headless browser capture |
| Review evidence | [`evidence/2026-11-16-baseline-review.md`](../evidence/2026-11-16-baseline-review.md) |
| Planning date | 2026-11-16 |
| Prior work reused | `origin/codex/production-source-maintenance-20261027` (dependency pins, `.dockerignore`, supervisor production commands) — not merged, not treated as the baseline (`DEC-001`) |

## What is wrong today (summary)

- **Critical security**: no authentication or authorisation on any API route; anonymous password change
  reproduced; bcrypt hash returned in the login response; dashboard "auth" is a `localStorage` flag.
- **Broken dashboard data**: `/api/bot-status` is prerendered at build time, so the dashboard always shows
  the bot as offline; `/api/check-admin` calls a non-existent API path; account creation is permanently
  disabled after the first admin.
- **Broken bot behaviour**: `!flipacoin` is not marked handled; the N-chain sends an empty message that
  Discord rejects (measured unhandled rejection); jokes fire without a mention; the documented
  `!weather in <city>` form is not implemented; the profanity feature fetches a 205-term list on every
  message and fails open if the fetch fails.
- **Data foundation**: `MYSQL_PORT` is ignored; a fresh install has no `bot_logs` table; log paging has no
  ordering and returns 500 on bad input; the bot's MySQL driver cannot authenticate to MySQL 8; log writes
  are unbounded and fire-and-forget.
- **Supply chain**: 5,290 committed `node_modules` files, Node 18 (EOL 2025-04-30), MySQL 5.7 (EOL
  2023-10-31), and 27 critical/high `npm audit` findings across the three apps.
- **Docs and setup**: the readme's compose example is invalid YAML, the licence file is missing, and
  `pagination.js` / `page.js.old` are unowned leftovers.

Full detail, exact commands and measured output: `evidence/2026-11-16-baseline-review.md`.

## Reading order

| Order | Document | Use it for |
| --- | --- | --- |
| 1 | [`01_MASTER_PLAN.md`](01_MASTER_PLAN.md) | Scope, selected stack, rationale, tradeoffs, launch/later boundary |
| 2 | [`02_DOMAIN_AND_PRODUCT_CONTRACTS.md`](02_DOMAIN_AND_PRODUCT_CONTRACTS.md) | Exact workflows, states, invariants, API/data links |
| 3 | [`03_ARCHITECTURE_AND_REPOSITORY.md`](03_ARCHITECTURE_AND_REPOSITORY.md) | Components, diagrams, feature ownership, **effective path map** |
| 4 | [`04_SKILL_AND_AGENT_DESIGNS.md`](04_SKILL_AND_AGENT_DESIGNS.md) | Skills, agent guides, roles, memory, harness checks |
| 5 | [`05_DESIGN_AND_ACCESSIBILITY.md`](05_DESIGN_AND_ACCESSIBILITY.md) | UI system, inspected mockups, states, accessibility |
| 6 | [`06_SECURITY_AND_OPERATIONS.md`](06_SECURITY_AND_OPERATIONS.md) | Threats, configuration, delivery, monitoring, recovery |
| 7 | [`07_IMPLEMENTATION_ROADMAP.md`](07_IMPLEMENTATION_ROADMAP.md) | Work packages, owners, gates, stop conditions |
| 8 | [`../../memory/08_FRESH_CHAT_HANDOFF.txt`](../../memory/08_FRESH_CHAT_HANDOFF.txt) | Paste-ready continuation prompt |

Supporting records: `data/requirements.json` (96 requirements), `data/decisions.json` (24 decisions),
`data/dependencies.json`, `data/assumptions.json`, `data/sources.json`, `data/scope-history.json`,
`data/gates.json`, `data/work-packages.json`, `data/acceptance_tracker.xlsx`, `data/cost-model.xlsx`.

Detailed contracts: [`../contracts/command-contract.md`](../contracts/command-contract.md),
[`../contracts/api-contract.md`](../contracts/api-contract.md),
[`../contracts/data-model.md`](../contracts/data-model.md),
[`../contracts/session-contract.md`](../contracts/session-contract.md).

## Authority and boundaries

- Current owner instruction (2026-11-16) governs: review, improve, add features, fix defects, do not remove
  current features without permission, then plan.
- `planning-specification.md` (project-planning skill) governs the package contents and states that planning
  does **not** authorise implementation, skill installation, purchases or deployment.
- Shared storage/cleanup/memory rules from `/home/brajam/repos/AGENTS.md` apply to generated output.
- Nothing in this package grants permission to change the running service, merge the maintenance branch,
  install skills or deploy.

## Immediate next step

**WP0** in [`07_IMPLEMENTATION_ROADMAP.md`](07_IMPLEMENTATION_ROADMAP.md): review and authorise the four
proposed skills and three feature guides in `docs/operating-kit/`, install them into the selected harnesses,
and record the harness compatibility matrix. Only after that gate do WP1+ touch application code. The exact
handoff text is in `docs/memory/08_FRESH_CHAT_HANDOFF.txt`.

**Current work order (2026-11-19):** WP0 installation/harness, the image push and the Flux rollout/backup
are already recorded as complete — do not repeat them. For the reconciled late-rollout evidence, the first
non-mutating live-service check, and the ordered remaining work (G11/G5/G7 gaps, bot fixes, staged ops,
source-to-image/publisher repair, G8–G11 sign-off, WP10, owner decisions), see
[`07_IMPLEMENTATION_ROADMAP.md` § "2026-11-19 — Remaining work"](07_IMPLEMENTATION_ROADMAP.md).

## Artifact map

The authoritative routing table (path, purpose, owner, authoritative source, derived views) is in
[`03_ARCHITECTURE_AND_REPOSITORY.md` §7](03_ARCHITECTURE_AND_REPOSITORY.md). It is not duplicated here.
