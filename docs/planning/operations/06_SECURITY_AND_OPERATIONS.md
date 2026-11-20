# 06 — Security and operations

## 1. Trust boundaries

| Boundary | Crossing | Control |
| --- | --- | --- |
| Discord → bot | Gateway events and message content | Token in secret store; privileged intents only for the features that need them; ignore bots |
| Browser → dashboard | HTTPS :8080 | Server session, CSRF, role check, security headers, rate limits |
| Dashboard → API | Private network HTTP | Shared secret header + session forwarding; API not published |
| API → MySQL | Private network | Dedicated account with DML-only rights; migrations use a separate account |
| Operator → host | Shell/container | Documented runbooks, audit rows for in-app changes, backups before mutation |
| Bot → providers | Outbound HTTPS | Timeouts, response size caps, cached fallbacks, no secrets in URLs logged |

The measured baseline violates the browser boundary completely: every API route is anonymous and the
dashboard's authorisation is `localStorage`. That is `SEC-001`/`FIX-005`/`FIX-031` and the first security
gate item.

## 2. Threats and mitigations

| Threat | Likelihood | Impact | Mitigation | Residual risk |
| --- | --- | --- | --- | --- |
| Anonymous account takeover or password reset | Certain today | Critical | Sessions, RBAC, CSRF, bootstrap-only first account, audit rows | Host compromise still owns the box |
| Credential hash disclosure | Certain today | High (offline cracking) | Safe projections, log redaction, response scan test | Weak user passwords remain weak (policy + cost 12) |
| Session theft via XSS | Medium | High | HttpOnly cookie, no `dangerouslySetInnerHTML`, CSP, dependency hygiene | No CSP is a claim until WP7 adds it |
| CSRF on admin actions | Medium | High | Double-submit token bound to session | Token theft equals session theft |
| Unauthenticated restart / shell injection | Certain today | High | Fixed allowlist command, no interpolation, operator role, job state | Process manager still runs in the same container |
| Discord token leakage | Low | Critical | Env only, redaction, never in browser bundle, `.dockerignore` excludes `.env` | Logs from third-party libraries must be routed through the redactor |
| Abuse / command spam | High | Medium (rate limits, bans) | Per-user cooldowns, per-channel limits, cached providers | Discord's global 50 req/s and invalid-request limits are external |
| SQL injection | Low | High | Parameterised queries, enum/range validation, no dynamic identifiers | Migration SQL is trusted code |
| Dependency compromise | Medium | High | Lockfiles, `npm ci`, pinned image digests, audit gate, review of install scripts | Transitive packages remain a supply-chain risk |
| Log/privacy exposure | Medium | Medium | Content logging off by default, retention, role-limited read, export audit | Operator with DB access can read rows |
| Disk exhaustion by logs | High over time | Medium | Retention prune, bounded queue, disk alert | Burst above queue capacity drops rows (counted) |
| Losing data on upgrade | Medium | High | Backup before migration, tested restore, forward-only migrations | No point-in-time recovery without binlogs |

## 3. Authorisation model

Roles `viewer`, `operator`, `admin` are enforced in the API and re-checked in server components
(`contracts/session-contract.md` §4). Deny by default: a new route without a declared role fails the route
matrix test. Hiding a control in the UI is never the control.

## 4. Secrets and configuration

- Required secrets: `BOT_TOKEN`, `MYSQL_PASSWORD`, `SESSION_SECRET`. Optional: `OPENWEATHERMAP_API_KEY`.
- Development may use a `.env` file (git-ignored); production uses real environment variables or the
  platform's secret mechanism.
- Startup validation (`SEC-004`, `FEAT-016`) names the missing or malformed variable and exits non-zero.
- Rotation: token and database password can be rotated without a code change; rotating `SESSION_SECRET`
  invalidates all sessions (documented, acceptable).
- No secret is written to a log, error response, HTML, source map or image layer. The `.dockerignore` and
  `.gitignore` enforce exclusion, and a pre-release grep scans the build context.

## 5. Data protection

- Logged message content is **off** by default; enabling it is an explicit operator decision with a visible
  banner in the dashboard.
- Personal data: Discord user ids, usernames, guild ids, account usernames, IP hashes. No emails, no
  payment data, no message attachments.
- Access: only authenticated dashboard roles; exports are audit-logged.
- Retention: interaction 30 d, error 90 d, aggregate 180 d (configurable). Account deletion removes sessions
  immediately and nulls log references according to the documented policy.
- Restore caution: restoring a database can re-create sessions or accounts deleted after the dump. The
  restore procedure therefore **revokes all sessions and re-checks deleted accounts** after import, and the
  operator records that step. Restoring data must not restore revoked access.
- Export: admin CSV/JSON export of logs and account lists; no bulk message archive.

## 6. Delivery and environments

| Environment | Purpose | Data | Access |
| --- | --- | --- | --- |
| Local | Development and tests | Seeded demo rows | Developer workstation |
| Staging (optional) | Pre-release smoke | Anonymised copy or empty | Operator |
| Production | Live guilds | Live | Operator, least privilege |

- Build: `docker build` from a clean clone, `npm ci`, pinned base image digests, no build-time network calls
  from the dashboard (`FIX-040`). Image runs as a non-root user.
- Configuration is environment-specific; the image is identical across environments.
- Release evidence: image digest, base digests, migration list, `npm run verify` output, smoke results,
  rollback digest, CHANGELOG entry (`OPS-007`).
- Migrations run before app start; a failure aborts startup and names the file (`OPS-008`).
- Rollback: redeploy the previous digest; migrations are forward-only, so a rollback that crosses a schema
  change requires the documented reverse step or a restore. The release notes must say which applies.

