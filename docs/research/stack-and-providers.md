# Research note — stack, runtime and providers

Date: 2026-11-16. Canonical source register with access dates: `data/sources.json`.
This note explains *why* the selected versions and providers fit; it does not replace the register.

## 1. Runtime and platform facts

| Fact | Value | Source |
| --- | --- | --- |
| Node used for the review | 22.23.1 (host) | local `node -v` |
| Node 18 status | security support ended **2025-04-30**; latest 18.20.8 (2025-03-27) | nodejs.org release index; endoflife.date |
| Node 26 | 26.13.1, LTS "Lithium", active support to **2027-10-27**, security to 2029-04-30 | nodejs.org; endoflife.date |
| Node 24 | 24.22.3, maintenance LTS, security to 2028-04-30 | same |
| MySQL 5.7 | extended support ended **2023-10-31** | endoflife.date/mysql |
| MySQL 8.0 | support ended **2026-04-30** | same |
| MySQL 8.4 LTS | premier support to 2029-04-30, extended to 2032 | same |
| Next 16.4.6 | engines `node >= 20.9.0` | npm registry metadata |
| Express 5.3.0 / latest 4.x 4.22.3 | two maintained lines | npm registry dist-tags |

Consequence: the repository's pinned `node:18.19.1` and `mysql:5.7` are both unsupported. The plan moves to
Node 26.13.1 and MySQL 8.4 LTS (`DEC-003`, `DEC-004`), keeping Node 24 as a recorded fallback if a native
module fails.

## 2. Dependency selection

| Package | Baseline | Selected | Reason |
| --- | --- | --- | --- |
| `next` / `react` | 14.2.7 / 18 | 16.4.6 / 19.3.1 | Next 14.2.7 is in the audited advisory range including authorization bypass and RCE classes |
| `express` | 4.18.2 | 4.22.3 | Stays on the maintained 4.x line (route and middleware behaviour preserved); removes audited 4.18 issues |
| `proxy-addr` | transitively old | 2.0.8 override | Critical IP-spoofing advisory reachable through Express |
| `body-parser` | 1.20.2 | 2.4.0 | DoS advisories; `express.json()` remains the parser actually used |
| `mysql2` | 3.9.1 (api) | 3.24.6 | Critical RCE/prototype-pollution advisories; supports MySQL 8.4 |
| `mysql` (v2) | 2.18.1 (bot) | removed | Cannot authenticate to MySQL 8 (`ER_NOT_SUPPORTED_AUTH_MODE`, measured) |
| `bcrypt` | 5.1.1 | 6.0.0 | Critical `node-pre-gyp` advisory chain |
| `discord.js` | 14.14.1 | 14.28.1 | Current 14.x; `clientReady` event naming and current REST behaviour |
| `axios` | 1.6.7 | 1.21.1 | Audited SSRF/credential-leak set; provider calls could also use platform `fetch` |
| `node-fetch` | 3.3.2 | removed | Node 26 has global `fetch`; the baseline imported it dynamically per call |
| `cheerio` | rc.12 | 1.2.0 | Only needed for the optional profanity-list refresh fixture |

"Latest" was not assumed compatible: Next 16 requires Node ≥ 20.9 (satisfied), Express 5 would change router
and error semantics for no product benefit (`DEC-005`), and the Next 16 caching model changes route-segment
options, so `FIX-002` is verified with a runtime probe rather than a copied snippet (`DEC-007`).

## 3. Provider notes

| Provider | Use | Observed 2026-11-16 | Plan |
| --- | --- | --- | --- |
| Discord | gateway + REST | embed limits (title 256, description 4096, field value 1024, 25 fields, 6000 chars) and 50 req/s global; 401/403/429 count toward a 10k/10min invalid-request limit | Respect limits, cap digests, never send empty messages |
| gamerpower.com | PC game giveaways | 12 items returned; no embed overflow today | One digest message, ≤ 10 items, cached fallback |
| JokeAPI | jokes | reachable | Keep, short timeout, one fallback line |
| OpenWeatherMap | current weather | quota page is JavaScript-rendered; **quota unverified** | Keep, configurable key, 5 s timeout, explicit missing-key message; quota is an activation input (`ASM-006`) |
| purgomalum.com | profanity list | 205 terms, 128 ms per fetch | Bundle the baseline, refresh with TTL, fail closed |
| evilinsult.com | insult text | reachable | Keep as the reply source, rate limited |

## 4. Deployment options considered

| Option | Verdict | Reason |
| --- | --- | --- |
| Keep single supervisor image (current) | **Selected** | Preserves the documented deployment (`REG-014`); three small processes fit one container |
| Split compose services in production | Rejected for now | More moving parts without a measured need |
| Kubernetes/Flux (maintenance branch) | Deferred | No cluster target provided; the branch's `ops/` tooling is infrastructure-specific |
| Managed database | Deferred | Single-digit GB scale; managed cost and credentials not established |

## 5. Cost research

Hetzner Cloud Regular Performance is quoted "from €5.49 per month, excl. VAT" (accessed 2026-11-16). Domain,
backup storage and labour are estimates because no quotes were obtained in this session; they are labelled as
estimates in `data/cost-model.xlsx` and never treated as zero. The workbook recalculates these scenarios with
formulas verified by an independent evaluator (see `docs/planning/validation-report.md`).

## 6. Limitations

- No Discord developer portal access: intent approval and real gateway behaviour are unverified.
- OpenWeatherMap pricing/quota could not be read from the rendered page.
- No production hosting quotes beyond the Hetzner entry price.
- npm advisory data changes continuously; the audit gate is a policy, not a one-time result.
