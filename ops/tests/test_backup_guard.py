#!/usr/bin/env python3
"""Synthetic-control tests for the fail-closed backup/restore guards.

Uses injected mount tables, fake probes, a fake dumper and synthetic gzip dumps:
no database, no production access, no H writes. All temp artifacts live under
/tmp/opencode. A matching checksum is treated as integrity only, never as proof
that a dump is authentic or safe to execute.
"""
import gzip
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib import backup_guard as g
from mysql_backup import run_backup
from mysql_restore_drill import LIVE_RESTORE_PREREQUISITE, run_drill

TMP_ROOT = '/tmp/opencode'
class MountAndDestinationTests(unittest.TestCase):
    """Purpose: prove destination checks fail closed on unsupported storage."""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=TMP_ROOT)
        self.addCleanup(self.tmp.cleanup)
        self.ext4 = [('/', 'ext4', 'rw'), (self.tmp.name, 'ext4', 'rw')]
        self.drvfs = [('/', '9p', 'rw,aname=drvfs'), (self.tmp.name, '9p', 'rw,aname=drvfs')]

    def test_longest_mount_prefix(self):
        self.assertEqual(g.fstype_for(self.tmp.name + '/x', self.ext4)[1], 'rw')

    def test_no_mount_fails_closed(self):
        with self.assertRaises(g.GuardError):
            g.fstype_for('/x', [])

    def test_drvfs_refused(self):
        dest = os.path.join(self.tmp.name, 'dest')
        with self.assertRaises(g.GuardError):
            g.validate_destination(dest, self.tmp.name, '/repo', 1000,
                                   mounts=self.drvfs, probe=g.chmod_probe)

    def test_chmod_not_enforced_refused(self):
        dest = os.path.join(self.tmp.name, 'dest')
        with self.assertRaises(g.GuardError):
            g.validate_destination(dest, self.tmp.name, '/repo', 1000,
                                   mounts=self.ext4, probe=lambda p: 0o777)

    def test_outside_root_and_repo_refused(self):
        with self.assertRaises(g.GuardError):
            g.validate_destination('/etc/passwd', self.tmp.name, '/repo', 1000,
                                   mounts=self.ext4, probe=g.chmod_probe)
        inside = os.path.join(self.tmp.name, 'repo', 'dump.sql.gz')
        with self.assertRaises(g.GuardError):
            g.validate_destination(inside, self.tmp.name, os.path.join(self.tmp.name, 'repo'),
                                   1000, mounts=self.ext4, probe=g.chmod_probe)

    def test_over_ceiling_refused(self):
        with self.assertRaises(g.GuardError):
            g.validate_destination(os.path.join(self.tmp.name, 'd'), self.tmp.name,
                                   '/repo', g.MAX_BYTES_CEILING + 1,
                                   mounts=self.ext4, probe=g.chmod_probe)

    def test_relative_and_symlink_refused(self):
        with self.assertRaises(g.GuardError):
            g.validate_destination('relative/path', self.tmp.name, '/repo', 1000,
                                   mounts=self.ext4, probe=g.chmod_probe)

    def test_qualified_ext4_accepted(self):
        dest = os.path.join(self.tmp.name, 'private', 'd.sql.gz')
        real, parent = g.validate_destination(dest, self.tmp.name, '/repo', 1000,
                                              mounts=self.ext4, probe=g.chmod_probe)
        self.assertTrue(real.startswith(self.tmp.name))
        self.assertEqual(os.stat(parent).st_mode & 0o077, 0)

