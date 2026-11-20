'''Fail-closed safety guards for ruckus_bot local MySQL backup / restore drill.

Pure standard library. No network or database access at import time.
'''

# Purpose: identify POSIX mode-enforcing filesystems suitable for private dumps.
# Inputs: none. Outputs: frozenset of filesystem type names. Side effects: none.
# Failure: none; other filesystems are refused by validate_destination().
POSIX_FS_ALLOW = frozenset({'ext4', 'ext3', 'ext2', 'xfs', 'btrfs', 'f2fs'})

# Purpose: hard per-repository artifact ceiling from the shared storage rules.
MAX_BYTES_CEILING = 100_000_000_000
# Purpose: safe operational default; the ceiling is a cap, not an allocation target.
# Callers may raise it up to MAX_BYTES_CEILING only with an explicit --max-bytes.
DEFAULT_MAX_BYTES = 5_000_000_000


class GuardError(Exception):
    """Raised by every fail-closed check; callers must treat it as a hard stop."""


# Purpose: parse the mount table used for filesystem-type checks.
# Inputs: path to a mounts file. Outputs: list of (mountpoint, fstype, options).
# Side effects: one bounded read. Failure: returns an empty table (caller refuses).
def read_mounts(path='/proc/mounts'):
    out = []
    try:
        with open(path, 'r', encoding='utf-8', errors='replace') as fh:
            for line in fh:
                parts = line.split()
                if len(parts) >= 3:
                    out.append((parts[1], parts[2], parts[3]))
    except OSError:
        return []
    return out


# Purpose: find the longest mount entry containing a path (fail closed).
# Inputs: absolute path, optional mount table. Outputs: (fstype, options, mountpoint).
# Side effects: none. Failure: raises GuardError when no mount matches.
def fstype_for(path, mounts=None):
    table = read_mounts() if mounts is None else mounts
    best = None
    for mp, fstype, opts in table:
        if path == mp or path.startswith(mp.rstrip('/') + '/'):
            if best is None or len(mp) > len(best[2]):
                best = (fstype, opts, mp)
    if best is None:
        raise GuardError('no mount entry covers destination: ' + path)
    return best

LOOPBACK_HOSTS = frozenset({'127.0.0.1', '::1', 'localhost'})
SCHEMA_PREFIX = 'ruckus_drill_'
MAX_SCHEMA_LEN = 64
RESTORE_OPT_IN = 'RUCKUS_RESTORE_DRILL_ALLOW'


# Purpose: recognise only loopback hosts so runtime credentials cannot go off-box.
# Inputs: host string. Outputs: boolean. Side effects: none. Failure: returns False.
def is_loopback(host):
    return isinstance(host, str) and host.strip().lower() in LOOPBACK_HOSTS


# Purpose: validate an explicitly disposable drill schema name.
# Inputs: name string. Outputs: boolean. Side effects: none. Failure: returns False.
def is_disposable_schema(name):
    return (isinstance(name, str)
            and name.startswith(SCHEMA_PREFIX)
            and len(name) > len(SCHEMA_PREFIX)
            and len(name) <= MAX_SCHEMA_LEN
            and all(c.islower() or c.isdigit() or c == '_' for c in name)
            and name[0].islower())


# Purpose: derive a bounded unique disposable schema name for one drill run.
# Inputs: pid and entropy. Outputs: schema name. Side effects: none.
# Failure: raises GuardError if the derived name is out of bounds or pattern.
def disposable_schema_name(pid=0, entropy='0'):
    p = ''.join(c for c in str(pid) if c.isdigit())[:10] or '0'
    e = ''.join(c for c in str(entropy).lower() if c.isdigit() or 'a' <= c <= 'f')[:16] or '0'
    name = '%s%s_%s' % (SCHEMA_PREFIX, p, e)
    if not is_disposable_schema(name):
        raise GuardError('invalid disposable schema name: ' + name)
    return name

# Purpose: authoritative fail-closed preflight for a restore drill target.
# Inputs: schema name, opt-in value, target host, optional leaked runtime host.
# Outputs: validated schema name. Side effects: none. Failure: raises GuardError.
def validate_restore_target(name, opt_in_value, host, runtime_host=None):
    if opt_in_value != '1':
        raise GuardError('set ' + RESTORE_OPT_IN + '=1 for a disposable loopback drill only')
    if not is_loopback(host):
        raise GuardError('refusing non-loopback drill host')
    if runtime_host and not is_loopback(runtime_host):
        raise GuardError('refusing drill: runtime MYSQL_HOST is non-loopback')
    if not is_disposable_schema(name):
        raise GuardError('refusing non-disposable schema name: ' + str(name))
    return name


