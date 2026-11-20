# Local continuation — 2026-11-17

Baseline `main@711ff12`. This revision touched only the planning records and documents owned by
this continuation: `data/decisions.json`, `data/gates.json`, `data/work-packages.json`,
`docs/memory/08_FRESH_CHAT_HANDOFF.txt`, this file, and the metrics-only sentences in
`docs/planning/contracts/api-contract.md` and `docs/planning/contracts/session-contract.md`.

No application source, security config, credentials, workbooks, ZIP, commits, system or live access,
deployment, second checkout or worktree was created or modified. No gate was closed.

## Focused evidence source

The executed-check source is `docs/planning/evidence/2026-11-17-implementation.md` (clean `npm ci`,
`./scripts/verify.sh` ALL CHECKS PASSED, audits 0/0/0, 16 API + 13 bot tests, hermetic build, docker
build healthy, baseline reproductions now 401). Implementation detail was read only to confirm
contract choice; it was not changed. `docs/deploy/BACKUP-RESTORE.md` is the backup/restore source.

## Confirmed and recorded

| Item | Record | Basis |
| --- | --- | --- |
| `GET /metrics` is admin-only; address/private-network bypass deliberately absent | DEC-025; api-contract §7; session-contract §4 | `api/src/ops/access.js` denies every non-admin with 403 and never consults a client/proxy address; both contracts now say "admin only". This is a valid contract choice, not a defect. |
| Live restore disabled until an exclusively task-owned isolated MySQL 8.4 fixture exists | DEC-026; WP2 stop condition | Backup runbook §6 and `ops/mysql_restore_drill.py`: non-dry-run refusal, no live drill, synthetic tests are planning evidence only. |
| Setup and harness scope is OpenCode v2.3.0 only | DEC-027; gates G2/G3 | G3 stays retired; no second harness or replacement G ID introduced. WP0 still needs installation approval. |
| G2 is harness-only; WP2 migration compatibility is a separate persisted criterion | DEC-028; gates G2 and G11; WP2 `gate`/`gates`/`exit_criteria` | Removed the dual use of G2. Neither G2 nor G11 was passed from a synthetic/focused test. |

## Corrections to stale or overly broad language

- `G2` title/evidence now state "harness only" and that synthetic or focused tests do not satisfy it;
  its state remains `not_passed` (WP0 installation is not approved and no matrix has run).
- `G11` was added as a distinct, `not_passed` migration-compatibility gate; WP2 no longer maps to `G2`.
  The WP2 exit criteria carry an explicit `SEPARATE PERSISTED ACCEPTANCE CRITERION` entry naming G11,
  the fresh/re-run/idempotent/paging/retention oracles and the no-synthetic-pass rule. No existing G ID
  was repurposed and no gate was weakened.
- `G7` moved from `passed_local` to `partial_local`. Focused tests verified heartbeat/status without
  rebuild, logout/401 and stale→offline, but no browser was available: the keyboard-only journey,
  360/1280 px screenshots and contrast table re-measured from implemented tokens remain unverified.
  The earlier wording overstated full acceptance.
- The 2026-11-16 PNGs and `api-runtime.log` predate the current 2026-11-17 source and are stale as
  proof of current state; they are preserved as historical evidence, not promoted.
- Container registry credentials are unavailable (`docs/deploy/FLUX-DEPLOY.md`), so no image was pushed
  and nothing was deployed; the chart validator's stand-in digest is not a deployment.
- The legacy dump `prod-pre-1.1.0-20261117T011520.sql` is on a 9p/DrvFS mount reported `0777`, cannot
  provide `0600`, and is not qualified as a drill fixture or rollback. It was left untouched.
- Historical evidence and branch names are preserved: `main`, `origin/main`, `origin/HEAD -> origin/main`,
  `origin/codex/production-source-maintenance-20261027`, `origin/feat-shak`, `origin/feat/shak`.

## Verification run for this revision

`python3 -B docs/operating-kit/scripts/check_planning_package.py`:

```
required files             pass  53 present
markdown links             pass  64 relative links resolve
requirement ids            pass  96 unique
requirement work packages  pass  all resolve
requirement dependencies   pass  all resolve
work package dependencies  pass  all resolve
work package coverage      pass  requirement lists match
work package order         pass  dependencies precede dependents
requirement spec links     pass  all specification documents exist
decision records           pass  28 complete
work package gates         pass  all resolve
visual manifest files      pass  13 entries resolve
diagram xml                pass  all diagrams parse
tracker sheets             pass  README, Requirements, Work Packages, Gates, Summary
tracker ids                pass  96 rows in canonical order
cost model sheets          pass  README, Assumptions, Scenarios, Price sources, Unknowns
evidence markers           pass  1 warning(s)
warning: known baseline defect: readme.md -> LICENSE (absent in main@711ff12; FIX-028 / ASM-008)
17 checks, 0 failure(s)
```

Focused cross-record assertions (read-only JSON/text checks): **19 assertions, 0 failures** — covering
28 decisions with DEC-025…DEC-028; 12 gates; G2 harness-only/`not_passed` and synthetic exclusion;
G11 separate/`not_passed`; G7 `partial_local`; no work package other than WP0 mapping to G2; WP0 keeping
G1+G2; WP2 mapping to G11 with the explicit persisted criterion and unqualified-dump stop condition;
matching "admin only" metrics sentences in both contracts; the handoff continuation section; and
preserved branch names.

## Not verified / not claimed

- No harness matrix was executed; G1 and G2 remain unpassed.
- No fresh owned MySQL fixture or qualified backup destination exists; G11 is unpassed and no real restore
  drill was performed.
- G7 browser checks, WP8 metrics/alerts/backup automation, most WP10 features, the LICENSE decision and
  the stray-file claims remain outside this revision.
- No integrated result from a parallel agent is claimed here; only the focused evidence above is recorded.
