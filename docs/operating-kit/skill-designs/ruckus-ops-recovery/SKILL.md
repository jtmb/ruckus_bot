---
name: ruckus-ops-recovery
description: Use when the ruckus_bot is offline, the database is unreachable, login is locked out, or data must be restored.
---

# ruckus-ops-recovery

## Purpose

Diagnose and recover the running service quickly, within documented authority, without destroying evidence or
weakening security.

## Required inputs

- Symptom and time observed, current revision/digest, recent changes.
- Host/container access as operator; the runbooks in `06_SECURITY_AND_OPERATIONS.md` §8.
- Backup location and the last verified restore date.

## Workflow

1. Capture the failing state: `docker compose ps`, container logs (last 200 lines), `/health`, `/ready`,
   dashboard status card. Do not restart before capturing.
2. Classify: bot offline (token/intent/gateway), API 5xx (database, migration, session), database down
   (disk, credentials), login lockout, dashboard blank (build/session), or data loss.
3. Follow the matching runbook step. Prefer reversible actions; back up before restoring or migrating.
4. For an unknown cause, reduce blast radius: stop the bot process only, keep the API and database up, and
   preserve logs.
5. Verify recovery with readiness, a fresh heartbeat, a status card and one command in a test guild.
6. Record the incident: symptom, cause, actions, evidence paths, prevention.

## Outputs and evidence

- Incident record under `docs/planning/evidence/` with timestamps and observed output.
- Recovery verification (health, heartbeat, command).
- Follow-up requirement or fix proposal if the cause is a product defect.

## Authoritative references

`docs/planning/operations/06_SECURITY_AND_OPERATIONS.md` §8, `contracts/session-contract.md` §5,
`data/assumptions.json` (activation inputs such as the token and intents).

## Permission boundaries

No disabling authentication, no deleting logs or backups to free space, no exposing 3003/3306, no restoring an
unverified dump over live data, no interrupting unrelated workloads on the host.

## Evaluation cases

1. "Dashboard says offline but the container is up" → compare heartbeat age and last error event before
   restarting anything.
2. "Admin locked out" → documented reset command inside the container with an audit row; never a public reset
   route.
3. "Database unreachable after a host reboot" → wait for the DB healthcheck, verify migrations, then start the
   bot; do not recreate volumes.