# Purpose: last-line guard before any restore DDL; refuse an existing schema.
# Inputs: boolean from information_schema. Outputs: None. Side effects: none.
# Failure: raises GuardError when the target already exists (no implicit overwrite).
def assert_target_absent(exists):
    if exists:
        raise GuardError('refusing restore: target schema already exists')

# Purpose: verify the filesystem really enforces a requested POSIX mode.
# Inputs: directory path. Outputs: observed mode of a freshly created file.
# Side effects: creates and removes a throwaway probe file (single shot).
# Failure: raises GuardError if chmod is not honoured (DrvFS/9p lies about modes).
def chmod_probe(directory):
    import os
    import stat as statmod
    import tempfile
    fd, tmp = tempfile.mkstemp(prefix='.chmod-probe-', dir=directory)
    try:
        os.fchmod(fd, 0o600)
        observed = statmod.S_IMODE(os.fstat(fd).st_mode)
    finally:
        os.close(fd)
        os.unlink(tmp)
    return observed


# Purpose: verify a dump destination is private, authorised and POSIX-capable.
# Inputs: dest path, authorised root, repo root, max bytes, optional mount table
# and probe. Outputs: (absolute dest, parent directory). Side effects: may create
# the parent directory with mode 0700. Failure: raises GuardError, fail closed.
def validate_destination(dest, authorized_root, repo_root, max_bytes,
                         mounts=None, probe=None):
    import os
    if not isinstance(dest, str) or not os.path.isabs(dest):
        raise GuardError('backup destination must be an explicit absolute path')
    if os.path.islink(dest):
        raise GuardError('backup destination must not be a symlink')
    max_bytes = int(max_bytes)
    if max_bytes <= 0 or max_bytes > MAX_BYTES_CEILING:
        raise GuardError('max bytes must be between 1 and the 100 GB ceiling')
    root = os.path.realpath(authorized_root)
    repo = os.path.realpath(repo_root)
    real = os.path.realpath(dest)
    if not (real == root or real.startswith(root.rstrip('/') + '/')):
        raise GuardError('backup destination is outside the authorised H-backed root')
    if real == repo or real.startswith(repo.rstrip('/') + '/'):
        raise GuardError('backup destination must never be inside the repository')
    fstype, _opts, _mp = fstype_for(real, mounts)
    if fstype not in POSIX_FS_ALLOW:
        raise GuardError('refusing destination on ' + fstype + ' (no POSIX mode enforcement)')
    parent = os.path.dirname(real)
    if not os.path.isdir(parent):
        os.makedirs(parent, mode=0o700, exist_ok=False)
    dmode = os.stat(parent).st_mode & 0o777
    if dmode & 0o077:
        raise GuardError('backup directory must be private (0600/0700 only, got ' + oct(dmode) + ')')
    check = chmod_probe if probe is None else probe
    observed = check(parent)
    if observed != 0o600:
        raise GuardError('chmod probe not honoured (got ' + oct(observed) + '); refusing')
    st = os.statvfs(parent)
    free = st.f_bavail * st.f_frsize
    if free < max_bytes:
        raise GuardError('insufficient free space for the requested backup budget')
    return real, parent


# Purpose: guarantee a secret never appears in any argv element.
# Inputs: argv list and secret string. Outputs: None. Side effects: none.
# Failure: raises GuardError when the secret is found.
def assert_no_secret_in_argv(argv, secret):
    if secret and any(secret in str(a) for a in argv):
        raise GuardError('refusing: credential would appear in argv')

# Purpose: remove known secret values from a log line before it is emitted.
# Inputs: text and iterable of secrets. Outputs: redacted text. Side effects: none.
# Failure: none; empty secrets are ignored.
def redact(text, secrets):
    out = str(text)
    for secret in secrets:
        if secret:
            out = out.replace(secret, '[REDACTED]')
    return out


