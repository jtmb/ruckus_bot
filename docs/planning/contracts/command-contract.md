# Command contract — bot

Owner: `implementer-bot`. Consumed by `07_IMPLEMENTATION_ROADMAP.md` WP4, WP5, WP10 and the
regression suite. Every preserved behaviour here is traceable to `REG-*` in `data/requirements.json`.

## 1. Dispatch pipeline

One `messageCreate` pipeline. Order is fixed; each step may end the pipeline.

1. Ignore messages whose author is a bot, including self.
2. Ignore messages outside a guild only when the command requires guild context (weather, giveaways),
   and reply with one short explanation in that case.
3. Resolve the effective guild configuration (prefix, disabled features, allowed channels, cooldowns).
4. If the channel is in quiet mode, run only explicit commands, never passive reactions (quote, chain,
   insults, easter egg).
5. Deduplicate on message id (see §4). A duplicate exits silently.
6. Record the interaction event **once** per accepted message (see `data-model.md` §4).
7. Run the explicit-command matcher. The first matching handler wins; no handler may also be reached by a
   later fallback for the same message.
8. If no explicit command matched, run passive hooks in fixed order: easter egg, chain, profanity.
9. If nothing matched and the bot was mentioned, reply with one random quote.

Invariants:

- At most **one** bot message per incoming message, except `!freegames` (one digest) and a restart
  notification (out of band). No command may produce two replies for one input.
- Every handler result is consumed by the dispatcher; a `true` result stops the pipeline.
- Every send is awaited or handled; a rejected send is logged once with guild, channel and command.

## 2. Handler contract

```js
/**
 * Handles one command.
 * @param {CommandContext} ctx - message, client, guild config, logger, clock, dedupe, reply helpers.
 * @returns {Promise<boolean>} true when the message was consumed.
 */
```

`CommandContext` owns: `message`, `client`, `content` (lower-cased, trimmed), `args`, `guildConfig`,
`reply(text)`, `replyEmbed(embed)`, `safeSend(payload)`, `logger`, `now()`.

Rules:

- A handler that starts replying must return `true` even if the reply failed; the dispatcher must not
  fall through to a different feature after a partial reply.
- A handler that does not apply returns `false` without side effects.
- No handler reads `process.env` directly; configuration arrives through the context.
- No handler performs a network call on a message that does not match its trigger.

## 3. Command registry

One registry entry per command. The registry drives help text, slash-command registration, cooldown and
tests. `bot id` is taken from `client.user.id`, never hardcoded.

| Id | Trigger | Aliases | Guild only | Default cooldown | Changed by |
| --- | --- | --- | --- | --- | --- |
| `quote` | bot mentioned, no command | — | no | 5 s per user | REG-001 |
| `help` | `!help` | `/help` | no | 10 s per channel | REG-002, FIX-025 |
| `commands` | `!commands` | — | no | 10 s per channel | REG-002, FIX-025 |
| `flip` | `!flipacoin <heads\|tails>` | `/flip` | no | 3 s per user | REG-003, FIX-012 |
| `weather` | `!weather in <city>` or mention + `weather in <city>` | `/weather city:` | yes | 10 s per user | REG-004, FIX-015 |
| `freegames` | `!freegames` or mention + `free games` | `/freegames` | yes | 60 s per channel | REG-005, FIX-016 |
| `joke` | `!joke` or mention + `tell me a joke` | `/joke` | no | 5 s per user | REG-006, FIX-014 |
| `chain` | standalone `n`, `i`, `g`, `e`, `r` | — | yes | none (stateful, see §5) | REG-007, FIX-013 |
| `insult` | message contains a listed term | — | yes | 60 s per channel | REG-008, FIX-017 |
| `easteregg` | configured owner id says `hello my child` | — | no | none | REG-009 |

Help text is generated from this table, so a command cannot be shipped without appearing in help.

## 4. Deduplication and reconnects

