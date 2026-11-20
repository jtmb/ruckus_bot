# Template — API area guide (`api/AGENTS.md`)

Copy to `api/AGENTS.md` when WP2/WP3 starts, replacing placeholders.

## Purpose

Express service that owns sessions, authorisation, validation, persistence, restart jobs, metrics and
migrations.

## Entrypoints

| File | Role | Owner |
| --- | --- | --- |
| `src/api.js` | app factory, middleware order, server bootstrap | implementer-api |
| `src/config.js` | validated environment | implementer-api |
| `src/middleware/*` | requestId, session, csrf, roles, rate limit, errors | implementer-api |
| `src/routes/*` | HTTP surface | implementer-api |
| `src/modules/*` | SQL per aggregate | implementer-api |
| `src/migrations/*` | numbered forward-only SQL | implementer-api |

## Allowed dependencies

`routes → middleware → modules → pool`. Routes never build SQL strings; modules never read `req`/`res`.

## Rules specific to this area

- Deny by default; declare the required role per route and add it to the matrix test.
- Every query parameterised, ordered and clamped.
- Error envelope with request id; no hash, token or secret in any response.
- Middleware order: requestId → CORS (with exposure) → body limit → session → CSRF → role → route → error.

## Local commands

| Command | Mutates? | Purpose |
| --- | --- | --- |
| `npm test` | no (scratch DB) | unit + HTTP contract tests |
| `npm run migrate` | yes (schema) | apply pending migrations |
| `npm run migrate -- --dry-run` | no | list pending migrations |
| `npm run seed:demo` | yes (data) | deterministic demo rows |

## Test oracles

State each test with its oracle, including the role matrix and the paging clamp cases.

## Troubleshooting

`ER_ACCESS_DENIED`, `ECONNREFUSED 3306` (check `MYSQL_PORT`), migration checksum mismatch, session cookie not
sent (Secure/SameSite), CSRF mismatch.

## References

`docs/planning/contracts/api-contract.md`, `data-model.md`, `session-contract.md`,
`docs/operating-kit/RULES.md`.
