#!/usr/bin/env python3
"""Portable, fail-closed local MySQL 8.4 dump for ruckus_bot.

The password is read only from the environment and passed to the child in
MYSQL_PWD; it never appears in argv, logs or the repository. Requires an
explicit --dest on an authorised, POSIX-enforcing, H-backed filesystem.
"""
import argparse
import gzip
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import backup_guard as g

# Purpose: run mysqldump and stream raw SQL to a binary sink with hard bounds.
# Inputs: argv, child env, write callback, deadline, max bytes. Outputs: None.
# Side effects: one child process. Failure: raises GuardError; stderr is never logged.
def _subprocess_dumper(argv, env, write, deadline, max_bytes, now=time.monotonic):
    proc = subprocess.Popen(argv, env=env, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    total = 0
    try:
        while True:
            chunk = proc.stdout.read(65536)
            if not chunk:
                break
            total = g.bound_stream(chunk, total, max_bytes, deadline, now())
            write(chunk)
        proc.stderr.read(8192)  # bounded single read; discarded, never logged
        rc = proc.wait(timeout=30)
    except BaseException:
        proc.kill()
        proc.wait(timeout=10)
        raise
    if rc != 0:
        raise g.GuardError('mysqldump exited non-zero (stderr withheld to protect secrets)')

# Purpose: verify a gzip stream end-to-end (CRC) in one bounded pass.
# Inputs: path, max bytes, deadline. Outputs: None. Side effects: one read pass.
# Failure: raises GuardError on corruption, oversize or timeout.
def _verify_gzip(path, max_bytes, deadline, now=time.monotonic):
    total = 0
    try:
        with gzip.open(path, 'rb') as fh:
            g.check_gzip_magic(path)
            while True:
                chunk = fh.read(65536)
                if not chunk:
                    break
                total = g.bound_stream(chunk, total, max_bytes, deadline, now())
    except g.GuardError:
        raise
    except (OSError, EOFError) as exc:
        raise g.GuardError('gzip integrity check failed: ' + str(exc))

# Purpose: produce a verified, checksummed, atomically placed local dump.
# Inputs: destination, connection fields, secret, roots, budget, injectable
# dumper/probe/mounts for synthetic tests. Outputs: result dict. Side effects:
# creates one dump and one checksum sidecar. Failure: fail closed; removes only
# the files this run created.
def run_backup(dest, host, port, user, database, secret, authorized_root,
               repo_root, max_bytes, dumper=None, probe=None, mounts=None,
               dry_run=False, log=print, timeout=1800, now=time.monotonic):
    if not g.is_loopback(host) or not g.is_loopback(os.environ.get('MYSQL_HOST', host)):
        raise g.GuardError('refusing backup from a non-loopback (possibly production) host')
    real, parent = g.validate_destination(dest, authorized_root, repo_root,
                                          max_bytes, mounts, probe)
    binary = 'mysqldump' if dumper is None else dumper
    argv = g.build_dump_argv(binary, host, port, user, database, secret)
    g.assert_no_secret_in_argv(argv, secret)
    stamp = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())
    safe_db = ''.join(c for c in str(database) if c.isalnum() or c == '_')[:40] or 'db'
    final = os.path.join(parent, 'ruckus_%s_%s_%d.sql.gz' % (safe_db, stamp, os.getpid()))
    sidecar = final + '.sha256'
    if dry_run:
        log('DRY-RUN backup plan: dest=' + real + ' gzip=on checksum=on')
        log('DRY-RUN argv=' + repr(argv))
        return {'final': final, 'sidecar': sidecar, 'dry_run': True}
    if not secret:
        raise g.GuardError('MYSQL_PASSWORD is required (environment only, never argv)')
    fn = _subprocess_dumper if dumper is None else dumper
    deadline = now() + timeout
    part = final + '.part-%d' % os.getpid()
    created = []
    try:
        fd = os.open(part, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        created.append(part)
        with os.fdopen(fd, 'wb') as raw:
            with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as gz:
                total = [0]
                def write(chunk):
                    total[0] = g.bound_stream(chunk, total[0], max_bytes, deadline, now())
                    gz.write(chunk)
                child_env = os.environ.copy()
                child_env['MYSQL_PWD'] = secret
                fn(argv, child_env, write, deadline, max_bytes)
        _verify_gzip(part, max_bytes, deadline, now)
        digest = g.sha256_file(part)
        os.replace(part, final)
        created.append(final)
        sfd = os.open(sidecar, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        created.append(sidecar)
        with os.fdopen(sfd, 'w', encoding='ascii') as sf:
            sf.write(digest + '  ' + os.path.basename(final) + '\n')
        g.verify_checksum(final, sidecar)
        log(g.redact('BACKUP OK dest=%s bytes=%d sha256=%s' % (final, total[0], digest), [secret]))
        return {'final': final, 'sidecar': sidecar, 'sha256': digest,
                'bytes': total[0], 'dry_run': False}
    except BaseException:
        for path in created:
            if os.path.exists(path):
                os.unlink(path)
        raise

# Purpose: command-line entry point for a local, loopback-only backup.
# Inputs: CLI args plus environment credentials. Outputs: process exit code.
# Side effects: writes a verified dump to an explicit private destination.
# Failure: prints a redacted error and exits non-zero.
def main(argv=None):
    ap = argparse.ArgumentParser(description='Fail-closed local MySQL backup (no production access)')
    ap.add_argument('--dest', required=True, help='explicit private destination directory on authorised H-backed storage')
    ap.add_argument('--host', default=os.environ.get('MYSQL_HOST', '127.0.0.1'))
    ap.add_argument('--port', default=os.environ.get('MYSQL_PORT', '3306'))
    ap.add_argument('--user', default=os.environ.get('MYSQL_USER', 'bot'))
    ap.add_argument('--database', default=os.environ.get('MYSQL_DATABASE', 'db'))
    ap.add_argument('--max-bytes', type=int, default=g.DEFAULT_MAX_BYTES,
                    help='decompressed byte budget (default 5 GB; hard cap 100 GB)')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args(argv)
    secret = os.environ.get('MYSQL_PASSWORD') or os.environ.get('MYSQL_PWD')
    root = os.environ.get('RUCKUS_BACKUP_ROOT', '/mnt/h/AgentArtifacts/projects/ruckus_bot')
    repo = os.environ.get('RUCKUS_REPO_ROOT', '/home/brajam/repos/ruckus_bot')
    try:
        run_backup(args.dest, args.host, args.port, args.user, args.database,
                   secret, root, repo, args.max_bytes, dry_run=args.dry_run)
    except g.GuardError as exc:
        print('BACKUP REFUSED: ' + g.redact(str(exc), [secret]))
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())

