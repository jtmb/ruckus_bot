# Deploying ruckus-bot 1.1.0 through Flux

Status of this runbook (2026-11-18): **candidate preparation only. No deployment was performed by this assignment.**
No live/cluster action, registry push, Git commit/push, backup,
credential or sign-in, new checkout/output root, or external-checkout write/access
workaround occurred **by this documentation assignment**. The chart patch now carries the
already-published, confirmed image digest.

**Owner-completed rollout (2026-11-18):** the owner subsequently ran the exact-SHA chart checks
and promoted the `validated` branch, and the workload is running the pinned digest. That operator
action is recorded in [2026-11-18-flux-rollout.md](../planning/evidence/2026-11-18-flux-rollout.md)
and summarised below. This runbook's approval/promotion policy (section below) is unchanged: the
owner's exact-SHA promote was a specific one-off action, not a bypass or a replacement of that
policy, and not permission to clone the charts repo or fix the Flux controller.

## Owner-completed rollout result — 2026-11-18 (recorded, not performed here)

- Owner ran, against the authoritative checkout at exact commit
  `217f24f3ff176791e3ac2a50daf44224c208c8c7`: `unittest discover -s scripts -p 'test_*.py'`
  → 45 tests OK; `python scripts/validate.py` → 30 charts, 31 HelmReleases, credential scan and
  effective rendering pass; fast-forward `43fca34..217f24f` to `refs/heads/validated`.
- Owner observed: Flux `validated@sha1:217f24f3ff176791e3ac2a50daf44224c208c8c7`; Deployment image
  `docker.io/jtmb92/ruckus-bot:final-verify-f73d1f411426@sha256:45c942c97add5dda37ab58a9da370a3995d640547d32ce5995460fc4c1e0f507`
  with matching runtime imageID; pod `ruckus-bot-7b6df4897-c8xz4` ready, 0 restarts; chart
  `0.1.4+217f24f` upgraded; in-pod `GET /health` → `{"status":"ok"}`. Coordinator independently
  observed MCP Running 1/1, 0 restarts on `node03`.
- Publisher could not be used: earlier `wsl_path_failed`, then `native_wsl_exact_sha_required`
  with no native WSL charts clone. Infrastructure owner follow-up is to resolve that
  topology/publisher mismatch under the checkout rules; no fix was attempted here.
- **Verified:** in-pod `/health`, pod readiness/0 restarts, matching imageID, chart upgrade, MCP
  Running 1/1. **Unverified (no evidence supplied):** public ingress
  `https://ruckus.branconet.lan/`, dashboard UI, the `/ready` readiness endpoint, `/api/bot-status`
  bot-online and live Discord behaviour. `/health` OK does not substitute for the step-5 checks.
- G8–G11 and reviewer sign-off are unchanged by this rollout; see section below.

## Source of truth and scope

- Flux source: `flux-system/branconet-charts`
  (`ssh://git@github.com/jtmb/branconet-charts.git`, branch `validated`).
- The `ruckus-bot` HelmRelease already runs the app in namespace `ruckus` with secret
  `ruckus-bot-runtime`; only the chart image, probes and chart version change.
- Candidate change: `branconet-charts-ruckus-bot-1.1.0.patch`, generated against base
  `c3b3bbd`. It pins the image to the published, anonymously pullable tag/digest
  `docker.io/jtmb92/ruckus-bot:final-verify-f73d1f411426@sha256:45c942c97add5dda37ab58a9da370a3995d640547d32ce5995460fc4c1e0f507`.
  No `REPLACE_WITH_PUSHED_DIGEST` placeholder remains; no rebuild or push is needed for
  this revision.
