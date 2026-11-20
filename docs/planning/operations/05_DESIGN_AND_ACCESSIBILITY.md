# 05 — Design and accessibility

The dashboard is an internal operator surface, so there is no public SEO or marketing scope. It is still a
visual product with real interaction states, a narrow-screen use case (checking status from a phone) and
security-relevant feedback, so it gets a defined design system, inspected concept mockups and accessibility
criteria.

## 1. Current visual state (implementation evidence, not a mockup)

Captured from the running baseline build (`docs/planning/evidence/`):

| Screen | Observation |
| --- | --- |
| `login.png` | Centred dark card; no empty/loading/error treatment; small link; no "forgot password" or lockout guidance |
| `create-account.png` | No visible result of the failed admin check; form looks identical to login |
| `dashboard.png` | One giant error icon, single "Bot is Offline" line, no navigation, no uptime, no logs, no users; header exposes a restart button with no confirmation |

These are `implementation` captures of `main@711ff12`, not the proposed design.

## 2. Proposed direction (concept)

Concept mockups, inspected after rendering:

| File | Surface | Size |
| --- | --- | --- |
| [`dashboard-1440.png`](../../visuals/mockups/dashboard-1440.png) | Status home: state, uptime, latency, guilds, 7-day activity, recent events | 1440×1000 |
| [`logs-1440.png`](../../visuals/mockups/logs-1440.png) | Event log with filters, outcome badges, pagination, CSV export | 1440×1000 |
| [`users-1440.png`](../../visuals/mockups/users-1440.png) | User management with role matrix and add-user form | 1440×1000 |
| [`mobile-390.png`](../../visuals/mockups/mobile-390.png) | Mobile status with alert banner and bottom tabs | 390×900 |

Provenance: authored as static HTML/CSS in this planning revision, rendered with headless Chromium
(Chrome for Testing 157) and captured to PNG. They are **concept** images: no claim that the product looks
like this today. Source HTML is preserved in `docs/visuals/mockups/source/`.

What changes and why:

- Replace the single hero image with a status grid; the old page could not answer "how long has it been up?"
  or "which guild is failing?".
- Persistent left navigation (bottom tabs on mobile) so logs and users are reachable.
- Severity colours for guild health and command outcome instead of one generic error image.
- Live freshness text ("heartbeat 8 s ago · threshold 90 s") so a stale page is distinguishable from an
  offline bot.
- Confirmation and job-state feedback for restart, because restart is a destructive operator action.

## 3. Design tokens

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#0f1115` | Page background |
| `--surface` | `#171a21` | Cards, sidebar |
| `--surface-2` | `#1e222b` | Inputs, active nav |
| `--border` | `#2a2f3a` | 1 px separators |
| `--text` | `#e8ecf3` | Primary text |
| `--muted` | `#9aa4b2` | Secondary text |
| `--accent` | `#ff2d78` | Primary action, brand dot (keeps the existing pink identity) |
| `--accent-ink` | `#1a0410` | Text on accent |
| `--ok` | `#3ddc97` | Online/healthy |
| `--warn` | `#ffc857` | Degraded/cached |
| `--danger` | `#ff5d6c` | Offline/error |
| `--info` | `#6aa9ff` | Links, focus ring |

Typography: system UI stack (no web font, no external request). Scale 12 / 13.5 / 15 / 22 / 26 px; weights
500–700. Line height 1.5 for body, 1.2 for headings.

Spacing: 4 px base; 8/12/16/24/32. Radius 8–16 px. Elevation only on cards (`0 10px 30px rgba(0,0,0,.35)`).

Contrast measured for the palette (WCAG 2.2, sRGB):

| Pair | Ratio | Requirement |
| --- | --- | --- |
| Body text on background | 15.95:1 | AA/AAA |
| Body text on surface | 14.69:1 | AA/AAA |
| Muted text on surface | 6.90:1 | AA |
| Accent button text on accent | 5.52:1 | AA |
| Link on surface | 7.24:1 | AA/AAA |
| Success badge text | 11.64:1 | AAA |
| Danger badge text | 10.12:1 | AAA |
| Warning banner text | 11.74:1 | AAA |
| Chip text on chip background | 9.70:1 | AAA |

All measured pairs pass 4.5:1 for normal text. Large headings exceed 3:1 obviously. Colour is never the only
signal: status also has a text label and an icon/glyph.

## 4. Interaction states

| State | Required presentation |
| --- | --- |
| Loading | Skeleton blocks with `aria-busy="true"`; no layout jump |
| Empty (no logs/users/guilds) | One sentence + the action that resolves it |
| Error (API 5xx) | Inline banner with retry, plus the request id in a copyable field |
| Unauthorised | Redirect to login with `next=` path; no flash of protected content |
| Stale heartbeat | Offline card with heartbeat age and the last error event |
| Restart in progress | Button disabled, job state line, `aria-live="polite"` |
| Restart failed | Danger banner with the job detail and a retry action |
| Partial data | Show what loaded, mark missing panels, never blank the page |
| Session expiry during use | Modal/notice, then redirect; no silent failure |

## 5. Responsive and device behaviour

Breakpoints: `< 640` single column + bottom tab bar; `640–1024` two-column cards; `> 1024` sidebar + grid.
Tables become stacked key/value rows below 640 px rather than horizontal scrolling. Touch targets ≥ 44 px.
Test sizes: 360×780, 390×844, 768×1024, 1280×800, 1440×900.

## 6. Keyboard, focus and motion

- Logical tab order; skip link to main content; visible 3 px focus ring (`--info`) with 2 px offset.
- All actions are `<button>`/`<a>`; no click-only `div`.
- Escape closes the mobile menu; focus returns to the trigger.
- `prefers-reduced-motion` disables transitions and chart animation.
- Charts have text alternatives (`role="img"` + summary) and the underlying table.

## 7. Content and tone

Labels are plain and specific ("Heartbeat 8 s ago", not "Live"). Error text states what failed and what the
operator can do. No exclamation marks, no anthropomorphised errors. The persona belongs to bot replies, not
to operational UI.

## 8. Assets

Self-hosted under `dashboard/public/` (`icon.svg`, `logo.svg`, `settings.svg`). Remove the hotlinked
`sndcdn.com`, `freeiconspng.com` and `iconfinder.com` references (`FIX-036`). The repository's demo GIFs stay
in `src/` for the readme and are not shipped to the browser bundle.

## 9. Verification plan

| Check | Method | Gate |
| --- | --- | --- |
| Contrast | Script the token pairs (as above) and fail under 4.5:1 | WP7 |
| Keyboard journey | Login → status → logs → users → logout, no pointer | WP7 |
| Narrow layout | Screenshots at 360 and 390 px, no horizontal scroll | WP7 |
| States | Force loading/empty/error/stale via fixtures or request interception | WP7 |
| Screen reader smoke | Accessible name/role for nav, tables, banners, buttons (manual review) | WP7 |
| Motion | Toggle reduced motion; no animation | WP7 |

Unverified at planning time: no assistive-technology session and no implementation screenshots exist yet.
Those are WP7 evidence items, not claims.
