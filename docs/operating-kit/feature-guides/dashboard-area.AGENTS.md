# Template — dashboard area guide (`dashboard/AGENTS.md`)

Copy to `dashboard/AGENTS.md` when WP6/WP7 starts, replacing placeholders.

## Purpose

Next.js operator UI. Server components authenticate and fetch from the API; the browser receives rendered
HTML, a CSRF token and nothing else.

## Entrypoints

| File | Role | Owner |
| --- | --- | --- |
| `app/(auth)/login/page.js` | public login | implementer-ui |
| `app/(app)/layout.js` | session gate, shell | implementer-ui |
| `app/(app)/dashboard/page.js` | live status | implementer-ui |
| `app/(app)/logs/page.js` | log explorer | implementer-ui |
| `app/(app)/users/page.js` | admin user management | implementer-ui |
| `app/api/*/route.js` | thin proxies to the API | implementer-ui |
| `lib/api-client.js` | server-side fetch with cookie forwarding | implementer-ui |
| `app/styles/` | tokens, components, responsive rules | implementer-ui |

## Allowed dependencies

`pages → lib/api-client → api (HTTP)`. Components never fetch the API from the browser; no `NEXT_PUBLIC_*`
variable may contain an internal URL or secret.

## Rules specific to this area

- Every authenticated page is dynamic and checks the session server-side; the client redirect hook is gone.
- Every data view has loading, empty, error and stale states.
- No third-party image hosts; assets live in `public/`.
- Interactive controls are real `<button>`/`<a>` elements with visible focus; no clickable divs.

## Local commands

| Command | Mutates? | Purpose |
| --- | --- | --- |
| `npm run dev` | no | local dev server |
| `npm run build` | no (writes `.next/`) | hermetic production build |
| `npm test` | no | component/route contract tests |
| `npm run smoke:ui` | no | HTTP smoke of built app |

## Test oracles

Session gate, live status refresh, empty log result, failed restart job, keyboard journey, 360 px layout.

## Troubleshooting

Build fetching the API (caching misconfigured), cookie not forwarded, 401 loop after login, layout overflow
at 360 px.

## References

`05_DESIGN_AND_ACCESSIBILITY.md`, `contracts/session-contract.md`, `contracts/api-contract.md`,
`docs/operating-kit/RULES.md`.
