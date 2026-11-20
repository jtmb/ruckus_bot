# Area guide — `dashboard/`

OpenCode loads this file automatically when working in this directory. It replaces the aspirational template
in `../docs/operating-kit/feature-guides/dashboard-area.AGENTS.md` with the layout that actually ships. Keep
this guide short; update it here when the code changes, not in the template.

## Purpose

Next.js 16 operator UI. Server route handlers hold the session and call the API over HTTP; the browser gets
rendered HTML plus an HttpOnly cookie. The API is reached server-side only and is never published directly.

## Entrypoints (real files)

| File | Role |
| --- | --- |
| `app/layout.js`, `app/globals.css`, `app/styles/` | shell and theming |
| `app/page.js`, `app/dashboard/page.js`, `app/logs/page.js`, `app/users/page.js`, `app/createAccount/page.js` | pages |
| `app/api/{login,logout,session,check-admin,create-account,initialize-db,users,logs,logs/export,bot-status,restart-bot}/route.js` | thin server route handlers |
| `app/lib/server.js` | `apiBase()`, `callApi()`, `tokenOf()`, `sameOrigin()`, `setSession()`, `clearSession()` |
| `app/api/logs/{route.js,upstream.mjs}` and `app/logs/logic.mjs` | log explorer fetch, filters, paging, CSV export |
| `app/components/{api_bot_status,api_bot_restart,HeaderWrapper,useAuthRedirect}.js` | client helpers |

There is no `app/(auth)/` or `app/(app)/` route-group tree; do not add imports that assume those paths.
`app/page.js.old` is a stray file left untouched — not an active page.

## Configuration

`API_URL` (default `http://localhost:3003`) tells the server where the API is; `NEXT_PUBLIC_API_URL` is a
legacy fallback. No `NEXT_PUBLIC_*` variable may carry a secret or an internal-only path. The session cookie
is `ruckus_session`, HttpOnly + SameSite=strict; state-changing API route handlers check `sameOrigin()`.

## Local commands

| Command | Mutates? | Purpose / status |
| --- | --- | --- |
| `npm run dev` | no | local dev server (Next default port 3000) |
| `npm run build` | writes `.next/` | hermetic production build; succeeds with the API stopped |
| `npm start` | no | serve the built app |
| `node --test test/logs.test.mjs test/logs.routes.test.mjs` | no | dependency-free log route/filter tests; verified passing, no install needed |

There is **no** `npm test` or `npm run smoke:ui` script in `package.json`. `test/README.md` documents the
direct `node --test` invocation. Full dependency install is performed only inside `../scripts/verify.sh`
(H-backed volumes). The `build` script writes `.next/` — keep it out of the tracked tree (`.gitignore`).

## Test oracles (shipped tests)

| Test file | Guarantee / requirement |
| --- | --- |
| `test/logs.test.mjs` | endpoint-backed type filters, bounded paging, spreadsheet-safe CSV escaping |
| `test/logs.routes.test.mjs` | both log routes require the session cookie, forward it as a bearer token, use only supported query params, and export the full active filter within a hard row bound |

Health endpoints, login bootstrap, user management, live status and restart are exercised against the API in
`../api/test/api.test.js` and the browser smoke in `../docs/planning/evidence/2026-11-17-implementation.md`;
they are not re-tested by the dependency-free dashboard suites.

## Rules specific to this area

- Server route handlers check the session server-side; keep data routes dynamic (`cache: 'no-store'` in
  `callApi`), never a build-time snapshot. The client redirect hook is not the access control.
- Every data view needs loading, empty, error and stale states; stale heartbeat shows offline per
  `HEARTBEAT_STALE_SECONDS`.
- No third-party image hosts; assets live in `public/`. Interactive controls are real `<button>`/`<a>`
  elements with visible focus.
- First account is bootstrap-only (`/api/check-admin` → create-account) and becomes admin. Never add a public
  reset route, disable auth, or forward a secret to the browser.

## Data, credentials and H routing

- Server-side `callApi()` forwards only the caller's session token; never place the API URL/secret or a raw
  password/hash in a client bundle or source map.
- Tests use no API, DB, network or credentials. Any full-stack smoke uses throwaway loopback fixtures from
  `../scripts/verify.sh`; never a production token/credential or an imported original dump
  (see `../docs/deploy/BACKUP-RESTORE.md` §1).
- Generated output (`.next/`, `node_modules/`, screenshots) goes under `/mnt/h/AgentArtifacts/projects/ruckus_bot/`;
  never in the tracked tree. See `../docs/deploy/LOCAL-DEVELOPMENT.md`.

## Troubleshooting

Blank/stale page with a healthy API → build-time snapshot or session loop; check route dynamic behaviour and
cookie domain. Cookie not forwarded → `callApi()` must send the bearer token. 401 loop → session check.
Layout overflow at 360 px or keyboard gaps → visual/accessibility review. Full runbook:
`../docs/planning/operations/06_SECURITY_AND_OPERATIONS.md` §8.

## Tested vs blocked

Verified: hermetic build with the API stopped, `/api/bot-status` dynamic, and the dependency-free log tests
(`../docs/planning/evidence/2026-11-17-implementation.md`). **Blocked/unverified here:** browser visual and
keyboard-only review (dashboard deps are not installed in this checkout), assisted-technology behaviour, and
any production deployment — record as activation inputs, not as passing checks.

## References

`../docs/planning/operations/05_DESIGN_AND_ACCESSIBILITY.md`,
`../docs/planning/contracts/session-contract.md`, `../docs/planning/contracts/api-contract.md`,
`test/README.md`, `../docs/operating-kit/RULES.md`, `../docs/deploy/LOCAL-DEVELOPMENT.md`.