- The patch received only bounded static/fixture verification (it parses, its hunks
  apply to a synthetic pre-image and the exact digest is present). It was **not** applied
  to or validated against the authoritative charts checkout in this assignment: that
  checkout is not present in this repository, so **no validation of a new charts revision
  is claimed here**. Apply it with plain `git apply` (the `index` hashes are informational;
  the stale values.yaml target hash was removed rather than fabricated because the base
  file is unavailable). If a `--3way`/`--index` workflow is required, regenerate those
  hashes inside the authoritative checkout before use.

## Mandatory production preflight (all must hold before any promotion)

- Gates **G8 (operations), G9 (release), G10 (additive features) and G11 (WP2 migration
  compatibility)** are separate criteria and are still `not_passed` in `data/gates.json`.
  Each must be evidenced and closed by its owner with **reviewer sign-off** before
  production. Focused, local or synthetic checks — including the isolated migration
  drill and the 46 ops unit tests — are planning evidence only and close no gate.
- A qualified, private pre-production backup must exist (mode `0600` on a
  POSIX-enforcing store) with recorded checksum and a tested rollback digest. The
  former `H:\AgentArtifacts\projects\ruckus_bot\backups\prod-pre-1.1.0-20261117T011520.sql`
  legacy dump is **unqualified and must not be used**: it sits on a 0777 DrvFS/9p mount
  with no `0600` guarantee and contains password hashes. Do not read, copy, import,
  checksum or use it as a drill or rollback fixture. See `BACKUP-RESTORE.md`.
- Verify the production ingress, runtime secret and role model; never disable
  authentication to unblock a rollout.

## Promotion procedure (operator, normal approved flow)

1. Use the **exact authoritative `branconet-charts` checkout** already used for this
   project. Do **not** clone, fork, worktree or create a new checkout/output root.
   Confirm it is clean and on the expected base, then apply the candidate with
   `git apply /home/brajam/repos/ruckus_bot/docs/deploy/branconet-charts-ruckus-bot-1.1.0.patch`
   and confirm the image line carries the exact digest above.
2. Run the chart repo's validator (`python scripts/validate.py`) in that checkout and
   record its output. The earlier "30 charts, 31 HelmReleases, credential scan clean"
   result used a stand-in digest and is **not** evidence for this pinned revision.
3. Open a PR to `main`, obtain the required reviews and let CI validate. Only after
   that approval/merge is the change promoted to `validated` by the normal approved
   flow. **Never apply the patch or edit HelmRelease/Deployment objects directly in
   the live cluster, and never push straight to `validated` or bypass review.**
4. Flux reconciles the `validated` branch within about a minute; the Recreate strategy
   causes a brief outage while the pod swaps.
5. Verify: `kubectl -n ruckus get pods`, `kubectl -n flux-system get helmrelease ruckus-bot`,
   pod logs show `Applied migrations: 0002..., 0003...`, `https://ruckus.branconet.lan/`
   loads and `/api/bot-status` shows the bot online after sign-in. Record the evidence.

## Rollback

`flux suspend` is not required: revert the approved PR/promotion so the image returns
to the prior digest `sha256:f63dd607ee435d24c6b5e97aaecd044b0e3dba5b872db9ff9d3fd8bc4463dd69`
(the `git-cedb2b3...` tag in the patch's `values.yaml` base). Migrations only add tables/indexes,
so the old image keeps working; a rollback that crosses a schema change needs the documented
reverse step or a qualified restore. Do not use the unqualified legacy dump. The qualified private
backup is recorded in
[2026-11-18-production-backup-receipt.json](../planning/evidence/2026-11-18-production-backup-receipt.json)
(mode `0o600`, checksum and offline restore verified). **No rollback was executed** for the
2026-11-18 rollout; this is a recorded target only.

## Behaviour changes operators will notice

- The API and dashboard now require sign-in; existing accounts and bcrypt hashes keep working.
- `ruckus-bot-published` still exposes 3003/8088 on the node IPs; the API now rejects anonymous requests.
- Weather needs `OPENWEATHERMAP_API_KEY` (not in the current secret); without it the bot uses the existing generic error.
