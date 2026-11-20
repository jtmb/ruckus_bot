#!/usr/bin/env python3
"""Dedicated, isolated MySQL 8.4 backup/restore drills for ruckus_bot.

This is the ONLY component allowed to perform a live restore, and only because it
provisions and proves its own exclusively task-owned, H-backed, network-isolated,
disposable fixture. The generic ``ops/mysql_backup.py`` and
``ops/mysql_restore_drill.py`` are deliberately left fail-closed and are neither
modified nor bypassed; see ``docs/deploy/BACKUP-RESTORE.md`` sections 6-9.

Two modes share the same ownership/isolation gates:
  * ``--mode synthetic`` (``execute_drill``) is the ORIGINAL synthetic-infrastructure
    drill. Its one executed run (2026-11-18) is retained as *infrastructure history
    only*; its invented migration IDs/columns are not migration-compatibility proof.
  * ``--mode migration`` (default; ``execute_migration_drill``) exercises the ACTUAL
    shipped migrations from the already-built local image, against a real legacy
    baseline with preserved synthetic rows, then backs up and restores. It is the
    only mode that makes a migration-compatibility claim.

Guarantees enforced here (all fail closed):
  * brand-new, uniquely named containers and named volumes; no reuse, no host
    ports, no ``--network none`` escape, no host/bind mounts, no production access;
  * volumes proven to live on a POSIX-enforcing ext4 store backed by a file on
    physical H; project artifact budget and physical space/inodes preflighted;
  * two independent instances (source seeded, restore empty), MySQL 8.4 tools
    from the already-cached image (no build, no pull);
  * synthetic random credentials held only in process memory, passed by docker
    ``-e NAME`` (environment passthrough) or stdin, never in argv/logs/config;
  * the only dump consumed is produced by this same run; no user/production dump
    is ever opened; all SQL is narrow and generated below;
  * bounded timeouts and byte budgets throughout, no retry loop, and exact
    cleanup of everything this run created in a ``finally`` block.
"""
import argparse
import gzip
import hashlib
import json
import os
import re
import secrets
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import backup_guard as g

IMAGE = 'mysql:8.4'
NETWORK = 'none'                      # built-in null driver: no TCP, no outbound
OPT_IN = 'RUCKUS_ISOLATED_DRILL_ALLOW'
PROJECT_H = '/mnt/h/AgentArtifacts/projects/ruckus_bot'
DRILL_TABLES = ('schema_migrations', 'bot_logs', 'credentials', 'sessions',
                'bot_heartbeat', 'guild_settings', 'quotes')
MIGRATIONS = ('0001_baseline', '0002_indexes', '0003_sessions', '0004_heartbeat',
              '0005_quotes', '0006_guild_settings', '0007_password_column',
              '0008_logs_json')

# Real-mode pins. The built image and the shipped migration source it contains are
# the exact artifacts exercised by ``--mode migration``; the drill refuses on any
# drift. Hashes were verified 2026-11-18 against the cached image and the checkout.
MIGRATION_IMAGE = 'ruckus_bot:verify-20261117-235846'
MIGRATION_IMAGE_ID = 'sha256:60f6bf6df5a836ce37cc3ffe108c259127f27d5d3f69023f5e20526c7e140461'
MIGRATION_SOURCE_SHA256 = '7efc74f51bc01dc4704aeaa0e043dab5786da3894d700da021c20f4b5a30045d'
MIGRATION_SOURCE_PATH = '/app/api/src/migrations/index.js'
MIGRATION_ENTRY = 'api/src/api.js'                 # API only; Discord/bot is never launched
REAL_MIGRATIONS = ('0001_baseline', '0002_sessions_and_heartbeat', '0003_log_indexes')
REAL_INDEXES = ('idx_bot_logs_time', 'idx_bot_logs_type_time')
MIG_TABLES = ('schema_migrations', 'bot_logs', 'credentials', 'sessions', 'bot_heartbeat')
API_HEALTH_PORT = 3003


class DrillError(Exception):
    """Raised by every gate/phase failure; callers must treat it as a hard stop."""


# Purpose: emit one structured, secret-free completion/refusal event.
# Inputs: event name, sink callable, arbitrary detail fields. Outputs: None.
# Side effects: one JSON line to the sink. Failure: none (never raises).
def event(emit, name, **details):
    rec = {'ts': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'event': name}
    rec.update(details)
    try:
        emit(json.dumps(rec, sort_keys=True))
    except Exception:
        pass


# Purpose: derive a unique, disposable, guard-approved run/schema name.
# Inputs: optional fixed id/entropy for tests. Outputs: (run_id, schema).
# Side effects: none. Failure: raises DrillError if the name violates the guard.
def make_ids(now=None, entropy=None):
    stamp = time.strftime('%Y%m%dT%H%M%S', time.gmtime() if now is None else now)
    run = (stamp + '_' + (entropy or secrets.token_hex(4))).lower()
    run = re.sub(r'[^a-z0-9_]', '_', run)[:40]
    schema = g.SCHEMA_PREFIX + run
    if not g.is_disposable_schema(schema):
        raise DrillError('invalid disposable schema name: ' + schema)
    return run, schema


# Purpose: bounded wrapper over the docker CLI with a short command timeout.
# Inputs: base timeout and optional base environment. Outputs: CompletedProcess.
# Side effects: one child process; stderr is deliberately never logged.
# Failure: raises DrillError on non-zero exit or timeout.
class Docker:
    def __init__(self, timeout=180, env=None):
        self.timeout = timeout
        self.base_env = env

    def _env(self, extra):
        e = os.environ.copy() if self.base_env is None else dict(self.base_env)
        if extra:
            e.update(extra)
        return e

    def run(self, args, inp=None, extra_env=None, check=True, timeout=None):
        try:
            cp = subprocess.run(['docker'] + list(args), input=inp,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                timeout=timeout or self.timeout, env=self._env(extra_env))
        except subprocess.TimeoutExpired as exc:
            raise DrillError('docker command timed out: ' + ' '.join(args[:3])) from exc
        if check and cp.returncode != 0:
            # stderr withheld: it is never logged (no secret/argv leak).
            raise DrillError('docker command failed rc=%d: %s' % (cp.returncode, ' '.join(args[:3])))
        return cp

    def text(self, args, **kw):
        return self.run(args, **kw).stdout.decode('utf-8', 'replace').strip()


