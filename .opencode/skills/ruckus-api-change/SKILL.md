---
name: ruckus-api-change
description: Use when adding or changing an HTTP route, database query, migration, session or role rule, or error shape in the ruckus_bot API.
---

# ruckus-api-change

## Purpose

Keep the API honest: authenticated, authorised, validated, ordered, parameterised and consistent in errors.

## Required inputs

- Requirement IDs and acceptance criteria.
- `docs/planning/contracts/api-contract.md`, `data-model.md`, `session-contract.md`.
- The route/role matrix and current migrations.

## Workflow

1. Read root rules, the handoff and the three contracts.
2. Locate the route and the module that owns its SQL; reuse existing middleware (`session`, `requireRole`,
   `validate`, `paginate`) instead of hand-rolling checks.
3. Write the failing HTTP test first: status, body shape, and the role matrix row (anonymous/viewer/operator/
   admin as applicable).
4. For schema changes, add the next numbered migration; never edit an applied one; test both a fresh database
   and an existing pre-migration schema.
5. Implement with parameterised SQL, explicit ordering, clamped paging and the error envelope + request id.
6. Verify no response or log contains a password, hash, token or secret; add a scan assertion to the test.
7. Run `npm test` and `npm run migrate -- --dry-run`; record results.

## Outputs and evidence

- Contract test output including the role matrix.
- Migration dry-run listing and a fresh-database initialisation result.
- Confirmation that `X-Total-Count` is exposed and paging is deterministic.

## Authoritative references

`docs/planning/contracts/api-contract.md`, `docs/planning/contracts/data-model.md`,
`docs/planning/contracts/session-contract.md`, `docs/operating-kit/RULES.md`.

## Permission boundaries

No unauthenticated route, no wildcard CORS, no schema change without a migration, no destructive migration in
a single step, no production database access.

## Evaluation cases

1. "Add `GET /bot/top-commands`" → auth + validation + ordering + totals + test.
2. "Quickly change the users table by hand" → rejected; requires a numbered migration and upgrade test.
3. "Login returns the user object" → fails the hash-scan assertion; response must use a safe projection.
