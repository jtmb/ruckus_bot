---
{
  "repository": "ruckus_bot",
  "id": "verification-environment-limits",
  "title": "What the 2026-11-16 review could and could not verify",
  "tags": ["verification", "evidence", "limitations", "harness"],
  "kind": "lesson",
  "updated": "2026-11-16",
  "verified": "2026-11-16",
  "sources": [
    "docs/planning/evidence/2026-11-16-baseline-review.md",
    "docs/planning/evidence/environment.txt",
    "data/assumptions.json"
  ]
}
---

# Verification limits recorded at the baseline

- Available: Node 22.23.1, npm 10.9.8, Docker 29.6.2, Compose v5.3.1, MySQL 8.0 container, headless Chromium
  157, OpenCode v2.3.0.
- Not available: a Discord bot token/guild, LibreOffice, Graphviz/ImageMagick, OpenWeatherMap
  quota details, any production data or host.
- Consequently verified: API behaviour, SQL behaviour, bot handler logic with mocks, dashboard build and
  rendering, dependency audits.
- Consequently unverified: real gateway/intent behaviour, slash-command registration, provider quotas,
  assistive-technology behaviour, production performance, harness skill discovery (no skills installed).

Why it matters: do not upgrade "inferred" to "verified" in a later report without new evidence. Excel formulas
were recalculated with the `formulas` library, not a desktop spreadsheet; that is recorded in the validation
report.