- Key: `message.id`.
- Store: in-memory LRU with TTL **10 minutes** and hard cap **5,000** entries. Expired entries are
  removed lazily on read and by a periodic sweep every 60 s.
- A duplicate id exits before logging or replying.
- Gateway `resume` may replay events; the TTL is the only guarantee and must not grow with uptime.

## 5. Chain behaviour (preserved)

The gag is a state machine per channel, not one global boolean.

| State | Input `n` | `i` | `g` | `e` | `r` | other |
| --- | --- | --- | --- | --- | --- | --- |
| idle | start chain → reply `i` | ignore | ignore | ignore | ignore | ignore |
| expect-g | ignore | — | reply `g` again, advance | if `g` not emittted: **stay silent** | ignore | ignore |
| expect-e…r | ignore | ignore | ignore | reply `r` when sequence reached | close chain | ignore |

- No empty message may ever be sent (`reply('')` is forbidden; Discord rejects it with error 50006).
- Chain state expires **10 minutes** after the last chain message, per channel.
- Two channels do not interfere.

## 6. Passive features

- **Easter egg**: exact match, configured owner id (not a literal in code), replies `Hello Father.`
  exactly once per message.
- **Insult**: matching is on word boundaries against a cached list. If the list is unavailable and no
  cached copy exists, the feature stays silent (fail closed). Reply frequency limited to once per
  channel per 60 s. Bundled baseline list is authoritative when the remote refresh fails.
- **Quote**: non-empty line from `ruckus_quotes.txt`; file is read once and cached with mtime check.
  If the file is empty, the bot replies with a single fallback line rather than crashing.

## 7. Weather

- Trigger forms: `!weather in <city>` and mention + `weather in <city>`; both documented in help.
- City normalization: strip the leading `in `, strip mentions, collapse whitespace, max 100 characters,
  `encodeURIComponent` the query.
- Units: metric by default; `imperial` when the guild config or `!weather in <city> f` requests it.
- Timeout 5 s, one retry only on network error, no retry on 4xx.
- Result rules:
  - Success → one reply with description and temperature including unit.
  - Unknown city (upstream 404) → `City not found…` (exact preserved text: "City not found. Please provide a valid city name.").
  - Missing key → log once at error level, reply "Weather is not configured for this bot." (never a stack trace).
  - Upstream failure → one generic failure line, no `undefined`.

## 8. Free games

- One invocation, one message: a digest embed with up to 10 entries, each title + store + end date + link.
- Total characters across the embed must stay under 5,500 (Discord limit 6,000 with headroom).
- Ordering: soonest end date first, then title.
- Filters: platform from guild config (default `pc`, type `game`); duplicates by normalized title collapsed.
- Empty result → one "No active giveaways right now" line.
- Upstream failure → serve cached last-known-good list up to 6 hours old, labelled as cached; older than
  that → one failure line.

## 9. Errors and resilience

| Failure | Required behaviour |
| --- | --- |
| Missing `BOT_TOKEN` | Startup exits code 1 with one actionable line. |
| Invalid token (`TokenInvalid`) | Exit code 1; log one line with the Discord error code; no stack dump to stdout. |
| Privileged intent not enabled | Log which intent is missing and exit code 1 with the developer-portal instruction. |
| Database unavailable | Bot still answers chat commands; logging failures are counted and warned at most once per minute. |
| Send rejected (permissions, missing access) | Log once, continue processing later messages, never crash. |
| SIGTERM | Stop accepting events, flush the log queue (max 5 s), close the gateway, exit 0. |

## 10. Acceptance fixtures

The regression suite must cover, at minimum: mention quote, help/commands (once each), flip both sides,
flip with no choice, weather success/404/no-key/upstream-error, freegames success/empty/cached,
joke both documented forms and the negative no-mention case, chain idle→g→e→r including `e` before `g`,
insult match/no-match/list-empty, easter egg allowed/denied author, and quiet channel suppression.