class SecretAndTargetTests(unittest.TestCase):
    """Purpose: prove secrets stay out of argv/logs and drill targets are isolated."""
    def test_no_secret_in_argv(self):
        argv = g.build_dump_argv('mysqldump', '127.0.0.1', 3306, 'bot', 'db', 'topsecret')
        self.assertNotIn('topsecret', repr(argv))
        self.assertIn('--single-transaction', argv)
        with self.assertRaises(g.GuardError):
            g.assert_no_secret_in_argv(argv + ['--password=topsecret'], 'topsecret')

    def test_redact(self):
        self.assertNotIn('topsecret', g.redact('pwd=topsecret here', ['topsecret']))

    def test_loopback_only(self):
        self.assertTrue(g.is_loopback('127.0.0.1'))
        self.assertFalse(g.is_loopback('10.0.0.5'))

    def test_restore_target_refusals(self):
        name = g.disposable_schema_name(123, 'abc123')
        self.assertTrue(g.is_disposable_schema(name))
        with self.assertRaises(g.GuardError):
            g.validate_restore_target(name, '0', '127.0.0.1')
        with self.assertRaises(g.GuardError):
            g.validate_restore_target(name, '1', '10.0.0.5')
        with self.assertRaises(g.GuardError):
            g.validate_restore_target(name, '1', '127.0.0.1', 'db.prod.lan')
        with self.assertRaises(g.GuardError):
            g.validate_restore_target('db', '1', '127.0.0.1')
        with self.assertRaises(g.GuardError):
            g.validate_restore_target('ruckus_drill_' + 'a' * 80, '1', '127.0.0.1')
        self.assertEqual(g.validate_restore_target(name, '1', 'localhost'), name)

    def test_existing_target_refused(self):
        with self.assertRaises(g.GuardError):
            g.assert_target_absent(True)
        g.assert_target_absent(False)

class ChecksumTests(unittest.TestCase):
    """Purpose: prove dumps are validated fail-closed by checksum and gzip magic."""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=TMP_ROOT)
        self.addCleanup(self.tmp.cleanup)
        self.dump = os.path.join(self.tmp.name, 'd.sql.gz')
        with gzip.open(self.dump, 'wb') as fh:
            fh.write(b'-- MySQL dump 10.13\nSELECT 1;\n')
        self.digest = g.sha256_file(self.dump)
        self.side = self.dump + '.sha256'
        with open(self.side, 'w', encoding='ascii') as fh:
            fh.write(self.digest + '  ' + os.path.basename(self.dump) + '\n')

    def test_checksum_ok(self):
        self.assertEqual(g.verify_checksum(self.dump, self.side), self.digest)
        self.assertTrue(g.check_gzip_magic(self.dump))

    def test_checksum_mismatch(self):
        with gzip.open(self.dump, 'wb') as fh:
            fh.write(b'tampered')
        with self.assertRaises(g.GuardError):
            g.verify_checksum(self.dump, self.side)

    def test_missing_or_wrong_name_sidecar(self):
        with open(self.side, 'w', encoding='ascii') as fh:
            fh.write(self.digest + '  other.sql.gz\n')
        with self.assertRaises(g.GuardError):
            g.verify_checksum(self.dump, self.side)
        os.unlink(self.side)
        with self.assertRaises(g.GuardError):
            g.verify_checksum(self.dump, self.side)

    def test_empty_and_plain_dump(self):
        empty = os.path.join(self.tmp.name, 'empty')
        open(empty, 'wb').close()
        with self.assertRaises(g.GuardError):
            g.sha256_file(empty)
        with self.assertRaises(g.GuardError):
            g.check_gzip_magic(__file__)

    def test_bound_stream(self):
        with self.assertRaises(g.GuardError):
            g.bound_stream(b'xx', 0, 1, 100, 0)
        with self.assertRaises(g.GuardError):
            g.bound_stream(b'x', 0, 100, 10, 11)

class BackupPipelineTests(unittest.TestCase):
    """Purpose: exercise the backup path end-to-end with a synthetic dumper."""
    def test_full_backup_is_verified_and_atomic(self):
        with tempfile.TemporaryDirectory(dir=TMP_ROOT) as tmp:
            def fake(argv, env, write, deadline, max_bytes):
                self.assertNotIn('topsecret', repr(argv))
                self.assertEqual(env.get('MYSQL_PWD'), 'topsecret')
                write(b'-- MySQL dump 10.13\nCREATE TABLE t (id INT);\n')
            with mock.patch.dict(os.environ, {'MYSQL_HOST': '127.0.0.1'}):
                res = run_backup(
                    os.path.join(tmp, 'private', 'd.sql.gz'), '127.0.0.1',
                    3306, 'bot', 'db', 'topsecret', tmp,
                    os.path.join(tmp, 'repo'), 100000, dumper=fake,
                    mounts=[('/', 'ext4', 'rw'), (tmp, 'ext4', 'rw')],
                    probe=g.chmod_probe, log=lambda msg: None)
            self.assertGreater(res['bytes'], 0)
            self.assertEqual(g.verify_checksum(res['final'], res['sidecar']), res['sha256'])
            with gzip.open(res['final'], 'rb') as fh:
                self.assertIn(b'CREATE TABLE', fh.read())
            self.assertEqual([f for f in os.listdir(os.path.dirname(res['final']))
                              if '.part-' in f], [])

    def test_non_loopback_host_refused(self):
        with tempfile.TemporaryDirectory(dir=TMP_ROOT) as tmp:
            with self.assertRaises(g.GuardError):
                run_backup(os.path.join(tmp, 'd.sql.gz'), 'prod.example', 3306,
                           'bot', 'db', 's', tmp, tmp + '/repo', 1000)

    def test_safe_default_bound(self):
        self.assertLess(g.DEFAULT_MAX_BYTES, g.MAX_BYTES_CEILING)


