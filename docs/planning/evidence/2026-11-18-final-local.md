# Final local reconciliation — 2026-11-18

Baseline `main@711ff12`. This revision touched only the four records owned by this checkpoint:
`docs/memory/08_FRESH_CHAT_HANDOFF.txt`, `data/gates.json`, `data/decisions.json` and this file.
No application source, security config, credentials, workbooks, ZIP, commits, checkouts or deployment
was created or modified. No gate was closed from a synthetic or focused test.

## Final image identity (confirmed locally)

- Tag `ruckus_bot:final-verify-f73d1f411426`; `docker image inspect` reports
  `sha256:45c942c97add5dda37ab58a9da370a3995d640547d32ce5995460fc4c1e0f507`, matching the
  manifest-list digest in `verify/final-f73d1f411426/build.log` (built from `node:26.13.1-slim`,
  Next 16.4.6, `npm audit` 0). The tag/digest are local only: no registry push (no credentials) and
  nothing deployed.

## Distinct test sets — not one new full suite

| Set | Source | Observed result |
| --- | --- | --- |
| Prior integrated verify (2026-11-18, MySQL 8.4.13) | `verify/verify-9a7943c86481fcd7.log` | `ALL CHECKS PASSED`; retained log shows **75 API + 31 bot + 23 dashboard = 129** passing tests, audits 0/0/0, hermetic dashboard build. The coordinating handoff reports **156** integrated tests for the broader run; the retained log supports 129, so the 156 figure is recorded as parent-reported, not re-derived here. |
| Earlier isolated smoke | `verify/smoke-da9a1764da3e.log` | health 200, ready 200, dashboard 200, `SMOKE_HTTP_OK`; bot supervisor RUNNING with `BOT_NODE_PROCESS_ABSENT (fail-closed)`; `getaddrinfo EAI_AGAIN discord.com` expected without a token. |
| Earlier failed attempt (not a pass) | `verify/verify-ee2bbb981e0bb837.log` | container start failed: read-only H runtime mount of `node_modules`; superseded by the successful runs above. |
| Final rebuilt image, focused re-verification | `verify/final-f73d1f411426/` | **28 browser checks** (28/28), **23 dashboard tests** (23/23), **46 ops guard tests** (unittest OK). This is a focused re-check of the final image, **not** a new 156-test integrated suite. |

## Dashboard visual replacement

Fresh captures from the final image replace the stale 2026-11-16 PNGs as current-state visual evidence:
`final-f73d1f411426/screens/{dashboard_1280,dashboard_360,login_1280,login_360,logs_360,users_1280}.png`
and `export-logins.csv`. The 28 browser checks (`browser-results.json`, `browser-run.log`) locally cover
the keyboard-only journey, focus-trap/escape/return, 360 px and 1280 px no-overflow, 3 px focus rings,
WCAG-AA contrast (15.95 / 14.69 / 6.9 / 6.62), the logins filter + matching CSV export, anon 401,
cross-origin 403, HttpOnly/SameSite cookie with no body leak, zero external egress and no page errors.
These are locally supported dashboard subcriteria only; they do not close G7 while the wider dashboard
contracts (rich filters, role model, security behind a production ingress) remain incomplete.

## Isolated real-migrations recovery scope

`state/migration-drill-events.jsonl` run `20261118t053643_bea6b672` used image
`ruckus_bot:verify-20261117-235846` (`sha256:60f6bf6d…`), `mysql:8.4`, `network: "none"`, ext4 volumes
on the existing H store, and synthetic baseline rows marked `RUNMIG-…`. The three **real shipped**
migrations (`0001_baseline`, `0002_sessions_and_heartbeat`, `0003_log_indexes`) were applied/adopted, a
mode-600 verified backup was restored and all recorded checks (counts, indexes, migration ids,
preserved rows) passed; containers and volumes were cleaned up. `state/isolated-drill-events.jsonl`
records a separate synthetic 8-migration drill. Scope limits: **synthetic data only; no real rollback;
no production dump used or qualified; no production compatibility** (ASM-003 still unconfirmed). This
is planning evidence, not G8/G11 closure and not a live restore drill.

## Gate implications and gaps

- Supported local subcriteria only: G4/G5/G6 keep `passed_local`; G7 keeps `partial_local` with the
  browser subcriteria now locally evidenced; G8/G9/G10/G11 stay `not_passed`.
- G1/G2 still `not_passed`: WP0 skill installation approval has not been given and no harness matrix ran.
- G9: image built locally but no registry credentials, no push, no qualified production dump and no
  rollback target. G10/WP10 remains pending (rich filters, role model, security and remaining features
  incomplete). G11 stays unpassed — synthetic/focused migration evidence is not production compatibility.
- No live Discord token or OpenWeatherMap key was used; no user-visible feature was removed.
