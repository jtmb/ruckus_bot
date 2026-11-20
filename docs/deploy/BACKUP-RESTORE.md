# Backup and restore-drill runbook (local, defensive)

Scope: local, defensive operations for `ruckus_bot` on MySQL 8.4. This runbook
covers **creating verified backups** and a **real, isolated synthetic restore
drill**. It never authorises production access, a production dump,
registry/publish actions, sudo escalation or stopping existing workloads.

## 1. Prior production dump — NOT QUALIFIED (do not touch)

`H:\AgentArtifacts\projects\ruckus_bot\backups\prod-pre-1.1.0-20261117T011520.sql`
(WSL `/mnt/h/AgentArtifacts/projects/ruckus_bot/backups/prod-pre-1.1.0-20261117T011520.sql`)
was written on the Windows-backed share. That path is mounted as `9p` with
`aname=drvfs`; POSIX modes are not enforced there and the file is reported as
mode `0777`. A `chmod` on that path is a no-op, so the dump cannot provide the
private `0600` guarantee this tooling requires.

Status: **not qualified**. Do not read, copy, modify, delete, import, checksum
or use it as a drill fixture. It is left exactly as found; this tooling does not
reference it. (A fail-closed CLI check passed its path as a *string argument*
only; the refusal happens before any file is opened.)

## 2. Tooling and ownership

| Path | Purpose |
| --- | --- |
| `ops/lib/backup_guard.py` | Pure fail-closed checks (destination, secrets, integrity, drill target, bounded gzip streaming) |
| `ops/mysql_backup.py` | Verified local dump with atomic placement (generic CLI) |
| `ops/mysql_restore_drill.py` | Dry-run-only planner (generic CLI); live restore explicitly disabled |
| `ops/restore_drill_isolated.py` | Dedicated, gated isolated runner — the ONLY live drill path; `--mode migration` (default) exercises the shipped migrations, `--mode synthetic` is the original infrastructure-history drill |
| `ops/tests/test_backup_guard.py` | 27 synthetic controls (no DB, no H writes, no live dump) |
| `ops/tests/test_restore_drill_isolated.py` | 19 synthetic controls (11 synthetic-mode + 8 real-migration-mode helpers) |

Owned files are limited to `ops/` and this runbook. No application code, records,
gates, Git config or other project files were changed. No second checkout,
worktree, mount, disk image or dependency copy was created. No image was built or
pulled and no live process was stopped.

## 3. Destination policy (generic backup CLI: private, explicit, H-backed)

`--dest` is mandatory and must resolve to an **absolute** path inside
`RUCKUS_BACKUP_ROOT` (default `/mnt/h/AgentArtifacts/projects/ruckus_bot`),
never inside the repository and never a symlink. The destination directory must
be private (`0700`, no group/other bits) and the dump file `0600`.

The filesystem must enforce POSIX modes. Only `ext4/ext3/ext2/xfs/btrfs/f2fs`
are accepted; `9p`/DrvFS, CIFS, NTFS, FAT and overlay are refused. The tool also
performs a real `chmod 0600` + `stat` probe and refuses if the observed mode is
not exactly `0600`. On `/mnt/h` (9p/`aname=drvfs`, mode `777`) every destination
is **refused** — a DrvFS `chmod` failure is reported, not silently accepted. No
new H-backed store was created; the H-backed ext4 loop stores that exist belong
to other projects and are not reused as generic backup destinations.

Consequence: no qualified *host* destination exists for the generic backup CLI,
so a real production backup cannot run via that CLI here. This is a hard stop,
not a reason to fall back to `/mnt/h` or the repository. The isolated runner
below avoids this by writing its own run-produced dump into a task-owned named
volume on the existing H-backed ext4 Docker store (no new mount).

## 4. Secrets (no plaintext in argv, logs or Git)

Generic CLI credentials come from `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`,
`MYSQL_DATABASE` and `MYSQL_PASSWORD` in the environment only; the password is
passed to `mysqldump` through `MYSQL_PWD` and is never an argv element, never
printed and never written to a sidecar. Non-loopback source hosts are refused.

The isolated runner generates a **random synthetic password per run** in memory.
It is forwarded with Docker's `-e MYSQL_PWD` *passthrough form* (argv contains
only the variable name, never its value), or on stdin for account creation. It
is never logged or written to a retained config. A post-run scan of the event
log found zero `MYSQL_PWD=`, `IDENTIFIED BY` or `password=` strings. A checksum
sidecar proves **integrity only**, never authenticity or provenance.

## 5. Backup procedure (generic CLI, once a qualified destination exists)

```
export MYSQL_HOST=127.0.0.1 MYSQL_PORT=3306 MYSQL_USER=bot \
       MYSQL_DATABASE=db MYSQL_PASSWORD='<local throwaway>'
export RUCKUS_BACKUP_ROOT=/path/to/authorised/H-backed/ext4/store

python3 ops/mysql_backup.py --dest "$RUCKUS_BACKUP_ROOT/private" --dry-run
python3 ops/mysql_backup.py --dest "$RUCKUS_BACKUP_ROOT/private" \
        --max-bytes 5000000000
```

