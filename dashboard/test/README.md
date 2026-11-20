# Dashboard log-explorer tests

Dependency-free `node:test` coverage for the scoped log explorer. No dashboard
install, API, database, network or credentials are required.

```
node --test dashboard/test/logs.test.mjs dashboard/test/logs.routes.test.mjs dashboard/test/guard.test.mjs
```

`logs.test.mjs` checks endpoint-backed type filters, bounded paging and
spreadsheet-safe CSV escaping. `logs.routes.test.mjs` stubs only `next/*` modules
and `fetch` to check that both log routes require the session cookie, forward it
as a bearer token, use supported query parameters only, and export the full
active filter within the row bound. `guard.test.mjs` stubs `next/headers`,
`next/navigation`, `next/server` and `fetch` to check that the protected-page gate
separates anonymous, invalid-session and upstream-outage cases, fails closed
before render, and that check-admin/initialize-db make no anonymous migration call.

Not verified here: Next build and browser visual/keyboard review require the
dashboard dependencies, which are not installed in this checkout.
