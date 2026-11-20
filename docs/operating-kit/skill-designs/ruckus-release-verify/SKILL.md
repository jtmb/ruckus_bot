---
name: ruckus-release-verify
description: Use when preparing, verifying or rolling back a ruckus_bot release, image build, migration or compose stack change.
---

# ruckus-release-verify

## Purpose

Produce reproducible evidence that a specific revision is built, migrated, healthy and reversible before it
is called a release.

## Required inputs

- Release revision and the image digest built from it.
- `data/gates.json`, the exit criteria of the completed work packages, and the current CHANGELOG entry.
- Target host access (operator role) and the previous known-good digest.

## Workflow

1. Read `06_SECURITY_AND_OPERATIONS.md` §7 (release) and the gate records.
2. Build from a clean clone with `npm ci`; record the digest and the base-image digests.
3. Run `npm run verify`: lint, unit, HTTP contract tests, hermetic dashboard build, migration dry-run.
4. Start the stack against an empty database; confirm migrations, `/health`, `/ready`, login, status, one log
   event and one restart job.
5. Smoke the bot with the owner-provided token in a test guild: one command, one mention quote, one heartbeat.
6. Record evidence under `docs/planning/evidence/<date>-<revision>-release.md` with commands and observed
   output.
7. If any gate fails, stop, report the exact failure, and do not tag or deploy. For a failed deployment, roll
   back to the recorded digest and verify health.

## Outputs and evidence

- Image digest, migration list, verification transcript, smoke results, rollback target, CHANGELOG entry.
- Gate states updated only for criteria actually observed.

## Authoritative references

`docs/planning/operations/06_SECURITY_AND_OPERATIONS.md` §7–§9, `docs/planning/operations/07_IMPLEMENTATION_ROADMAP.md`,
`data/gates.json`.

## Permission boundaries

No deployment without the operator role and owner authorisation, no tagging an unverified commit, no skipping
the restore drill for a data release, no claiming uptime or latency that was not measured.

## Evaluation cases

1. "Ship it, tests are slow" → refuse; verification is the release contract.
2. "Migration failed halfway" → stop, restore from the pre-release dump, report the failing file; do not mark
   the gate passed.
3. "Rollback after a bad release" → previous digest deployed, health and login verified, incident record
   written.