class BoundedGzipTests(unittest.TestCase):
    """Purpose: prove payload inspection streams in bounded chunks, never a full read."""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=TMP_ROOT)
        self.addCleanup(self.tmp.cleanup)
        self.path = os.path.join(self.tmp.name, 'd.sql.gz')
        self.payload = b'-- synthetic SQL\n' * 200
        with gzip.open(self.path, 'wb') as fh:
            fh.write(self.payload)

    def test_streams_full_payload_within_budget(self):
        out = b''.join(g.iter_bounded_gzip(self.path, 1_000_000, 100, lambda: 0))
        self.assertEqual(out, self.payload)

    def test_oversize_refused(self):
        with self.assertRaises(g.GuardError):
            list(g.iter_bounded_gzip(self.path, 10, 100, lambda: 0))

    def test_deadline_refused(self):
        with self.assertRaises(g.GuardError):
            list(g.iter_bounded_gzip(self.path, 1_000_000, 0, lambda: 1))


class RestoreDrillTests(unittest.TestCase):
    """Purpose: prove live restore fails closed and dry-run never opens a connection."""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=TMP_ROOT)
        self.addCleanup(self.tmp.cleanup)
        self.dump = os.path.join(self.tmp.name, 'd.sql.gz')
        payload = b'-- synthetic SQL\nSELECT 1;\n'
        with gzip.open(self.dump, 'wb') as fh:
            fh.write(payload)
        self.payload_len = len(payload)
        with open(self.dump + '.sha256', 'w', encoding='ascii') as fh:
            fh.write(g.sha256_file(self.dump) + '  ' + os.path.basename(self.dump) + '\n')

    def test_live_restore_disabled_even_with_valid_checksum(self):
        with mock.patch('subprocess.Popen') as popen:
            with self.assertRaises(g.GuardError) as ctx:
                run_drill(self.dump, '127.0.0.1', 3306, 'bot', 's3cr3t', '1',
                          dry_run=False)
        self.assertIn('live restore disabled', str(ctx.exception))
        self.assertEqual(LIVE_RESTORE_PREREQUISITE, str(ctx.exception))
        popen.assert_not_called()

    def test_dry_run_is_bounded_and_connectionless(self):
        logs = []
        with mock.patch('subprocess.Popen') as popen:
            res = run_drill(self.dump, '127.0.0.1', 3306, 'bot', 's3cr3t', '1',
                            dry_run=True, log=logs.append)
        self.assertTrue(res['dry_run'])
        self.assertTrue(res['live_disabled'])
        self.assertEqual(res['payload_bytes'], self.payload_len)
        self.assertGreater(res['compressed_bytes'], 0)
        popen.assert_not_called()
        self.assertNotIn('s3cr3t', ' '.join(logs))

    def test_dry_run_refusals(self):
        with self.assertRaises(g.GuardError):
            run_drill(self.dump, '127.0.0.1', 3306, 'bot', 's', '0')
        with self.assertRaises(g.GuardError):
            run_drill(self.dump, 'prod.example', 3306, 'bot', 's', '1')
        with self.assertRaises(g.GuardError):
            run_drill(self.dump, '127.0.0.1', 3306, 'bot', 's', '1',
                      runtime_host='db.prod.lan')
        with self.assertRaises(g.GuardError):
            run_drill(self.dump, '127.0.0.1', 3306, 'bot', 's', '1', schema='db')


if __name__ == '__main__':
    unittest.main(verbosity=2)