`mysqldump --single-transaction --routines --triggers --set-gtid-purged=OFF
--no-tablespaces` is streamed through gzip to a `0600` temp file, checked for
gzip/CRC integrity and size/time bounds, then atomically renamed. Retention
follows the contract (14 daily + 8 weekly), bounded by the 100 GB ceiling.

## 6. Restore drill — generic CLI fail-closed; isolated runner is the live path

`ops/mysql_restore_drill.py` remains a **dry-run planner only**: any non-dry-run
invocation is refused before the dump is read or any credential/connection used.
`ops/mysql_backup.py` also stays fail-closed. Neither was modified or bypassed.

`ops/restore_drill_isolated.py` is the only component permitted to restore, and
only because it provisions and proves its own fixture. It refuses unless all of
the following pass (all fail closed):

1. brand-new uniquely named containers and named volumes; no reuse; `--network
   none`, no host ports, no host-path binds (only named volumes), no production
   access;
2. volumes proven on a POSIX-enforcing ext4 store backed by a file on physical
   H; project artifacts within 100 GB and physical space/inodes preflighted;
3. two independent instances (seeded source, fresh empty restore), MySQL tools
   from the already-cached `mysql:8.4` image (no build, no pull);
4. synthetic random credentials held only in process memory, passed by env
   passthrough or stdin, never in argv/logs/config;
5. the only dump consumed is produced by this same run and verified to contain
   this run's provenance marker; no user/production dump is ever opened; all SQL
   is narrow and generated by the runner;
6. bounded timeouts and byte budgets, no retry loop, pre-existing-state refusal,
   and exact `finally` cleanup of only this run's resources.

```
python3 ops/restore_drill_isolated.py --mode migration     # redacted plan (default)
python3 ops/restore_drill_isolated.py --mode synthetic     # original infra-history plan
RUCKUS_ISOLATED_DRILL_ALLOW=1 python3 ops/restore_drill_isolated.py \
    --mode migration --execute --max-bytes 5000000 --timeout 900
```

In `--mode migration` the API process from the already-built local image is started
with its entrypoint overridden to `node api/src/api.js`: **Discord/bot is never
launched** (the image's supervisord `bot_run` program is bypassed). It joins the
source MySQL container's `--network none` namespace, so there is no new bridge
network, no host port and no egress. `MYSQL_PASSWORD` reaches Docker by env
passthrough — the Docker argv holds only the variable name. The migrator runs from
the image's own `/app/api/src/migrations/index.js`, never from a copied checkout.

## 7. Evidence — 2026-11-18 (FIRST drill: synthetic infrastructure history only)

**Status of this section:** the drill below (`--mode synthetic`) proved the isolated
fixture, H/ext4 ownership, secret handling and backup/restore plumbing **only**. Its
schema and eight migration IDs (`0001_baseline`…`0008_logs_json`, columns `version`,
`password_hash`) were *invented* by the fixture and do not exist in the shipped API.
It is retained as historical infrastructure evidence and must **not** be cited as
migration-compatibility proof. See §9 for the real shipped-migration drill.

**Synthetic controls:** `python3 -m unittest discover -s ops/tests` — 46/46 pass
(DrvFS/9p refusal, chmod-not-enforced refusal, containment, secrets, integrity,
bounded streaming, live restore disabled, connectionless dry-run, plus the
isolated-runner helpers and the real-migration helpers in §9).

**Generic CLI checks:** backup `--dry-run` to `/mnt/h/.../backups` exited 2 with
`BACKUP REFUSED: refusing destination on 9p`; non-dry-run restore exited 2 with
the exact `LIVE_RESTORE_PREREQUISITE` before any file read.

**Executed isolated drill (succeeded, exit 0).** Exact proof, event log
`/mnt/h/AgentArtifacts/projects/ruckus_bot/state/isolated-drill-events.jsonl`:

- Run `20261118t052303_740778a4`; schema `ruckus_drill_20261118t052303_740778a4`.
- Image `mysql:8.4` `sha256:a81d043930e5…` (cached, not built/pulled).
- Containers `ruckusdrill_20261118t052303_740778a4_src` and `…_rst`: both
  `network=none`, `PortBindings={}`, no host-path binds (2 and 1 named volumes).
- Volumes `…_srcdb`, `…_srcart`, `…_rstd`: mountpoints under the Docker store;
  `fstype=ext4`, source `/dev/loop0`, backing file
  `/mnt/h/AgentArtifacts/projects/branconet/builds/wsl-artifact-store/branconet-artifacts.ext4`
  (physically on `H:`).
- Preflight: project H artifacts 3,542,271 B < 100,000,000,000 B; H free
  345,840,193,536 B; store 2.5 T free, 148,986 inodes free (89% used).
- Run-produced dump: 1,851 B compressed / 9,443 B payload, file and sidecar mode
  `0600`, `sha256=013714287c847265d6dc6f126d1ef7e9ccf69aff1e5dcc420304b656ce266907`,
  and it contained this run's marker `RUNMARK-20261118t052303_740778a4`.
- Restore into the separate empty instance; all 10 comparisons true. Row counts
  identical source/restore: `schema_migrations` 8, `bot_logs` 2, `credentials` 2,
  `sessions` 1, `bot_heartbeat` 1, `guild_settings` 1, `quotes` 2. Migration IDs
  `0001_baseline`…`0008_logs_json` identical; quotes rows and marker identical.
- Cleanup: both containers and all three volumes removed; `remaining=[]`.

## 8. Status and handoff gaps

- DEC-026's prerequisite (an exclusively task-owned, isolated MySQL 8.4 fixture
  with ownership proof) is now met by the executed drill above. The parent
  session/owner must reconcile `data/decisions.json`, `data/gates.json` (G8/G11)
  and the written acceptance evidence — those records are outside this file's
  ownership and were **not** edited.
