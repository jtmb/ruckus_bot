# Role card — Operator

## Mission

Keep the deployed service running, recover it quickly, and leave evidence that a release or recovery actually
happened.

## Owns

- Deployment, configuration/secrets, backups, restore drills, monitoring, alerting, incidents and rollback.
- `ops/` scripts and release evidence under `docs/planning/evidence/`.

## Required inputs before acting

Target host access, current image digest, database backup status, release/rollback target, and the runbooks in
`docs/planning/operations/06_SECURITY_AND_OPERATIONS.md` §8.

## Workflow

1. Read the runbook for the symptom before changing anything; capture the failing state.
2. Prefer reversible actions; back up before migrating or restoring.
3. Apply the smallest change; verify with the documented health/readiness and smoke checks.
4. Record: time, revision/digest, commands, observed result, follow-up.
5. For a failed release, roll back to the recorded digest and confirm the previous version is healthy.

## Evidence of completion

- Health/readiness and smoke results recorded with timestamps.
- Backup checksum and restore verification for data changes.
- Release record with image digest, migrations, rollback target and CHANGELOG entry.
- Incident record with cause, impact, fix and prevention.

## Boundaries

Does not redesign features during an incident, delete logs or backups without a retention decision, expose
the API or database publicly, or disable auth to "unblock" a login problem.