# Purpose: parse the mount entry covering a path, including its source device.
# Inputs: absolute path. Outputs: (source, fstype, mountpoint).
# Side effects: one bounded /proc/mounts read. Failure: raises DrillError.
def mount_for(path):
    best = None
    with open('/proc/mounts', 'r', encoding='utf-8', errors='replace') as fh:
        for line in fh:
            parts = line.split()
            if len(parts) < 3:
                continue
            src, mp, fstype = parts[0], parts[1], parts[2]
            if path == mp or path.startswith(mp.rstrip('/') + '/'):
                if best is None or len(mp) > len(best[2]):
                    best = (src, fstype, mp)
    if best is None:
        raise DrillError('no mount covers ' + path)
    return best


# Purpose: prove physical-H/ext4 backing and preflight the 100 GB + space/inodes.
# Inputs: docker wrapper, emitter. Outputs: dict of facts. Side effects: none.
# Failure: raises DrillError on any unmet gate.
def preflight(docker, emit):
    image = docker.text(['image', 'inspect', IMAGE, '--format', '{{.Id}}'])
    if not image.startswith('sha256:'):
        raise DrillError('cached ' + IMAGE + ' image is unavailable (no build/pull performed)')
    root = docker.text(['info', '--format', '{{.DockerRootDir}}'])
    src, fstype, mp = mount_for(root)
    if fstype not in g.POSIX_FS_ALLOW:
        raise DrillError('docker root is not on a POSIX-enforcing fs: ' + fstype)
    backing = ''
    loop = re.match(r'(/dev/loop\d+)', src)
    if loop:
        bf = '/sys/block/%s/loop/backing_file' % loop.group(1).split('/')[-1]
        try:
            with open(bf, 'r', encoding='utf-8') as fh:
                backing = fh.read().strip()
        except OSError:
            backing = ''
    if not backing.startswith('/mnt/h/'):
        raise DrillError('docker store is not backed by a file on physical H: ' + backing)
    if not root.startswith(mp.rstrip('/') + '/') and root != mp:
        raise DrillError('docker root is outside its reported mount')
    used = int(subprocess.run(['du', '-sb', PROJECT_H], stdout=subprocess.PIPE,
                              check=True, timeout=60).stdout.split()[0])
    if used > g.MAX_BYTES_CEILING:
        raise DrillError('project artifacts already exceed the 100 GB ceiling: %d' % used)
    st = os.statvfs('/mnt/h')
    free_h = st.f_bavail * st.f_frsize
    # The docker root is root-only; query the store by device, not by that path.
    dev = src.split('[')[0]
    df_h = subprocess.run(['df', '-h', dev], stdout=subprocess.PIPE,
                          check=True, timeout=30).stdout.decode().splitlines()
    df_i = subprocess.run(['df', '-i', dev], stdout=subprocess.PIPE,
                          check=True, timeout=30).stdout.decode().splitlines()
    facts = {'image': image, 'docker_root': root, 'store_source': src,
             'store_fstype': fstype, 'store_mount': mp, 'backing_file': backing,
             'project_bytes': used, 'project_ceiling': g.MAX_BYTES_CEILING,
             'free_h_bytes': free_h,
             'store_space': df_h[-1] if df_h else '', 'inodes': df_i[-1] if df_i else ''}
    event(emit, 'preflight.ok', **facts)
    return facts


# Purpose: refuse if any resource name for this run already exists (interrupted
# state is reported, never silently retried). Inputs: docker, names, emitter.
# Outputs: None. Side effects: two read-only docker queries. Failure: DrillError.
def assert_no_prior_state(docker, names, emit):
    ps = docker.text(['ps', '-a', '--filter', 'name=^' + names['prefix'],
                      '--format', '{{.Names}}'])
    vols = docker.text(['volume', 'ls', '--filter', 'name=' + names['prefix'],
                        '--format', '{{.Name}}'])
    if ps or vols:
        event(emit, 'refused.prior_state', containers=ps, volumes=vols)
        raise DrillError('pre-existing owned state for this run; no retry loop')


# Purpose: generate narrow synthetic DDL (schema and the documented tables).
# Inputs: schema, marker (kept for a symmetric helper signature). Outputs: SQL text.
# Side effects: none. Failure: none. No production SQL is read.
def seed_sql(schema, marker):
    return f"""
CREATE DATABASE IF NOT EXISTS `{schema}` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `{schema}`;
CREATE TABLE schema_migrations (version VARCHAR(64) PRIMARY KEY, checksum CHAR(64), applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE bot_logs (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, event_type VARCHAR(64), event_data JSON, guild_id VARCHAR(32) NULL, user_id VARCHAR(32) NULL, request_id CHAR(36) NULL, timestamp TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3));
CREATE TABLE credentials (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, username VARCHAR(32) UNIQUE, password_hash VARCHAR(255), role ENUM('admin','operator','viewer'), disabled TINYINT(1) DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, last_login_at TIMESTAMP NULL);
CREATE TABLE sessions (id CHAR(64) PRIMARY KEY, credential_id INT UNSIGNED, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, expires_at TIMESTAMP, last_seen_at TIMESTAMP NULL, ip_hash VARBINARY(64), user_agent VARCHAR(255));
CREATE TABLE bot_heartbeat (id TINYINT PRIMARY KEY, bot_id VARCHAR(64), bot_name VARCHAR(64), started_at TIMESTAMP, heartbeat_at TIMESTAMP(3), latency_ms INT, guilds JSON, session_id CHAR(36));
CREATE TABLE guild_settings (guild_id VARCHAR(32) PRIMARY KEY, prefix VARCHAR(8) DEFAULT '!', disabled_features JSON, quiet_channels JSON, units ENUM('metric','imperial') DEFAULT 'metric', owner_user_id VARCHAR(32) NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE quotes (id INT UNSIGNED PRIMARY KEY, text VARCHAR(500) UNIQUE, category VARCHAR(32) DEFAULT 'general', added_by VARCHAR(32), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
"""


