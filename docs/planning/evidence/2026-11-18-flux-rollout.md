# Owner-completed Flux rollout — 2026-11-18

Records only. This revision owned **only** three documents:
`docs/planning/evidence/2026-11-18-flux-rollout.md` (this file),
`docs/memory/08_FRESH_CHAT_HANDOFF.txt` and `docs/deploy/FLUX-DEPLOY.md`.
It did **not** edit `data/gates.json`, credentials, the database, Git state, application
source, the chart, the live Deployment, external repositories or generated artifacts. No gate was
closed and no reviewer sign-off was added. Every line below is attributed to its observer; nothing
is promoted from "reported" to "independently verified" without a named second observer.

## Who did what

- **Owner:** ran the exact-SHA chart checks, promoted the `validated` branch, and observed the
  resulting cluster state.
- **Coordinator:** independently observed the running workload through MCP on `node03`.
- **This documentation revision:** recorded both sets of observations; executed no rollout,
  rollback, promotion, push, clone or controller change.

## Exact-SHA validation and promotion (owner-executed)

Performed against the existing authoritative `branconet-charts` checkout at the exact commit
`217f24f3ff176791e3ac2a50daf44224c208c8c7`, not against a stand-in digest:

```
unittest discover -s scripts -p 'test_*.py'   Ran 45 tests ... OK
python scripts/validate.py                    {"passed": true, "chart_count": 30,
                                               "helmrelease_count": 31,
                                               "credential_scan_passed": true,
                                               "effective_rendering_passed": true}
git push  43fca34..217f24f -> refs/heads/validated   (fast-forward)
```

The earlier "30 charts / 31 HelmReleases / credential scan clean" result cited in
[2026-11-18-harness-and-registry.md](2026-11-18-harness-and-registry.md) used a stand-in digest;
this record is the first one tied to the exact promoted commit and the pinned image digest.

## Publisher failure and promotion authority (important boundary)

- An earlier attempt failed with `wsl_path_failed`.
- The publisher then refused the prepared stage with `native_wsl_exact_sha_required`: it requires
  a native WSL charts checkout at the exact SHA, and **no native WSL clone of the charts repository
  exists** on this machine. For that tool/topology reason the publisher could not run.
- The owner therefore ran the same chart checks and promoted the exact SHA directly as a **specific,
  one-off action against the already-authoritative checkout**. This was not a replacement of the
  normal review/promotion policy, not a bypass of it, and not permission to clone the charts repo,
  create a new checkout, or fix/replace the Flux controller. The checkout rules in `AGENTS.md`
  (no new clones, worktrees or dependency copies) still apply.
- **Infrastructure owner follow-up (named, not performed here):** resolve the topology/publisher
  mismatch (`wsl_path_failed`, `native_wsl_exact_sha_required`, missing native WSL charts clone) under
  the same checkout rules so the standard publisher path works again. No controller, publisher or
  topology fix was attempted in this revision.

## Observed cluster result

Owner-observed, post-reconcile:

```
GitRepository   validated@sha1:217f24f3ff176791e3ac2a50daf44224c208c8c7
Deployment      docker.io/jtmb92/ruckus-bot:final-verify-f73d1f411426
                @sha256:45c942c97add5dda37ab58a9da370a3995d640547d32ce5995460fc4c1e0f507
runtime imageID matches that digest
Pod             ruckus-bot-7b6df4897-c8xz4   ready=true, restarts=0
Helm            ruckus-bot@0.1.4+217f24f     "Helm upgrade succeeded"
in-pod probe    GET http://127.0.0.1:3003/health -> {"status":"ok"}
```

Coordinator-independent MCP observation on `node03`: workload **Running 1/1, 0 restarts**. These are
two separate observations of the same rollout; neither is a gate result.

## Rollback readiness (no rollback executed)

- Prior image digest retained as the rollback target:
  `sha256:f63dd607ee435d24c6b5e97aaecd044b0e3dba5b872db9ff9d3fd8bc4463dd69`
  (the `git-cedb2b3...` tag in the patch's `values.yaml` base).
- Qualified private backup: [2026-11-18-production-backup-receipt.json](2026-11-18-production-backup-receipt.json)
  — mode `0o600`, sha256 `93684edb853e0177ed795fc4be24b1894d03efaa8de492b25955e65b2374091d`,
  restore verified offline (`mysql:8.4`, `--network none`, matching table counts).
- **No rollback was performed.** The digest and backup are a recorded target, not a test of rollback.

## Verified vs unverified — do not conflate

- **Verified:** the in-pod `/health` probe returned `{"status":"ok"}`; pod ready with 0 restarts;
  the running image ID matches the pinned digest; chart `0.1.4+217f24f` upgraded; MCP Running 1/1
  on `node03`.
- **Unverified (no evidence supplied in this revision):** the public ingress
  `https://ruckus.branconet.lan/`, the dashboard UI, the `/ready` readiness endpoint (the chart's
  readiness probe path — only `/health` was probed), `/api/bot-status` showing the bot online, and
  any live Discord/gateway behaviour. These remain open checks from
  [FLUX-DEPLOY.md](../../deploy/FLUX-DEPLOY.md) step 5; `/health` OK is **not** a substitute for them.

## Gate impact

G8 (operations), G9 (release), G10 (additive features), G11 (WP2 migration compatibility) and
reviewer sign-off are **unchanged** in [data/gates.json](../../../data/gates.json) and remain open.
A successful deployment observation is not gate closure and not release evidence; no gate was edited
or closed from it. The registry/backup context is in
[2026-11-18-harness-and-registry.md](2026-11-18-harness-and-registry.md) and
[2026-11-18-final-local.md](2026-11-18-final-local.md); this record updates only stale deployment
status in the [handoff](../../memory/08_FRESH_CHAT_HANDOFF.txt) and the runbook.
