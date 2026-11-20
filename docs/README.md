# Documentation index

| Area | Path | Purpose |
| --- | --- | --- |
| Project introduction | [`../readme.md`](../readme.md) | Original project readme plus a link to this plan |
| Agent entrypoint | [`../AGENTS.md`](../AGENTS.md) | Reading order and working rules for assistants and maintainers |
| Repository memory | [`../MEMORY.md`](../MEMORY.md) | Durable decisions index |
| Planning status | [`planning/README.md`](planning/README.md) | Current planning status, scope amendments, validation report |
| Active plan (00–07) | [`planning/operations/`](planning/operations/) | The single active execution plan, in reading order |
| Contracts | [`planning/contracts/`](planning/contracts/) | Exact command, API, data and session behaviour |
| Evidence | [`planning/evidence/`](planning/evidence/) | Executed checks tied to the baseline revision |
| Operating kit | [`operating-kit/`](operating-kit/) | Shared rules, role cards, feature-guide templates, skill designs |
| Development memory | [`memory/`](memory/) | Current state and the fresh-chat handoff |
| Research | [`research/`](research/) | Source-backed technical notes and selection rationale |
| Visuals | [`visuals/`](visuals/) | Exact diagrams, concept mockups and the visual manifest |
| Canonical records | [`../data/`](../data/) | Requirements, decisions, dependencies, assumptions, sources, scope history, gates, workbooks |

## Reading order for a fresh session

1. `../AGENTS.md`
2. `../MEMORY.md`
3. `memory/08_FRESH_CHAT_HANDOFF.txt`
4. `planning/operations/00_START_HERE.md` (then 01…07)
5. `../data/requirements.json` and `../data/decisions.json` before changing behaviour

## Existing project documentation

- `buildimage.md` — historical Docker buildx publication notes.
- `localtesting.md` — historical, partly outdated local setup notes; superseded by
  `planning/operations/06_SECURITY_AND_OPERATIONS.md` (development runbook) and the
  `03_ARCHITECTURE_AND_REPOSITORY.md` path map.