# Purpose: generate narrow INSERT statements carrying the provenance marker.
# Inputs: schema, marker, password. Outputs: SQL text. Side effects: none.
# Failure: none.
def fixture_rows_sql(schema, marker, password):
    pw = password.replace("'", "''")
    m = marker.replace("'", "''")
    mig = ''.join("INSERT INTO `%s`.schema_migrations(version,checksum) VALUES('%s',REPEAT('a',64));\n" % (schema, v) for v in MIGRATIONS)
    return mig + f"""
INSERT INTO `{schema}`.bot_logs(event_type,event_data,guild_id,user_id) VALUES('bot_ready',JSON_OBJECT('marker','{m}','n',1),'g1','u1'),('user_interaction',JSON_OBJECT('marker','{m}','n',2),'g2','u2');
INSERT INTO `{schema}`.credentials(username,password_hash,role) VALUES('drilladmin','bcrypt-synthetic','admin'),('drillviewer','bcrypt-synthetic','viewer');
INSERT INTO `{schema}`.sessions(id,credential_id,expires_at,ip_hash,user_agent) VALUES(REPEAT('a',64),1,DATE_ADD(NOW(),INTERVAL 12 HOUR),UNHEX('00'),'synthetic');
INSERT INTO `{schema}`.bot_heartbeat(id,bot_id,bot_name,started_at,heartbeat_at,latency_ms,guilds,session_id) VALUES(1,'b1','drill-bot',NOW(),NOW(3),7,JSON_ARRAY(JSON_OBJECT('id','g1')),'00000000-0000-0000-0000-000000000001');
INSERT INTO `{schema}`.guild_settings(guild_id,prefix,disabled_features,quiet_channels) VALUES('g1','!',JSON_ARRAY(),JSON_ARRAY());
INSERT INTO `{schema}`.quotes(id,text,category,added_by) VALUES(1,'{m}::alpha','general','drill'),(2,'{m}::beta','general','drill');
CREATE USER IF NOT EXISTS 'drill'@'localhost' IDENTIFIED BY '{pw}';
GRANT ALL ON `{schema}`.* TO 'drill'@'localhost';
FLUSH PRIVILEGES;
"""


# Purpose: build the REAL pre-migration baseline schema the shipped migrator adopts.
# Inputs: disposable schema, provenance marker (kept for a symmetric helper signature).
# Outputs: narrow DDL text with exactly the columns the code reads; no invented
# version/password_hash columns and no pre-existing schema_migrations (migrate creates it).
# Side effects: none. Failure: none. No production SQL is read.
def baseline_legacy_sql(schema, marker):
    return f"""
CREATE DATABASE IF NOT EXISTS `{schema}` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `{schema}`;
CREATE TABLE bot_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(255) NOT NULL,
  event_data TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE credentials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(255) NOT NULL
);
CREATE TABLE sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);
CREATE TABLE bot_heartbeat (
  id TINYINT PRIMARY KEY,
  bot_id VARCHAR(64) NOT NULL,
  bot_name VARCHAR(255) NOT NULL,
  guilds TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


# Purpose: insert synthetic legacy rows that must survive the real migration.
# Inputs: schema, marker, synthetic password. Outputs: narrow INSERT/GRANT SQL.
# Side effects: none. Failure: none. Sessions expire in the future so the API's
# startup sweep never deletes the preserved row; creds use the shipped 'password' column.
def preserved_rows_sql(schema, marker, password):
    m = marker.replace("'", "''")
    pw = password.replace("'", "''")
    token = hashlib.sha256(marker.encode('utf-8')).hexdigest()
    return f"""
