# ruckus_bot — local agent guide

This repository is a full-stack Discord bot (bot + REST API + Next.js dashboard).

## Read in this order

1. `MEMORY.md` — durable project decisions and memory index.
2. `docs/memory/08_FRESH_CHAT_HANDOFF.txt` — current task, authority and completion criteria.
3. `docs/planning/operations/00_START_HERE.md` — active plan, artifact map, reading order.
4. `data/requirements.json`, `data/decisions.json`, `data/gates.json` — canonical records.
5. `docs/operating-kit/RULES.md` — shared engineering rules for this project.

## Working rules

- Shared WSL storage, cleanup and memory rules from `/home/brajam/repos/AGENTS.md` apply.
- Work in this checkout; do not add clones, worktrees or dependency copies to continue a chat.
- Do not remove or silently change an existing user-visible feature. Behaviour changes require a
  recorded decision in `data/decisions.json` and the affected requirement IDs.
- Generated output (builds, caches, screenshots, DB volumes) belongs outside the tracked tree;
  keep the working tree free of `node_modules/` and `.next/` additions.
- Every authored function (including tests) gets a short comment describing purpose, inputs,
  outputs, side effects and failure behaviour. Match the existing style of the file.
- Search before creating: reuse an existing module/route/utility, or record why extraction is
  justified.
- Local verification only. Do not add CI providers, deployments or live-service mutations
  without explicit authorization.

## Current state (2026-11-16)

Planning baseline is `main@711ff12`. The repository is unmodified apart from the planning
artifacts added by this planning revision. Implementation is **not** authorized by the planning
package; see `docs/planning/evidence/` for the baseline review evidence and
`docs/planning/operations/07_IMPLEMENTATION_ROADMAP.md` for the executable work packages.
