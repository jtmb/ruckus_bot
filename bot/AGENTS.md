# Area guide — `bot/`

OpenCode loads this file automatically when working in this directory. It replaces the aspirational
template in `../docs/operating-kit/feature-guides/bot-area.AGENTS.md` with the layout that actually ships.
Keep this guide short; update it here when the code changes, not in the template.

## Purpose

Discord gateway client. `src/index.js` builds the client, registers one ready handler, dispatches message
commands, writes bounded log rows and a heartbeat, and shuts down cleanly. Commands call external providers
only after an explicit trigger. No HTTP server is started here.

## Entrypoints (real files)

| File | Role |
| --- | --- |
| `src/index.js` | bootstrap, intents, one `ClientReady` handler, login, SIGTERM/SIGINT shutdown |
| `src/config.js` | `load(env)` validates `BOT_TOKEN` + MySQL vars, optional `OPENWEATHERMAP_API_KEY` |
| `src/modules/validateToken.js` | token resolution used at startup |
| `src/modules/botResponses.js` | `processMessage` dispatch, dedupe, one-reply rule |
| `src/modules/commandList.js` | dynamic `!help` / `!commands` text |
| `src/modules/dedupe.js` | bounded, TTL'd message-id cache |
| `src/modules/safeSend.js` | awaited send wrapper |
| `src/modules/{nChain,headsOrTails,weatherHandling,jokeComHandling,jokeAPI,gameGiveaways,dontTreadOnMe,easterEgg}.js` | one command handler each |
| `src/modules/mysql.js` | log queue, `createTablesIfNotExists`, heartbeat upsert |
| `src/modules/ruckus_quotes.txt` | static quote data |

There is no `src/core/`, `src/modules/commands/` or `src/modules/providers/` tree; do not add imports that
assume those paths. `src/index.js` calls `handleInsults.start()` explicitly so importing handlers performs no
network I/O — tests rely on this.

## Local commands

| Command | Mutates? | Purpose / status |
| --- | --- | --- |
| `npm test` | no (DB test skips) | `node --test`: handler fixtures with mocked providers and a fake Discord message; the one MySQL test is skipped unless `TEST_MYSQL_PASSWORD` is set |
| `node --test test/bot.test.js` | no | command-level regression fixtures |
| `node --test test/focused-fixes.test.js` | no | dependency-light profanity/joke/giveaway fixes |
| `npm start` | yes (network/gateway) | real bot login — needs `BOT_TOKEN` plus MySQL; see safety below |

There is **no** `npm run lint` or `npm run smoke:bot` script in `package.json`. Do not describe one as available.
Full dependency install and the Node 24 runtime happen only inside `../scripts/verify.sh` (H-backed volumes),
never in this checkout.

## Test oracles (shipped tests)

| Test file | Guarantee / requirement |
| --- | --- |
| `test/bot.test.js` | n-chain never sends an empty message and is per-channel (REG-006); `!flipacoin` handled once (REG-003); both `!weather` forms parse, no `undefined` in replies (REG-004/FIX-015); profanity list cached with last-known-good (FIX-017); ordinary message makes zero outbound calls (REG-008); `!help`/`!commands` complete; duplicate ids handled once; dedupe bounded ≤5000 and TTL expiry; ≤10 free-game embeds within budget; send failures caught; heartbeat upserts once (needs throwaway DB) |
| `test/focused-fixes.test.js` | `!joke` works with no mention, natural phrase needs one (REG-005); module import does zero provider calls and starts no timer; `start()` idempotent, concurrent refreshes coalesce; one reply per concurrent message; malformed entries fail closed; bounded regex/reply |

## Rules specific to this area

- One reply per consumed message; return `true` when handled, `false` otherwise. Never send an empty string
  or empty embed.
- No provider call before the trigger matches; cache TTLs and fallbacks live with each provider module.
- Preserve exact reply strings in `../docs/planning/contracts/command-contract.md`. Removing or renaming a
  user-visible command needs a recorded decision (`../data/decisions.json`, DEC-002).
- Every authored function gets a short purpose/input/output/side-effect/failure comment, matching current style.

## Data, credentials and H routing

- **Never use the production `BOT_TOKEN` locally** — it opens a second gateway session for the live bot.
  Tests use `BOT_TOKEN=test` and fake clients. Real login is a deliberately blocked step in this environment.
- OpenWeatherMap needs `OPENWEATHERMAP_API_KEY` (an activation input, ASM-006); do not invent a key or a quota.
- Any log/heartbeat DB used by tests must be a throwaway loopback fixture created by `../scripts/verify.sh`.
  Never point bot tests at a production/cluster database or import an original dump.
- Generated output (deps, `.next`, logs, dumps) stays in `/mnt/h/AgentArtifacts/projects/ruckus_bot/`;
  never in the tracked tree. See `../docs/deploy/LOCAL-DEVELOPMENT.md` and
  `../docs/deploy/BACKUP-RESTORE.md` (the prior production dump is explicitly not qualified — do not touch it).

## Troubleshooting

Missing privileged intent / invalid token → gateway errors; capture logs before restart and rotate the token
if rejected. Provider timeout → cached last-known-good should keep replies non-empty. Database unavailable →
check `MYSQL_HOST`/`MYSQL_PORT` against the fixture. Full runbook: `../docs/planning/operations/06_SECURITY_AND_OPERATIONS.md` §8.

## Tested vs blocked

Tested locally with fakes and a real throwaway MySQL (`../docs/planning/evidence/2026-11-17-implementation.md`):
handler logic, audit-free builds. **Blocked/unverified:** real gateway/intents, slash-command registration,
provider quotas, live guild behaviour — record these as activation inputs, not as passing checks.

## References

`../docs/planning/contracts/command-contract.md`, `../docs/planning/contracts/data-model.md`,
`../docs/operating-kit/RULES.md`, `../data/requirements.json`, `../docs/deploy/LOCAL-DEVELOPMENT.md`.
