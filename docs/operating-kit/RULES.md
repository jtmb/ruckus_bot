# Shared engineering rules (ruckus_bot)

One authoritative policy for this repository. Role cards and skills reference this file; they must not copy
it. Current owner instructions override this document; shared WSL rules in `/home/brajam/repos/AGENTS.md`
still apply to storage, cleanup and memory.

## 1. Scope and authority

1. Work only inside an authorised work package from `docs/planning/operations/07_IMPLEMENTATION_ROADMAP.md`.
2. Preserve existing user-visible behaviour unless `data/decisions.json` records a change and the owner
   approved it. Do not delete a command, endpoint, page or deployment shape as "cleanup".
3. Do not add CI, hosting, purchases, skill installation or production mutations without explicit
   authorisation.
4. Record scope changes with origin, affected requirement IDs, impact and authority (`data/scope-history.json`).

## 2. Reuse and structure

1. Search the repository before creating a module, route, component or helper.
2. Extend an existing registry entry, provider client, middleware or component first.
3. Justify extraction in the task record when a new shared helper is created; name its owner.
4. No catch-all `utils/`. Allowed shared homes: `bot/src/core/`, `api/src/middleware/`, `dashboard/lib/`.
5. No circular dependencies. Commands do not import commands; routes do not import app bootstrap.

## 3. Comments and readability

Every authored function — including tests, scripts and migration helpers — carries a short comment stating
purpose, inputs, outputs, side effects, error behaviour and any invariant. Comments explain *why*; they do
not narrate syntax. Do not reformat untouched vendor or generated code.

## 4. Configuration and secrets

1. Every process reads configuration through its validated config module and fails fast with a named error.
2. Never commit a secret, token, password, hash, cookie or database dump.
3. `.env.example` lists every variable with purpose and safe default; production uses real environment
   variables, not `.env`.
4. Logs redact `password`, `token`, `secret`, `cookie`, `authorization` and any `$2b$` hash.

## 5. Data and SQL

1. Parameterised queries only. No string interpolation into SQL.
2. Discord ids are strings; timestamps are UTC; durations are seconds unless named `_ms`.
3. Schema changes go through numbered migrations in `api/src/migrations/`; never edit an applied migration.
4. Two-step deprecation for column removal: stop reading, release, then drop.
5. No unbounded query: every list endpoint is ordered, clamped and paginated.

## 6. Errors and logging

1. A failure either produces a user-readable message or a logged error with context — ideally both.
2. Never swallow an error silently. Never send an empty message or an empty embed.
3. Await or explicitly handle every promise from a Discord call or database write.
4. API errors use the documented envelope with a request id; the same id appears in logs.
5. Log levels: `error` for user-visible failure, `warn` for degraded fallback, `info` for lifecycle,
   `debug` for development detail. No per-message info logs in production.

## 7. Security defaults

1. Deny by default: new routes require a session and an explicit role.
2. Validate server-side; never trust the dashboard or Discord input.
3. Sessions: HttpOnly, SameSite=Lax, Secure behind HTTPS, CSRF token on mutations, rotate on login.
4. No secrets or hashes in responses, including error paths.
5. Rate limit authentication and expensive provider-backed commands.
6. Dependency installs use lockfiles (`npm ci`); audit critical/high findings before release.

## 8. Testing quality

1. Every permanent test protects a current requirement and states its oracle in the test name or comment.
2. Test the contract, not the implementation: inputs, outputs, error codes and invariants.
3. Prefer deterministic fixtures and injected clocks over sleeps.
4. No test depends on execution order or on state another test repaired.
5. A bug fix lands with a test that failed before it.
6. Temporary diagnostics stay outside the permanent suite.

## 9. Documentation

1. Behaviour changes update the contract and the local area guide in the same change.
2. Commands that mutate state are labelled; read-only checks are separated.
3. Update `CHANGELOG.md` with requirement IDs at release.
4. Record durable decisions in `data/decisions.json` and link them from `MEMORY.md`.

## 10. Storage and cleanup

1. Generated output (builds, caches, screenshots, dumps, containers) goes outside the tracked tree; the
   working tree stays free of `node_modules/` and `.next/`.
2. Remove obsolete generated output after its last consumer; keep the minimal receipt in evidence.
3. Never delete unique source, evidence, active work or someone else's files.
4. Report exact removed paths and measured bytes, or the exact retained path and its consumer.
