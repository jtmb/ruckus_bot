# Session, authorisation and bootstrap contract

Owner: `implementer-api` with `implementer-ui`. Requirements: `SEC-001`, `SEC-002`, `SEC-003`,
`FIX-004`, `FIX-031`, `FEAT-003`.

## 1. Threat statement

The current build has no server-side authentication: every API route is anonymous, `localStorage`'s
`authenticated` flag is the only dashboard gate, and the authentication response contains the bcrypt hash.
Anyone who can reach port 3003 can change the admin password (measured in
`evidence/2026-11-16-baseline-review.md` §3). Compose publishes 3003 and 3306 by default, so this is a
network-reachable takeover on any host that exposes them.

## 2. Session lifecycle

1. `POST /auth/login` verifies username + password with bcrypt compare and a constant-time path for unknown
   users (always performs one compare against a dummy hash).
2. On success: generate 32 random bytes (`crypto.randomBytes`), store **SHA-256 of the token** as
   `sessions.id`, set the cookie to the raw token.
3. Cookie: name `rkn_sid`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when the request is HTTPS
   (`TRUST_PROXY=true` respected), `Max-Age` 43,200 s.
4. Every request: hash the cookie, look up the session, reject when `expires_at < now()` or
   `last_seen_at < now() - 2 h`. Update `last_seen_at` at most once per 60 s.
5. Logout, password change and role change revoke affected sessions server-side.
6. Absolute session lifetime 12 h; idle 2 h. Both configurable.

## 3. CSRF

- Double-submit token: a random token is returned by `GET /auth/me` and must be sent in `X-CSRF-Token` for
  every mutating request.
- The token is bound to the session row; rotating the session rotates the token.
- Login and logout are exempt from CSRF (login has no session yet; logout is idempotent) but are rate limited.
- Rejections return `403 CSRF_INVALID` without indicating whether the session is valid.

## 4. Roles

| Action | viewer | operator | admin |
| --- | --- | --- | --- |
| View status/guilds/logs | yes | yes | yes |
| Restart bot | no | yes | yes |
| Prune logs | no | yes | yes |
| Create/modify/delete users | no | no | yes |
| Change guild settings | no | no | yes |
| Read metrics | no | no | admin only (no private-network/address bypass; DEC-025) |

Authorisation is enforced in the API and re-checked in the dashboard's server components. Hiding a button
is never the control.

## 5. Bootstrap and recovery

- First run: zero accounts → `POST /users` is allowed anonymously. The created account is `admin`.
  A second anonymous attempt returns `409 BOOTSTRAP_COMPLETE`.
- The dashboard's create-account page is reachable only while zero accounts exist; afterwards it is a
  404-equivalent state with a link to login (`FIX-032`).
- Locked-out admin: documented operator procedure runs
  `npm run reset-password -- --username <name>` inside the API container, which writes an audit row and
  revokes sessions. No HTTP route can reset a password without a session.
- The reset command requires shell access to the container; this is an explicit trust boundary.

## 6. Password and login policy

- bcrypt cost 12 (increase to 13 when login p95 exceeds 400 ms on target hardware).
- 12–200 characters, not equal to username, rejected against a bundled common-password list.
- 5 failed attempts per 15 min per IP **and** per username; 10 failures lock the account for 15 min.
- Successful login clears the failure counter and records `last_login_at`.
- Responses never reveal whether the username exists (`401 INVALID_CREDENTIALS` for both cases), except the
  admin-only user lookup.

## 7. Dashboard integration

- The browser never calls the API directly and never receives the API URL, a token or a hash.
- Next server actions / route handlers create the session by calling the API, then store the cookie
  (server-side) and forward the CSRF token to the client.
- `middleware.js` (or the layout's server component for the pinned Next version) redirects unauthenticated
  requests before rendering; the client-side `useAuthRedirect` hook is removed (`FIX-031`).
- `GET /dashboard`, `/users`, `/logs` are dynamic (`force-dynamic` or the version-equivalent) because they
  read request state. This prevents the build-time snapshot defect measured in `FIX-002`.

## 8. Auditability

Every authentication event, role change, user creation/deletion, settings change and restart records an
audit row with actor, target, IP hash, request id and outcome. Audit rows are append-only through the API;
no delete route exists.

## 9. Verification matrix

| Case | Expected |
| --- | --- |
| Anonymous `GET /bot/logs` | 401 |
| Viewer `POST /bot/restart` | 403 |
| Operator `DELETE /users/:id` | 403 |
| Admin deletes the last admin | 409 `LAST_ADMIN` |
| Valid session with missing CSRF on `PUT /guilds/:id/settings` | 403 |
| Expired session | 401 and cookie cleared |
| `localStorage.setItem('authenticated','true')` then open `/dashboard` | redirected to login |
| Login with unknown user vs wrong password | identical body and status |
| Response bodies and logs scanned for `\$2[aby]\$` | no match |
