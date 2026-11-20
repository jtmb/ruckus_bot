#!/usr/bin/env python3
"""Dry-run-only restore-drill planner for ruckus_bot (no live database access).

Live (non-dry-run) restore is intentionally DISABLED and fails closed. A checksum
proves integrity, not authenticity; a disposable schema is not a SQL sandbox; and
the interactive ``mysql`` client interprets client-side commands (e.g. ``\\!``),
so feeding an untrusted dump to it is unsafe regardless of server grants. A real
drill requires the isolated, exclusively task-owned fixture described in
LIVE_RESTORE_PREREQUISITE; it does not exist in this environment. Synthetic
results here are planning evidence only and must never be reported as a real drill.
"""
import argparse
import os
import secrets
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import backup_guard as g

# Purpose: exact, fail-closed prerequisite for ever re-enabling a live restore.
# Includes no bypass flag: ownership must be established by a separate, authorised
# provisioning step, not asserted by an environment variable or a loopback address.
LIVE_RESTORE_PREREQUISITE = (
    'live restore disabled: requires an exclusively task-owned, isolated disposable '
    'MySQL 8.4 instance - dedicated unix socket in a private 0700 task-owned directory '
    'on a POSIX-enforcing filesystem, skip_networking=1 (no TCP), local_infile=0 and '
    'secure_file_priv set to an empty task-owned directory (no host-file access), and a '
    'least-privilege account granted only the new ruckus_drill_* schema (no FILE/SUPER/'
    'global grants, not the runtime bot account). Restore must use a statement-level '
    'client with bounded streaming and byte/time budgets, never the interactive mysql '
    'client fed arbitrary SQL. Verify only system schemas plus the created schema exist, '
    'then drop it. Loopback TCP, a schema prefix and a matching checksum are NOT sufficient. '
    'No such fixture or ownership proof exists here; synthetic tests do not qualify.'
)

# Informational only: tables the documented future fixture would count after a real drill.
DRILL_TABLES = ('schema_migrations', 'bot_logs', 'credentials',
                'sessions', 'bot_heartbeat')


# Purpose: plan and validate a restore drill without touching any database.
# Inputs: dump path, connection fields, secret (unused; no connection is made), opt-in,
# optional leaked runtime host, byte budget, dry-run flag, logger, time budget and schema.
# Outputs: plan dict with integrity digest and bounded size figures. Side effects: reads
# the dump and sidecar only; creates/drops nothing. Failure: raises GuardError for any
# non-loopback host, missing opt-in, non-disposable name, integrity mismatch, out-of-budget
# payload, or any attempt at a non-dry-run (live) restore.
def run_drill(dump, host, port, user, secret, opt_in, runtime_host=None,
              max_bytes=g.DEFAULT_MAX_BYTES, dry_run=True, log=print,
              timeout=900, schema=None):
    # Hard stop before reading the dump, using credentials or opening any connection.
    if not dry_run:
        raise g.GuardError(LIVE_RESTORE_PREREQUISITE)
    if not g.is_loopback(host) or not g.is_loopback(runtime_host or host):
        raise g.GuardError('refusing drill plan against a non-loopback (possibly production) host')
    schema = schema or g.disposable_schema_name(os.getpid(), secrets.token_hex(8))
    g.validate_restore_target(schema, opt_in, host, runtime_host)
    sidecar = dump + '.sha256'
    digest = g.verify_checksum(dump, sidecar)  # integrity only, not authenticity
    g.check_gzip_magic(dump)
    compressed = os.path.getsize(dump)
    if compressed == 0 or compressed > max_bytes:
        raise g.GuardError('dump size is outside the configured budget')
    # Bounded streaming never allocates the full decompressed payload in memory.
    deadline = time.monotonic() + timeout
    payload = sum(len(block) for block in
                  g.iter_bounded_gzip(dump, max_bytes, deadline, time.monotonic))
    if payload == 0:
        raise g.GuardError('decompressed dump is empty')
    log(g.redact(
        'DRY-RUN drill schema=%s dump=%s sha256(integrity-only)=%s compressed=%d payload=%d '
        'live_restore=DISABLED prerequisite=%s' %
        (schema, dump, digest, compressed, payload, LIVE_RESTORE_PREREQUISITE),
        [secret]))
    return {'schema': schema, 'dump': dump, 'sha256': digest,
            'compressed_bytes': compressed, 'payload_bytes': payload,
            'dry_run': True, 'live_disabled': True}


# Purpose: command-line entry point for the dry-run-only restore-drill planner.
# Inputs: CLI args plus environment opt-in. Outputs: process exit code. Side effects:
# none beyond a bounded read of the supplied dump. Failure: redacted error, non-zero exit.
def main(argv=None):
    ap = argparse.ArgumentParser(
        description='Dry-run restore-drill planner (live restore disabled)',
        epilog='A non --dry-run invocation is refused with the exact isolated-fixture '
               'prerequisite; no database connection is ever opened here.')
    ap.add_argument('--dump', required=True, help='integrity-checked .sql.gz dump with .sha256 sidecar')
    ap.add_argument('--host', default=os.environ.get('MYSQL_HOST', '127.0.0.1'))
    ap.add_argument('--port', default=os.environ.get('MYSQL_PORT', '3306'))
    ap.add_argument('--user', default=os.environ.get('MYSQL_USER', 'bot'))
    ap.add_argument('--max-bytes', type=int, default=g.DEFAULT_MAX_BYTES,
                    help='decompressed byte budget (default 5 GB; hard cap 100 GB)')
    ap.add_argument('--dry-run', action='store_true',
                    help='plan and validate only (the only supported mode)')
    args = ap.parse_args(argv)
    secret = os.environ.get('MYSQL_PASSWORD') or os.environ.get('MYSQL_PWD')
    try:
        run_drill(args.dump, args.host, args.port, args.user, secret,
                  os.environ.get(g.RESTORE_OPT_IN), os.environ.get('MYSQL_HOST'),
                  args.max_bytes, dry_run=args.dry_run)
    except g.GuardError as exc:
        print('DRILL REFUSED: ' + g.redact(str(exc), [secret]))
        return 2
    except OSError as exc:
        print('DRILL REFUSED: ' + g.redact(str(exc), [secret]))
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