# Purpose: build a mysqldump argv that contains no credentials.
# Inputs: dump binary, host, port, user, database, optional secret to assert against.
# Outputs: argv list. Side effects: none. Failure: raises GuardError on secret leak.
def build_dump_argv(dumper, host, port, user, database, secret=None):
    argv = [dumper, '--single-transaction', '--routines', '--triggers',
            '--set-gtid-purged=OFF', '--no-tablespaces',
            '--host=' + str(host), '--port=' + str(port),
            '--user=' + str(user), str(database)]
    assert_no_secret_in_argv(argv, secret)
    return argv

# Purpose: stream a SHA-256 digest of a file in one bounded pass.
# Inputs: path and chunk size. Outputs: lowercase hex digest. Side effects: one read.
# Failure: raises GuardError if the file cannot be read or is empty.
def sha256_file(path, chunk=1 << 20):
    import hashlib
    h = hashlib.sha256()
    total = 0
    try:
        with open(path, 'rb') as fh:
            while True:
                block = fh.read(chunk)
                if not block:
                    break
                total += len(block)
                h.update(block)
    except OSError as exc:
        raise GuardError('cannot read dump for checksum: ' + str(exc))
    if total == 0:
        raise GuardError('refusing empty dump')
    return h.hexdigest()


# Purpose: fail-closed INTEGRITY validation against a checksum sidecar. A match proves only
# that the bytes equal the sidecar's digest. It is NOT authenticity or provenance: anyone
# able to write both files can supply arbitrary SQL, so a match must never by itself qualify
# a dump for restore or authorise executing its contents.
# Inputs: dump path, sidecar path. Outputs: digest. Side effects: one bounded read pass.
# Failure: raises GuardError on missing/malformed sidecar or digest mismatch.
def verify_checksum(path, sidecar):
    import hmac
    import os
    try:
        with open(sidecar, 'r', encoding='ascii') as fh:
            line = fh.readline().strip()
    except OSError as exc:
        raise GuardError('missing checksum sidecar: ' + str(exc))
    parts = line.split()
    if len(parts) != 2 or len(parts[0]) != 64:
        raise GuardError('malformed checksum sidecar')
    expected = parts[0].lower()
    if os.path.basename(parts[1]) != os.path.basename(path):
        raise GuardError('checksum sidecar names a different dump')
    actual = sha256_file(path)
    if not hmac.compare_digest(actual, expected):
        raise GuardError('checksum mismatch; dump is not qualified')
    return actual

# Purpose: check a dump starts with the gzip magic bytes (cheap sanity check).
# Inputs: path. Outputs: True for gzip. Side effects: one small read.
# Failure: raises GuardError for a missing or non-gzip file.
def check_gzip_magic(path):
    try:
        with open(path, 'rb') as fh:
            magic = fh.read(2)
    except OSError as exc:
        raise GuardError('cannot open dump: ' + str(exc))
    if magic != b'\x1f\x8b':
        raise GuardError('dump is not gzip-compressed')
    return True


# Purpose: bound a streamed dump by size and wall-clock deadline.
# Inputs: bytes just read, running total, max bytes, deadline, monotonic now.
# Outputs: updated total. Side effects: none. Failure: raises GuardError on breach.
def bound_stream(chunk, total, max_bytes, deadline, now):
    total += len(chunk)
    if total > max_bytes:
        raise GuardError('dump exceeded the configured byte budget')
    if now > deadline:
        raise GuardError('dump exceeded the time budget')
    return total


# Purpose: stream a gzip payload as bounded chunks without ever materialising the whole
# decompressed dump in memory (the old read(max_bytes+1) could allocate up to the 100 GB
# ceiling). This is the only safe way to inspect a payload; it is not a restore mechanism.
# Inputs: path, byte budget, absolute deadline, monotonic-now callable, chunk size.
# Outputs: iterator of bytes chunks. Side effects: one bounded read pass.
# Failure: raises GuardError on breach, corruption or unreadable input.
def iter_bounded_gzip(path, max_bytes, deadline, now, chunk=1 << 16):
    import gzip
    total = 0
    try:
        with gzip.open(path, 'rb') as fh:
            while True:
                block = fh.read(chunk)
                if not block:
                    break
                total = bound_stream(block, total, max_bytes, deadline, now())
                yield block
    except GuardError:
        raise
    except (OSError, EOFError) as exc:
        raise GuardError('gzip stream read failed: ' + str(exc))