## 7. Release procedure (operator)

1. Confirm the revision and that all launch gates are passed.
2. Back up the database; record the checksum.
3. Build and tag by digest; record base-image digests.
4. Run `npm run verify` from a clean clone.
5. Apply migrations to staging or an empty database; confirm idempotency by re-running.
6. Deploy; wait for `/ready`; confirm one heartbeat and one command in a test guild.
7. Record evidence, then tag. Any failed step stops the release.

## 8. Runbooks

### Bot offline but container running
Check `/bot/status` heartbeat age, then container logs for `TokenInvalid`, missing intent, gateway
disconnects. Do not restart before capturing logs. If the token is rejected, rotate it and restart; if an
intent is missing, fix the application settings in the Discord developer portal.

### API 5xx or dashboard blank
Check `/health` (process) and `/ready` (database). `DATABASE_UNAVAILABLE` → verify MySQL health, credentials
and `MYSQL_PORT`. A migration failure names the file; restore the pre-release dump if it cannot be fixed
forward. A blank dashboard with a healthy API usually means a build-time snapshot or a session loop — check
the route's dynamic behaviour and the cookie domain.

### Login locked out
Use the documented container command `npm run reset-password -- --username <name>` (audited). Never add a
public reset route and never disable auth.

### Database unreachable
Check disk and container health first. Do not recreate the volume. If corruption is confirmed, restore the
last verified dump and revoke sessions.

### Disk pressure
Check log table size and prune per retention; verify backups are external; never delete the only backup.

### Suspected compromise
Rotate bot token, database password and `SESSION_SECRET`; revoke sessions; review audit rows and recent
account changes; preserve logs before cleanup.

## 9. Monitoring and alerting

| Signal | Threshold | Action |
| --- | --- | --- |
| Heartbeat age | > 90 s | Offline alert (once), recovery notice on return |
| API 5xx rate | > 2 % over 5 min | Page operator, check `/ready` |
| Command error rate | > 10 % over 15 min | Check provider status and cached fallback |
| Log queue drops | > 0 in 5 min | Raise queue or reduce content logging |
| Disk usage | > 80 % | Prune, expand, verify backups |
| Login failures | > 20 in 15 min | Investigate abuse, temporary block |
| Restart job failure | any | Read job detail, follow bot-offline runbook |

Outside-system detection is required because the API cannot report its own death: an external check (host
cron, uptime monitor or a second small bot) calls `/health` and the dashboard status, and alerts through the
configured webhook (`FEAT-012`).

Support ownership: one named operator (role card `operator.md`) owns alerts; the integrator owns the plan;
the repository owner owns credentials and hosting decisions.

## 10. Capacity, latency and recovery targets

These are **targets** until WP8 measures them.

| Metric | Target | Measurement |
| --- | --- | --- |
| Command p95 (non-provider) | < 150 ms | command duration histogram |
| Command p95 (provider-backed, cached) | < 300 ms | histogram with `cached` label |
| API p95 | < 200 ms | HTTP histogram |
| Dashboard first contentful paint (LAN) | < 1.5 s | browser measurement |
| Recovery time after process crash | < 60 s | supervisor restart + heartbeat |
| Recovery time after host restart | < 5 min | drill |
| Restore drill RTO | < 30 min | drill record |
| Backup RPO | 24 h | daily dump |
| Retention | 30/90/180 d | prune log |

Overload behaviour: the bot queues log writes and drops oldest with a counter; the API returns 503 for
database timeouts rather than hanging; Discord rate limits are respected by discord.js. Admission control is
per-user cooldown plus per-channel limits, not a global queue.

Redundancy is **not** claimed: one host, one database, no failover. Recovery is via restart, restore and
redeploy. A second host is justified only by a measured uptime requirement, not by preference.

## 11. Cost model (summary)

Editable detail: `data/cost-model.xlsx`. Currency EUR, prices quoted 2026-11-16 unless marked estimate.

| Item | Low | Base | High | Note |
| --- | --- | --- | --- | --- |
| Host (Hetzner Cloud, Regular Performance) | €5.49/mo | €10.98/mo | €21.96/mo | "from €5.49/mo excl. VAT" quoted; base assumes 2× low for headroom |
| Domain | €1/mo (est.) | €1.25/mo (est.) | €2/mo (est.) | Annual registration amortised; estimate |
| Backup storage | €0 (local) | €2.50/mo (est.) | €5/mo (est.) | Off-host object storage strongly recommended |
| Provider APIs | €0 | €0 | €0–€40/mo (est.) | Free tiers; paid weather plan is an unknown, not zero in the high case |
| Email/alerting | €0 | €0 | €0 | Webhook to an existing Discord channel |
| Labour (implementation) | 80 h | 140 h | 220 h | Estimate at the owner's internal rate |
| Labour (operations) | 1 h/mo | 2 h/mo | 4 h/mo | Patching, backups, incidents |

Unknowns are listed, not zeroed: OpenWeatherMap quota and paid tier (`ASM-006`), owner labour rate, and
whether off-host backup storage already exists. No revenue or monetisation is assumed.

## 12. Maintenance calendar

| Cadence | Task |
| --- | --- |
| Weekly | Review error logs, alert noise, disk usage; confirm backups ran |
| Monthly | `npm audit` + dependency update PR/branch, restore spot-check, certificate expiry |
| Quarterly | Restore drill, access review (accounts/roles), retention verification, capacity review |
| Per release | Full release procedure §7 with evidence |
| Annually | Runtime/base-image support review, licence and persona review |
