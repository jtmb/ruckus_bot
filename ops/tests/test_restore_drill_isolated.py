#!/usr/bin/env python3
"""Synthetic-control tests for the isolated drill runner (synthetic + real-migration).

No Docker, no database, no H writes and no production dump are used. They cover
the helper logic only; orchestration is proven by the executed local drills recorded
in docs/deploy/BACKUP-RESTORE.md. All temp artifacts use /tmp/opencode.
"""
import gzip
import io
import os
import sys
import tempfile
import time
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib import backup_guard as g
import restore_drill_isolated as r


class IdAndSqlTests(unittest.TestCase):
    """Purpose: prove generated names are disposable and SQL stays synthetic."""
    def test_ids_are_disposable_and_lowercase(self):
        run, schema = r.make_ids(entropy='AbC123xy')
        self.assertEqual(run, run.lower())
        self.assertTrue(g.is_disposable_schema(schema))
        self.assertIn(run, schema)

    def test_seed_sql_is_narrow(self):
        sql = r.seed_sql('ruckus_drill_a1', 'MARK')
        self.assertIn('CREATE TABLE schema_migrations', sql)
        self.assertIn('CREATE TABLE quotes', sql)
        self.assertNotIn('prod', sql.lower())
        self.assertNotIn('IDENTIFIED BY', sql)  # creds are created in row SQL, not here

    def test_fixture_rows_carry_marker_and_scoped_user(self):
        sql = r.fixture_rows_sql('ruckus_drill_a1', 'MARK-1', 'pw42')
        self.assertIn('MARK-1', sql)
        self.assertIn("IDENTIFIED BY 'pw42'", sql)
        self.assertIn('GRANT ALL ON `ruckus_drill_a1`.*', sql)  # schema-scoped, no global
        self.assertNotIn('FILE', sql)
        self.assertNotIn('SUPER', sql)

    def test_production_dump_is_never_referenced(self):
        with open(r.__file__, 'r', encoding='utf-8') as fh:
            src = fh.read()
        self.assertNotIn('prod-pre-1.1.0', src)
        self.assertNotIn('prod.example', src)


class CompareTests(unittest.TestCase):
    """Purpose: prove restore comparison fails on any row/data/migration drift."""
    def _obs(self, counts, migrations, quotes, marker):
        return {'counts': counts, 'migrations': migrations,
                'quotes': quotes, 'marker': marker}

    def test_equal_observations_pass(self):
        a = self._obs({'quotes': '2'}, ['0001'], ['1|x'], 'MARK')
        self.assertTrue(all(r.compare(a, dict(a), ('quotes',)).values()))

    def test_mismatch_is_detected(self):
        a = self._obs({'quotes': '2'}, ['0001'], ['1|x'], 'MARK')
        b = self._obs({'quotes': '1'}, ['0002'], ['1|y'], '')
        checks = r.compare(a, b, ('quotes',))
        self.assertFalse(any(checks.values()))


class MountAndEnvTests(unittest.TestCase):
    """Purpose: prove longest-prefix mount parsing and env-only secret passing."""
    def test_mount_for_longest_prefix(self):
        text = ('/dev/loop0 / ext4 rw 0 0\n'
                '/dev/loop1 /mnt/h/AgentArtifacts ext4 rw 0 0\n'
                '/dev/loop2 /mnt/h/AgentArtifacts/store ext4 rw 0 0\n')
        with mock.patch('builtins.open', mock.mock_open(read_data=text)):
            src, fst, mp = r.mount_for('/mnt/h/AgentArtifacts/store/vol/_data')
        self.assertEqual((src, fst, mp),
                         ('/dev/loop2', 'ext4', '/mnt/h/AgentArtifacts/store'))

    def test_secret_is_in_env_not_argv(self):
        captured = {}
        def fake_run(args, **kw):
            captured['args'] = args
            captured['env'] = kw.get('env', {})
            return mock.Mock(returncode=0, stdout=b'', stderr=b'')
        d = r.Docker(env={'BASE': '1'})
        with mock.patch('subprocess.run', side_effect=fake_run):
            d.run(['exec', '-e', 'MYSQL_PWD', 'c', 'mysql', '-u', 'drill', 'db'],
                  extra_env={'MYSQL_PWD': 's3cr3t'})
        self.assertNotIn('s3cr3t', ' '.join(captured['args']))
        self.assertEqual(captured['env'].get('MYSQL_PWD'), 's3cr3t')
        self.assertEqual(captured['env'].get('BASE'), '1')
        self.assertTrue(g.assert_no_secret_in_argv is not None)


class GateTests(unittest.TestCase):
    """Purpose: prove preflight and prior-state gates fail closed."""
    def test_prior_state_refused(self):
        d = mock.Mock()
        d.text.side_effect = lambda args, **kw: 'old_container' if 'ps' in args else 'old_volume'
        with self.assertRaises(r.DrillError):
            r.assert_no_prior_state(d, {'prefix': 'pfx'}, lambda line: None)

    def test_nonposix_store_refused(self):
        d = mock.Mock()
        d.text.side_effect = ['sha256:abc', '/mnt/h/store/docker']
        with mock.patch.object(r, 'mount_for', return_value=('/dev/loop0', '9p', '/mnt/h/store/docker')):
            with self.assertRaises(r.DrillError):
                r.preflight(d, lambda line: None)


