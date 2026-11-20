# Template — bot area guide (`bot/AGENTS.md`)

Copy to `bot/AGENTS.md` when WP4 starts, replacing placeholders. Keep it under two screens.

## Purpose

What this area does in one paragraph: receives Discord events, dispatches commands, calls providers, writes
events and heartbeats.

## Entrypoints

| File | Role | Owner |
| --- | --- | --- |
| `src/index.js` | process bootstrap, client, shutdown | implementer-bot |
| `src/core/dispatcher.js` | pipeline order, dedupe, cooldowns | implementer-bot |
| `src/core/registry.js` | command metadata → help/slash | implementer-bot |
| `src/modules/commands/*` | one command per file | implementer-bot |
| `src/modules/providers/*` | cached external clients | implementer-bot |
| `src/modules/db/*` | event queue, heartbeat | implementer-bot |

## Allowed dependencies

`core → modules/providers`, `core → modules/db`, `commands → core (context only)`. Commands never import other
commands and never read `process.env`.

## Rules specific to this area

- One reply per message; return `true` when consumed.
- Never send an empty string or empty embed.
- Provider calls only after the trigger matched; cache TTLs documented per provider.
- Preserve exact reply strings listed in `docs/planning/contracts/command-contract.md`.

## Local commands

| Command | Mutates? | Purpose |
| --- | --- | --- |
| `npm test` | no | unit + handler fixtures |
| `npm run lint` | no | static checks |
| `node --test test/commands/*.test.js` | no | one command's fixtures |
| `npm run smoke:bot` | no (network) | provider reachability report |

## Test oracles

List each permanent test and the requirement it protects; state the oracle in one line.

## Troubleshooting

Common failures: missing privileged intent, invalid token, provider timeout, database unavailable. Each has
one line here and a full entry in `06_SECURITY_AND_OPERATIONS.md` §8.

## References

`docs/planning/contracts/command-contract.md`, `docs/planning/contracts/data-model.md`,
`docs/operating-kit/RULES.md`, `data/requirements.json`.