- The data-model contract §6 also calls for starting the API against the restored
  schema and loading `/bot/status`; that application-level step is outside `ops/`
  and was not performed here.
- The generic backup CLI still has no qualified host destination on this machine;
  production backup/restore remain unavailable through it.
- The shared Docker runtime is physically the branconet project's loop store; the
  drill's volumes were task-owned, small (single-digit MB peak) and removed. No
  new mount, checkout, worktree or image build was created.
- §9 adds a distinct real-migration drill; the parent session/owner still owns the
  decision/gate/tracker records and must reconcile them (this file does not).

## 9. Real shipped-migration drill — 2026-11-18 (exit 0)

`--mode migration` exercised the **actual** migration code shipped in the built
local image `ruckus_bot:verify-20261117-235846` against a real pre-migration
baseline. The baseline tables (`bot_logs`, `credentials`, `sessions`,
`bot_heartbeat`) carried exactly the columns the code reads (shipped `password`,
not invented `password_hash`), with no pre-existing `schema_migrations`; synthetic
rows carrying this run's marker were inserted and had to survive. The API from the
image applied migrations at startup, then the schema was backed up, restored into
a separate empty instance and compared. Event log (retained evidence):
`/mnt/h/AgentArtifacts/projects/ruckus_bot/state/migration-drill-events.jsonl`.

**Scope / artifact binding (pinned; drift fails closed):**
- Image id `sha256:60f6bf6df5a836ce37cc3ffe108c259127f27d5d3f69023f5e20526c7e140461`.
- Migration source `7efc74f51bc01dc4704aeaa0e043dab5786da3894d700da021c20f4b5a30045d`
  — verified identical in the image and in the checked-out `api/src/migrations/index.js`.
- Run `20261118t053643_bea6b672`; schema `ruckus_drill_20261118t053643_bea6b672`.
- Source repository `main@711ff12`, working tree only; only `ops/` files + this
  runbook changed. No commit, push, build, pull, second checkout or new storage root.

**Isolation / ownership:** MySQL `mysql:8.4` (`sha256:a81d043930e5…`, cached, not
built/pulled) on `--network none`; the API container shared that null namespace
(peer network `none`, `PortBindings={}`, no host binds); three task-owned named
volumes on ext4 over `/dev/loop0`, backing file physically on `H:`. Preflight:
project artifacts 3,545,385 B < 100,000,000,000 B; H free 345,153,028,096 B;
store 2.5 T free, 148,150 inodes free. Containers/volumes removed, `remaining=[]`.

**Migration proof (real API + runtime DB interfaces):** API `/health` →
`{"status":"ok"}`, `/ready` → `{"status":"ready"}`; startup log
`Applied migrations: 0001_baseline, 0002_sessions_and_heartbeat, 0003_log_indexes`;
`schema_migrations` held exactly those three real IDs; the two preserved legacy
rows survived; indexes `idx_bot_logs_time` and `idx_bot_logs_type_time` (created by
`0003_log_indexes`) were present.

**Backup/restore:** run-produced dump 1,327 B compressed / 5,873 B payload, file
and sidecar mode `0600`, `sha256=9ad458eea9739b41dc890413206b84ba18ccbdb4f68eeb1c3d742d9c44e210cd`,
marker present; restored into a separate empty instance. All 9 comparisons true
(counts for the five real tables, exact migration IDs, preserved rows, indexes).
Evidence scan: zero `IDENTIFIED BY`, `MYSQL_PWD=` or `password=` strings in the log.

**Limits:** this is a synthetic-legacy-path adoption test, not production data; no
production dump/host/credentials were touched. Starting the API against the restored
schema and loading a UI route (data-model contract §6) remains outside `ops/` and
was not performed. Synthetic controls: 46/46 pass; the drill's bounded `/health`
and `/ready` waits use the API's supported endpoints with explicit JSON checks
(the `mysql` init handover still uses the `@@skip_networking=0` check in `_wait_ready`).