class BoundedDumpTests(unittest.TestCase):
    """Purpose: prove the run-produced dump streams within a byte budget."""
    def test_dump_stream_is_bounded_and_decompressed(self):
        tmp = tempfile.TemporaryDirectory(dir='/tmp/opencode')
        self.addCleanup(tmp.cleanup)
        path = os.path.join(tmp.name, 'd.sql.gz')
        payload = b'-- dump\n' * 50
        with gzip.open(path, 'wb') as fh:
            fh.write(payload)
        with open(path, 'rb') as fh:
            data = fh.read()
        d = mock.Mock()
        d._env.return_value = {'PATH': os.environ.get('PATH', '')}
        def fresh_popen():
            p = mock.Mock()
            p.stdout = io.BytesIO(data)
            p.stderr = io.BytesIO(b'')
            p.poll.return_value = None
            p.wait.return_value = 0
            return p
        with mock.patch('subprocess.Popen', return_value=fresh_popen()):
            out = b''.join(r.iter_source_dump(d, 'c', path, 1_000_000, time.monotonic() + 10))
        self.assertEqual(out, payload)
        with mock.patch('subprocess.Popen', return_value=fresh_popen()):
            with self.assertRaises(g.GuardError):
                list(r.iter_source_dump(d, 'c', path, 10, time.monotonic() + 10))


class MigrationDrillTests(unittest.TestCase):
    """Purpose: prove the real-migration mode uses shipped IDs/schema and safe entrypoint."""
    def test_real_ids_are_the_three_shipped_migrations(self):
        self.assertEqual(r.REAL_MIGRATIONS,
                         ('0001_baseline', '0002_sessions_and_heartbeat', '0003_log_indexes'))
        for invented in ('0004_', '0005_', 'password_column', 'logs_json'):
            self.assertNotIn(invented, ''.join(r.REAL_MIGRATIONS))
        self.assertEqual(len(r.REAL_MIGRATIONS), 3)

    def test_baseline_matches_legacy_shape_and_invents_nothing(self):
        sql = r.baseline_legacy_sql('ruckus_drill_a1', 'MARK')
        self.assertIn('CREATE TABLE credentials', sql)
        self.assertIn('password VARCHAR(255) NOT NULL', sql)
        self.assertIn('event_data TEXT', sql)
        self.assertNotIn('password_hash', sql)
        self.assertNotIn('version VARCHAR', sql)
        self.assertNotIn('CREATE TABLE schema_migrations', sql)  # migrate() creates it
        self.assertNotIn('prod', sql.lower())

    def test_preserved_rows_use_password_column_and_marker(self):
        sql = r.preserved_rows_sql('ruckus_drill_a1', 'MARK-9', 'pw42')
        self.assertIn('MARK-9', sql)
        self.assertIn("IDENTIFIED BY 'pw42'", sql)
        self.assertIn("'drill'@'127.0.0.1'", sql)  # API TCP account
        self.assertIn("'drill'@'localhost'", sql)  # socket dump/restore account
        self.assertIn('GRANT ALL ON `ruckus_drill_a1`.*', sql)
        self.assertNotIn('password_hash', sql)
        self.assertNotIn('SUPER', sql)
        self.assertNotIn('FILE', sql)

    def test_compare_migration_detects_drift_and_requires_real_ids(self):
        good = {'counts': {t: '2' for t in r.MIG_TABLES},
                'migrations': list(r.REAL_MIGRATIONS),
                'preserved_credentials': ['legacy_x|user'],
                'preserved_logs': ['legacy_baseline|x'],
                'indexes': list(r.REAL_INDEXES)}
        self.assertTrue(all(r.compare_migration(good, dict(good)).values()))
        bad = dict(good, migrations=['0001_baseline'], preserved_credentials=[],
                   indexes=[])
        checks = r.compare_migration(good, bad)
        self.assertFalse(checks['migration_ids'])
        self.assertFalse(checks['preserved_credentials'])
        self.assertFalse(checks['indexes'])

    def test_api_health_wait_reads_body_then_times_out(self):
        d = mock.Mock()
        d.run.return_value = mock.Mock(stdout=b'{"status":"ok"}')
        self.assertIn('ok', r._api_health(d, 'api', '/health', '"status":"ok"'))
        d.run.return_value = mock.Mock(stdout=b'')
        with mock.patch.object(r.time, 'sleep', lambda _s: None):
            with self.assertRaises(r.DrillError):
                r._api_health(d, 'api', '/health', '"status":"ok"', attempts=2)

    def test_image_pins_reject_drift(self):
        self.assertTrue(r.MIGRATION_IMAGE_ID.startswith('sha256:'))
        self.assertEqual(len(r.MIGRATION_SOURCE_SHA256), 64)
        d = mock.Mock()
        d.text.return_value = 'sha256:wrong'
        with self.assertRaises(r.DrillError):
            r.preflight_migration_image(d, lambda line: None)

    def test_api_isolation_gate(self):
        d = mock.Mock()
        d.text.side_effect = ['container:srcid', '{}', '[]', 'none']
        r._assert_isolated_api(d, 'api', 'src', lambda line: None)
        d = mock.Mock()
        d.text.side_effect = ['container:srcid', '{}', '[]', 'bridge']
        with self.assertRaises(r.DrillError):
            r._assert_isolated_api(d, 'api', 'src', lambda line: None)

    def test_no_discord_or_build_in_real_mode(self):
        with open(r.__file__, 'r', encoding='utf-8') as fh:
            fn = fh.read().split('def execute_migration_drill')[1].split('def _assert_isolated')[0]
        self.assertIn("'--entrypoint', 'node'", fn)
        self.assertIn('MIGRATION_ENTRY', fn)
        for forbidden in ('supervisord', 'bot_run', 'nodemon', 'npm ci', 'docker build'):
            self.assertNotIn(forbidden, fn)


if __name__ == '__main__':
    unittest.main(verbosity=2)