USE `{schema}`;
INSERT INTO bot_logs(event_type,event_data) VALUES('legacy_baseline','{m}');
INSERT INTO credentials(username,password,role) VALUES('legacy_{m}','synthetic-legacy-hash','user');
INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES('{token}',1,NOW(),DATE_ADD(NOW(),INTERVAL 24 HOUR));
INSERT INTO bot_heartbeat(id,bot_id,bot_name,guilds,started_at,updated_at) VALUES(1,'{m}','legacy-bot','[]',NOW(),NOW());
CREATE USER IF NOT EXISTS 'drill'@'localhost' IDENTIFIED BY '{pw}';
CREATE USER IF NOT EXISTS 'drill'@'127.0.0.1' IDENTIFIED BY '{pw}';
GRANT ALL ON `{schema}`.* TO 'drill'@'localhost';
GRANT ALL ON `{schema}`.* TO 'drill'@'127.0.0.1';
FLUSH PRIVILEGES;
"""


# Purpose: bind the real drill to the exact built image and shipped migration source.
# Inputs: docker, emitter. Outputs: pin facts dict. Side effects: one read-only image
# inspect plus one --rm sha256sum container. Failure: DrillError on any hash drift.
def preflight_migration_image(docker, emit):
    iid = docker.text(['image', 'inspect', MIGRATION_IMAGE, '--format', '{{.Id}}'])
    if iid != MIGRATION_IMAGE_ID:
        raise DrillError('built image id drift: expected the pinned verify image')
    embedded = docker.text(['run', '--rm', '--network', NETWORK, '--entrypoint',
                            'sha256sum', MIGRATION_IMAGE, MIGRATION_SOURCE_PATH])
    if embedded.split()[:1] != [MIGRATION_SOURCE_SHA256]:
        raise DrillError('shipped migration source hash drift in built image')
    checkout = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            'api', 'src', 'migrations', 'index.js')
    local = ''
    if os.path.isfile(checkout):
        with open(checkout, 'rb') as fh:
            local = hashlib.sha256(fh.read()).hexdigest()
    if local and local != MIGRATION_SOURCE_SHA256:
        raise DrillError('checkout migration source drifts from the built image')
    facts = {'image': MIGRATION_IMAGE, 'image_id': iid,
             'migration_sha256': MIGRATION_SOURCE_SHA256, 'checkout_sha256': local}
    event(emit, 'migration_image.pinned', **facts)
    return facts


# Purpose: bounded wait on the API's own supported health/ready endpoints.
# Inputs: docker, api container, path, expected JSON fragment, attempts/sleep/timeout.
# Outputs: response body. Side effects: bounded node-fetch execs. Failure: DrillError
# after the fixed budget, with the last (secret-free) body for readback.
def _api_health(docker, api, path, expect, attempts=40, sleep=1, timeout=20):
    script = ("fetch('http://127.0.0.1:%d%s').then(r=>r.text())"
              ".then(t=>process.stdout.write(t)).catch(()=>{})" % (API_HEALTH_PORT, path))
    last = ''
    for _ in range(attempts):
        cp = docker.run(['exec', api, 'node', '-e', script], check=False, timeout=timeout)
        last = cp.stdout.decode('utf-8', 'replace')
        if expect in last:
            return last
        time.sleep(sleep)
    raise DrillError('API %s health wait exhausted (last=%r)' % (path, last[:80]))


# Purpose: prove the API container shares only the source's null network namespace.
# Inputs: docker, api and source names, emitter. Outputs: None. Side effects: inspect.
# Failure: DrillError unless network is a shared container netns with no ports/binds.
def _assert_isolated_api(docker, name, src, emit):
    net = docker.text(['inspect', '--format', '{{.HostConfig.NetworkMode}}', name])
    ports = docker.text(['inspect', '--format', '{{json .HostConfig.PortBindings}}', name])
    binds = docker.text(['inspect', '--format', '{{json .HostConfig.Binds}}', name])
    # Docker reports the peer by full container id, not by the name we passed, so
    # prove isolation by inspecting that peer's own mode (must be the null driver).
    peer = net.split(':', 1)[1] if net.startswith('container:') else ''
    peer_net = docker.text(['inspect', '--format', '{{.HostConfig.NetworkMode}}',
                            peer]) if peer else ''
    ok = (peer_net == NETWORK and ports in ('null', '', '{}')
          and not json.loads(binds or '[]'))
    if not ok:
        event(emit, 'refused.api_isolation', container=name, network=net,
              peer_network=peer_net, ports=ports, host_binds=binds)
        raise DrillError('API container isolation gate failed for ' + name)
    event(emit, 'api_isolation.ok', container=name, network=net,
          peer_network=peer_net, ports=ports)


# Purpose: collect narrow counts, real migration IDs, preserved rows and indexes.
# Inputs: docker, container, schema, synthetic password, marker. Outputs: dict.
# Side effects: read-only queries. Failure: DrillError on a failed query.
def observe_migration(docker, name, schema, password, marker):
    env = {'MYSQL_PWD': password}

    def q(sql):
        return docker.text(['exec', '-e', 'MYSQL_PWD', name, 'mysql', '-u', 'drill',
                            '-N', '-B', '-e', sql], extra_env=env).splitlines()

    counts = {t: (q('SELECT COUNT(*) FROM `%s`.`%s`' % (schema, t)) or ['?'])[0]
              for t in MIG_TABLES}
    return {
        'counts': counts,
        'migrations': q('SELECT id FROM `%s`.schema_migrations ORDER BY id' % schema),
        'preserved_credentials': q("SELECT username,role FROM `%s`.credentials "
                                   "WHERE username LIKE '%%%s%%' ORDER BY username" % (schema, marker)),
        'preserved_logs': q("SELECT event_type,event_data FROM `%s`.bot_logs "
                            "WHERE event_data LIKE '%%%s%%' ORDER BY id" % (schema, marker)),
        'indexes': q("SELECT DISTINCT INDEX_NAME FROM information_schema.statistics "
                     "WHERE table_schema='%s' AND table_name='bot_logs' "
                     "AND INDEX_NAME LIKE 'idx_bot_logs%%' ORDER BY INDEX_NAME" % schema),
    }


# Purpose: compare migrated source vs restored observations using REAL IDs/data.
# Inputs: two observation dicts. Outputs: checks dict. Side effects: none.
# Failure: none (caller fails closed on any False).
def compare_migration(source, restore):
    checks = {}
    for t in MIG_TABLES:
        checks['count:' + t] = source['counts'].get(t) == restore['counts'].get(t)
    checks['migration_ids'] = (source['migrations'] == restore['migrations']
                               == list(REAL_MIGRATIONS))
    checks['preserved_credentials'] = bool(source['preserved_credentials']) and \
        source['preserved_credentials'] == restore['preserved_credentials']
    checks['preserved_logs'] = bool(source['preserved_logs']) and \
        source['preserved_logs'] == restore['preserved_logs']
    checks['indexes'] = (source['indexes'] == restore['indexes']
                         and set(REAL_INDEXES).issubset(set(restore['indexes'])))
    return checks


# Purpose: stream a run-produced dump, decompressed, in bounded chunks from the
# source container. Inputs: docker, container, path, byte/time budget, clock.
# Outputs: iterator of decompressed chunks. Side effects: one docker exec child.
# Failure: DrillError on budget breach, corruption or non-zero exit.
def iter_source_dump(docker, container, path, max_bytes, deadline, now=time.monotonic, chunk=1 << 16):
    proc = subprocess.Popen(['docker', 'exec', container, 'cat', path],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            env=docker._env(None))
    total = 0
    try:
        with gzip.GzipFile(fileobj=proc.stdout, mode='rb') as gz:
            while True:
                block = gz.read(chunk)
                if not block:
                    break
                total = g.bound_stream(block, total, max_bytes, deadline, now())
                yield block
        proc.stderr.read(4096)
        rc = proc.wait(timeout=30)
        if rc != 0:
            raise DrillError('reading run-produced dump failed rc=%d' % rc)
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=10)


# Purpose: compare source vs restored row counts, data and migration IDs.
# Inputs: two observation dicts and the table tuple. Outputs: checks dict.
# Side effects: none. Failure: none (caller fails closed on any False).
def compare(source, restore, tables=DRILL_TABLES):
    checks = {}
    for t in tables:
        checks['count:' + t] = source['counts'].get(t) == restore['counts'].get(t)
    checks['migration_ids'] = source['migrations'] == restore['migrations']
    checks['quotes_data'] = source['quotes'] == restore['quotes']
    checks['marker'] = bool(source['marker']) and source['marker'] == restore['marker']
    return checks


# Purpose: provision, exercise, compare and clean up the whole isolated drill.
# Inputs: config dict, docker wrapper, emitter. Outputs: result dict.
# Side effects: creates and then removes only this run's containers/volumes.
# Failure: raises DrillError on any gate/phase failure; finally still cleans up.
def execute_drill(cfg, docker, emit=print):
    run, schema = make_ids(cfg.get('now'), cfg.get('entropy'))
    marker = 'RUNMARK-' + run
    password = cfg.get('password') or secrets.token_urlsafe(24)
    pfx = 'ruckusdrill_' + run
    names = {'prefix': pfx, 'src': pfx + '_src', 'rst': pfx + '_rst',
             'srcdb': pfx + '_srcdb', 'srcart': pfx + '_srcart', 'rstd': pfx + '_rstd'}
    names['dump'] = '/drill-artifacts/' + schema + '.sql.gz'
    names['side'] = names['dump'] + '.sha256'
    made_c, made_v = [], []
    event(emit, 'drill.start', run_id=run, schema=schema, image=IMAGE, network=NETWORK)
    try:
        preflight(docker, emit)
        assert_no_prior_state(docker, names, emit)
        for key in ('srcdb', 'srcart', 'rstd'):
            docker.text(['volume', 'create', '--name', names[key]])
            made_v.append(names[key])
            mp = docker.text(['volume', 'inspect', names[key], '--format', '{{.Mountpoint}}'])
            src, fst, _ = mount_for(mp)
            if fst not in g.POSIX_FS_ALLOW:
                raise DrillError('volume is not on a POSIX-enforcing store: ' + fst)
            event(emit, 'volume.created', volume=names[key], mountpoint=mp, fstype=fst, source=src)

        # Source: fresh instance, no network, no ports, named volumes only.
        docker.run(['run', '-d', '--name', names['src'], '--network', NETWORK,
                    '-v', names['srcdb'] + ':/var/lib/mysql',
                    '-v', names['srcart'] + ':/drill-artifacts',
                    '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', IMAGE])
        made_c.append(names['src'])
        _assert_isolated(docker, names['src'], emit)
        _wait_ready(docker, names['src'])
        docker.run(['exec', '-i', names['src'], 'mysql', '-u', 'root'],
                   inp=seed_sql(schema, marker).encode())
        docker.run(['exec', '-i', names['src'], 'mysql', '-u', 'root'],
                   inp=fixture_rows_sql(schema, marker, password).encode())
        event(emit, 'source.seeded', schema=schema, tables=len(DRILL_TABLES), migrations=len(MIGRATIONS))

        # Backup: mysqldump/gzip from the cached image into the owned ext4 volume.
        budget = int(cfg.get('max_bytes', 5_000_000))
        deadline = time.monotonic() + int(cfg.get('timeout', 900))
        dump_cmd = ("mysqldump --single-transaction --routines --triggers "
                    "--set-gtid-purged=OFF --no-tablespaces --protocol=SOCKET "
                    "--user=drill %s | gzip -n > %s && chmod 600 %s && "
                    "sha256sum %s > %s && chmod 600 %s" %
                    (schema, names['dump'], names['dump'], names['dump'], names['side'], names['side']))
        docker.run(['exec', '-e', 'MYSQL_PWD', names['src'], 'sh', '-c', dump_cmd],
                   extra_env={'MYSQL_PWD': password}, timeout=int(cfg.get('timeout', 900)))
        checks = docker.text(['exec', names['src'], 'sh', '-c',
                              'cd /drill-artifacts && sha256sum -c %s && stat -c %%a %s && '
                              'stat -c %%a %s && stat -f -c %%T /drill-artifacts' %
                              (os.path.basename(names['side']), os.path.basename(names['dump']),
                               os.path.basename(names['side']))])
        # GNU stat reports the ext family as "ext2/ext3" even for ext4; the
        # authoritative ext4+physical-H proof is from preflight's mount table.
        if ('OK' not in checks or '600' not in checks
                or not ('ext4' in checks or 'ext2/ext3' in checks)):
            raise DrillError('dump integrity/mode/store proof incomplete: ' + checks[:120])
        size = int(docker.text(['exec', names['src'], 'stat', '-c', '%s', names['dump']]))
        if size <= 0 or size > budget:
            raise DrillError('run-produced dump size outside budget: %d' % size)
        # Provenance: the marker inserted by this run must be inside this dump.
        seen = bytearray()
        payload = 0
        for block in iter_source_dump(docker, names['src'], names['dump'], budget, deadline,
                                      cfg.get('now_fn', time.monotonic)):
            payload += len(block)
            seen.extend(block)
        if marker.encode() not in bytes(seen):
            raise DrillError('run-produced dump lacks this run\'s provenance marker')
        digest = docker.text(['exec', names['src'], 'sha256sum', names['dump']]).split()[0]
        event(emit, 'backup.verified', compressed=size, payload=payload,
              sha256=digest, mode='600', store='ext-family-on-H-ext4', marker=marker)

        # Restore: a SEPARATE, freshly created EMPTY server/volume.
        docker.run(['run', '-d', '--name', names['rst'], '--network', NETWORK,
                    '-v', names['rstd'] + ':/var/lib/mysql',
                    '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', IMAGE])
        made_c.append(names['rst'])
        _assert_isolated(docker, names['rst'], emit)
        _wait_ready(docker, names['rst'])
        docker.run(['exec', '-i', names['rst'], 'mysql', '-u', 'root'],
                   inp=seed_sql(schema, marker).split('USE ')[0].encode())
        docker.run(['exec', '-i', names['rst'], 'mysql', '-u', 'root'],
                   inp=("CREATE USER IF NOT EXISTS 'drill'@'localhost' IDENTIFIED BY '%s';\n"
                        "GRANT ALL ON `%s`.* TO 'drill'@'localhost';\nFLUSH PRIVILEGES;\n" %
                        (password.replace("'", "''"), schema)).encode())
        docker.run(['exec', names['rst'], 'mysql', '-u', 'root', '-e',
                    'CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci' % schema])
        # Trusted by provenance (same run) but still statement-level + bounded.
        proc = subprocess.Popen(['docker', 'exec', '-i', '-e', 'MYSQL_PWD', names['rst'],
                                 'mysql', '-u', 'drill', schema],
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, env=docker._env({'MYSQL_PWD': password}))
        try:
            for block in iter_source_dump(docker, names['src'], names['dump'], budget, deadline,
                                          cfg.get('now_fn', time.monotonic)):
                proc.stdin.write(block)
            proc.stdin.close()
            proc.stdout.read(8192)
            proc.stderr.read(8192)
            rc = proc.wait(timeout=int(cfg.get('timeout', 900)))
            if rc != 0:
                raise DrillError('restore client exited non-zero rc=%d' % rc)
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait(timeout=10)
        event(emit, 'restore.applied', schema=schema)

        source = _observe(docker, names['src'], schema, password, marker)
        restore = _observe(docker, names['rst'], schema, password, marker)
        checks = compare(source, restore)
        event(emit, 'drill.complete', checks=checks, source=source, restore=restore,
              schema=schema, run_id=run)
        if not all(checks.values()):
            raise DrillError('restore comparison failed: ' + repr(checks))
        return {'run_id': run, 'schema': schema, 'sha256': digest, 'checks': checks,
                'source': source, 'restore': restore}
    finally:
        _cleanup(docker, made_c, made_v, emit)


# Purpose: provision, migrate, back up, restore and compare the REAL shipped
# migrations on a distinct, network-isolated, same-run disposable fixture.
# Inputs: config dict, docker wrapper, emitter. Outputs: result dict.
# Side effects: creates then removes only this run's containers/volumes; the API
# runs with entrypoint=node (Discord/bot is never launched).
# Failure: DrillError on any gate/phase failure; finally still cleans up.
def execute_migration_drill(cfg, docker, emit=print):
    run, schema = make_ids(cfg.get('now'), cfg.get('entropy'))
    marker = 'RUNMIG-' + run
    password = cfg.get('password') or secrets.token_urlsafe(24)
    pfx = 'ruckusmig_' + run
    names = {'prefix': pfx, 'src': pfx + '_src', 'api': pfx + '_api',
             'rst': pfx + '_rst', 'srcdb': pfx + '_srcdb',
             'srcart': pfx + '_srcart', 'rstd': pfx + '_rstd'}
    names['dump'] = '/drill-artifacts/' + schema + '.sql.gz'
    names['side'] = names['dump'] + '.sha256'
    made_c, made_v = [], []
    event(emit, 'migration_drill.start', run_id=run, schema=schema,
          source_image=MIGRATION_IMAGE, mysql_image=IMAGE, network=NETWORK)
    try:
        preflight(docker, emit)                 # H/ext4 backing + 100 GB + space preflight
        pin = preflight_migration_image(docker, emit)   # built image + source hash binding
        assert_no_prior_state(docker, names, emit)      # no interrupted state; no retry
        for key in ('srcdb', 'srcart', 'rstd'):
            docker.text(['volume', 'create', '--name', names[key]])
            made_v.append(names[key])
            mp = docker.text(['volume', 'inspect', names[key], '--format', '{{.Mountpoint}}'])
            src, fst, _ = mount_for(mp)
            if fst not in g.POSIX_FS_ALLOW:
                raise DrillError('volume is not on a POSIX-enforcing store: ' + fst)
            event(emit, 'volume.created', volume=names[key], mountpoint=mp,
                  fstype=fst, source=src)

        # Source MySQL on the null network; legacy baseline + preserved rows.
        docker.run(['run', '-d', '--name', names['src'], '--network', NETWORK,
                    '-v', names['srcdb'] + ':/var/lib/mysql',
                    '-v', names['srcart'] + ':/drill-artifacts',
                    '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', IMAGE])
        made_c.append(names['src'])
        _assert_isolated(docker, names['src'], emit)
        _wait_ready(docker, names['src'])
        docker.run(['exec', '-i', names['src'], 'mysql', '-u', 'root'],
                   inp=baseline_legacy_sql(schema, marker).encode())
        docker.run(['exec', '-i', names['src'], 'mysql', '-u', 'root'],
                   inp=preserved_rows_sql(schema, marker, password).encode())
        event(emit, 'baseline.seeded', schema=schema, tables=len(MIG_TABLES), marker=marker)

        # API from the built image: entrypoint overridden to node so Discord never
        # starts. It joins the source's null netns (no new bridge/network, no egress).
        # MYSQL_PASSWORD reaches docker via env passthrough: argv holds only its name.
        docker.run(['run', '-d', '--name', names['api'], '--network', 'container:' + names['src'],
                    '--entrypoint', 'node', '-e', 'MYSQL_HOST=127.0.0.1',
                    '-e', 'MYSQL_DATABASE=' + schema, '-e', 'MYSQL_USER=drill',
                    '-e', 'MYSQL_PASSWORD', '-e', 'PORT=' + str(API_HEALTH_PORT),
                    MIGRATION_IMAGE, MIGRATION_ENTRY], extra_env={'MYSQL_PASSWORD': password})
        made_c.insert(0, names['api'])   # clean up the API before its shared-netns source
        _assert_isolated_api(docker, names['api'], names['src'], emit)
        health = _api_health(docker, names['api'], '/health', '"status":"ok"')
        ready = _api_health(docker, names['api'], '/ready', '"status":"ready"')
        applied_line = next((line for line in docker.text(['logs', names['api']]).splitlines()
                             if 'Applied migrations:' in line), '')
        if ', '.join(REAL_MIGRATIONS) not in applied_line:
            raise DrillError('API did not report the three shipped migration IDs')
        event(emit, 'migration.applied', applied=applied_line.strip(),
              health=health, ready=ready)

        # Runtime DB interface: real IDs, preserved data and 0003 indexes on source.
        src_obs = observe_migration(docker, names['src'], schema, password, marker)
        if src_obs['migrations'] != list(REAL_MIGRATIONS):
            raise DrillError('schema_migrations does not contain the shipped IDs')
        if not src_obs['preserved_credentials'] or not src_obs['preserved_logs']:
            raise DrillError('preserved legacy rows were lost during migration')
        if not set(REAL_INDEXES).issubset(set(src_obs['indexes'])):
            raise DrillError('0003_log_indexes did not create the shipped indexes')
        event(emit, 'migration.verified', migrations=src_obs['migrations'],
              preserved_credentials=src_obs['preserved_credentials'],
              preserved_logs=src_obs['preserved_logs'], indexes=src_obs['indexes'])

        # Backup: run-produced dump on the owned ext4 volume, marker proven.
        budget = int(cfg.get('max_bytes', 5_000_000))
        deadline = time.monotonic() + int(cfg.get('timeout', 900))
        dump_cmd = ("mysqldump --single-transaction --routines --triggers "
                    "--set-gtid-purged=OFF --no-tablespaces --protocol=SOCKET "
                    "--user=drill %s | gzip -n > %s && chmod 600 %s && "
                    "sha256sum %s > %s && chmod 600 %s" %
                    (schema, names['dump'], names['dump'], names['dump'], names['side'], names['side']))
        docker.run(['exec', '-e', 'MYSQL_PWD', names['src'], 'sh', '-c', dump_cmd],
                   extra_env={'MYSQL_PWD': password}, timeout=int(cfg.get('timeout', 900)))
        proof = docker.text(['exec', names['src'], 'sh', '-c',
                             'cd /drill-artifacts && sha256sum -c %s && stat -c %%a %s && '
                             'stat -c %%a %s && stat -f -c %%T /drill-artifacts' %
                             (os.path.basename(names['side']), os.path.basename(names['dump']),
                              os.path.basename(names['side']))])
        if ('OK' not in proof or '600' not in proof
                or not ('ext4' in proof or 'ext2/ext3' in proof)):
            raise DrillError('dump integrity/mode/store proof incomplete: ' + proof[:120])
        size = int(docker.text(['exec', names['src'], 'stat', '-c', '%s', names['dump']]))
        if size <= 0 or size > budget:
            raise DrillError('run-produced dump size outside budget: %d' % size)
        seen = bytearray()
        payload = 0
        for block in iter_source_dump(docker, names['src'], names['dump'], budget, deadline,
                                      cfg.get('now_fn', time.monotonic)):
            payload += len(block)
            seen.extend(block)
        if marker.encode() not in bytes(seen):
            raise DrillError('run-produced dump lacks this run\'s provenance marker')
        digest = docker.text(['exec', names['src'], 'sha256sum', names['dump']]).split()[0]
        event(emit, 'backup.verified', compressed=size, payload=payload,
              sha256=digest, mode='600', store='ext-family-on-H-ext4', marker=marker)

        # Restore: a SEPARATE, freshly created EMPTY server/volume on the null netns.
        docker.run(['run', '-d', '--name', names['rst'], '--network', NETWORK,
                    '-v', names['rstd'] + ':/var/lib/mysql',
                    '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', IMAGE])
        made_c.append(names['rst'])
        _assert_isolated(docker, names['rst'], emit)
        _wait_ready(docker, names['rst'])
        docker.run(['exec', '-i', names['rst'], 'mysql', '-u', 'root'],
                   inp=("CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 "
                        "COLLATE utf8mb4_0900_ai_ci;\nCREATE USER IF NOT EXISTS "
                        "'drill'@'localhost' IDENTIFIED BY '%s';\n"
                        "GRANT ALL ON `%s`.* TO 'drill'@'localhost';\nFLUSH PRIVILEGES;\n" %
                        (schema, password.replace("'", "''"), schema)).encode())
        proc = subprocess.Popen(['docker', 'exec', '-i', '-e', 'MYSQL_PWD', names['rst'],
                                 'mysql', '-u', 'drill', schema],
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, env=docker._env({'MYSQL_PWD': password}))
        try:
            for block in iter_source_dump(docker, names['src'], names['dump'], budget, deadline,
                                          cfg.get('now_fn', time.monotonic)):
                proc.stdin.write(block)
            proc.stdin.close()
            proc.stdout.read(8192)
            proc.stderr.read(8192)
            rc = proc.wait(timeout=int(cfg.get('timeout', 900)))
            if rc != 0:
                raise DrillError('restore client exited non-zero rc=%d' % rc)
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait(timeout=10)
        event(emit, 'restore.applied', schema=schema)

        rst_obs = observe_migration(docker, names['rst'], schema, password, marker)
        checks = compare_migration(src_obs, rst_obs)
        event(emit, 'migration_drill.complete', checks=checks,
              source=src_obs, restore=rst_obs, image_id=pin['image_id'],
              migration_sha256=pin['migration_sha256'], run_id=run, schema=schema)
        if not all(checks.values()):
            raise DrillError('migration restore comparison failed: ' + repr(checks))
        return {'run_id': run, 'schema': schema, 'sha256': digest, 'checks': checks,
                'image_id': pin['image_id'], 'migration_sha256': pin['migration_sha256'],
                'source': src_obs, 'restore': rst_obs}
    finally:
        _cleanup(docker, made_c, made_v, emit)


# Purpose: prove a container has no ports, no host binds and the null network.
# Inputs: docker, container name, emitter. Outputs: None. Side effects: inspect.
# Failure: DrillError if any isolation gate is not met.
def _assert_isolated(docker, name, emit):
    net = docker.text(['inspect', '--format', '{{.HostConfig.NetworkMode}}', name])
    ports = docker.text(['inspect', '--format', '{{json .HostConfig.PortBindings}}', name])
    binds = docker.text(['inspect', '--format', '{{json .HostConfig.Binds}}', name])
    mounts = docker.text(['inspect', '--format', '{{json .Mounts}}', name])
    bad_binds = [b for b in json.loads(binds or '[]') if b.split(':')[0].startswith('/')]
    bad_mounts = [m for m in json.loads(mounts or '[]') if m.get('Type') != 'volume']
    if net != NETWORK or ports not in ('null', '', '{}') or bad_binds or bad_mounts:
        event(emit, 'refused.isolation', container=name, network=net, ports=ports,
              host_binds=bad_binds, non_volume_mounts=bad_mounts)
        raise DrillError('container isolation gate failed for ' + name)
    event(emit, 'isolation.ok', container=name, network=net, ports=ports,
          named_volumes=len(json.loads(mounts or '[]')))


# Purpose: bounded readiness poll for a fresh mysql instance (no retry loop).
# Inputs: docker, container name, attempts/sleep. Outputs: None. Side effects: execs.
# Failure: DrillError after the fixed attempt budget is exhausted.
def _wait_ready(docker, name, attempts=60, sleep=2):
    # The init-only server uses --skip-networking on the same socket; require the
    # final server (skip_networking=OFF) so seeded SQL is never lost at handover.
    for _ in range(attempts):
        cp = docker.run(['exec', name, 'mysql', '-u', 'root', '-N', '-B', '-e',
                         'SELECT @@skip_networking'], check=False, timeout=20)
        if cp.returncode == 0 and cp.stdout.strip() == b'0':
            return
        time.sleep(sleep)
    raise DrillError('mysql readiness budget exhausted for ' + name)


# Purpose: collect narrow row counts, migration ids, data and marker from one
# instance. Inputs: docker, container, schema, password, marker. Outputs: dict.
# Side effects: read-only queries. Failure: DrillError on a failed query.
def _observe(docker, name, schema, password, marker):
    env = {'MYSQL_PWD': password}
    def q(sql):
        return docker.text(['exec', '-e', 'MYSQL_PWD', name, 'mysql', '-u', 'drill',
                            '-N', '-B', '-e', sql], extra_env=env).splitlines()
    counts = {t: (q('SELECT COUNT(*) FROM `%s`.`%s`' % (schema, t)) or ['?'])[0] for t in DRILL_TABLES}
    return {'counts': counts,
            'migrations': q('SELECT version FROM `%s`.schema_migrations ORDER BY version' % schema),
            'quotes': q('SELECT id,text,category FROM `%s`.quotes ORDER BY id' % schema),
            'marker': (q("SELECT text FROM `%s`.quotes WHERE text LIKE '%%%s%%' LIMIT 1" %
                         (schema, marker)) or [''])[0]}


# Purpose: remove exactly the containers/volumes this run created and verify.
# Inputs: docker, created name lists, emitter. Outputs: None. Side effects: removals.
# Failure: reports failures via events; never touches other resources.
def _cleanup(docker, containers, volumes, emit):
    for name in containers:
        try:
            docker.run(['rm', '-f', name], check=False, timeout=60)
        except DrillError:
            pass
    for name in volumes:
        try:
            docker.run(['volume', 'rm', name], check=False, timeout=60)
        except DrillError:
            pass
    left = []
    for name in containers:
        if docker.run(['inspect', name], check=False, timeout=30).returncode == 0:
            left.append(name)
    for name in volumes:
        if docker.run(['volume', 'inspect', name], check=False, timeout=30).returncode == 0:
            left.append(name)
    event(emit, 'cleanup.complete', removed_containers=containers,
          removed_volumes=volumes, remaining=left)
    if left:
        raise DrillError('owned cleanup incomplete: ' + repr(left))


# Purpose: CLI. Dry-run prints a redacted plan; a real run requires --execute and
# the explicit opt-in. Inputs: argv plus environment. Outputs: process exit code.
# Side effects: none in dry-run; a full isolated drill in execute mode.
# Failure: redacted refusal and non-zero exit.
def main(argv=None):
    ap = argparse.ArgumentParser(description='Isolated MySQL 8.4 backup/restore drills (synthetic or real-migration)')
    ap.add_argument('--execute', action='store_true', help='run the real isolated drill')
    ap.add_argument('--mode', choices=('migration', 'synthetic'), default='migration',
                    help='migration (default): exercise shipped migrations from the built image; '
                         'synthetic: original infrastructure-history drill')
    ap.add_argument('--max-bytes', type=int, default=5_000_000)
    ap.add_argument('--timeout', type=int, default=900)
    args = ap.parse_args(argv)
    if not args.execute:
        run, schema = make_ids()
        if args.mode == 'migration':
            print('DRY-RUN migration drill: mysql=%s source_image=%s image_id=%s network=%s '
                  'schema=%s volumes=3 containers=3 migrator=shipped(3 IDs) '
                  'api_entry=node(no Discord) creds=env-only dump=run-produced '
                  'live_restore=ALLOWED-ONLY-WITH-OWNED-FIXTURE' %
                  (IMAGE, MIGRATION_IMAGE, MIGRATION_IMAGE_ID, NETWORK, schema))
        else:
            print('DRY-RUN synthetic drill (infrastructure history): image=%s network=%s '
                  'schema=%s volumes=3 containers=2 tools=cache-only creds=env-only '
                  'dump=run-produced live_restore=ALLOWED-ONLY-WITH-OWNED-FIXTURE' %
                  (IMAGE, NETWORK, schema))
        return 0
    if os.environ.get(OPT_IN) != '1':
        print('DRILL REFUSED: set %s=1 and --execute for the owned isolated fixture' % OPT_IN)
        return 2
    try:
        cfg = {'max_bytes': args.max_bytes, 'timeout': args.timeout}
        if args.mode == 'migration':
            execute_migration_drill(cfg, Docker(timeout=args.timeout))
        else:
            execute_drill(cfg, Docker(timeout=args.timeout))
    except DrillError as exc:
        print('DRILL REFUSED: ' + g.redact(str(exc), []))
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
