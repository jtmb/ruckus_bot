---
{
  "repository": "ruckus_bot",
  "id": "planning-baseline-and-boundaries",
  "title": "Planning baseline, fix-first scope and implementation boundary",
  "tags": ["planning", "baseline", "scope", "authority"],
  "kind": "decision",
  "updated": "2026-11-16",
  "verified": "2026-11-16",
  "sources": [
    "data/decisions.json",
    "data/scope-history.json",
    "docs/planning/operations/00_START_HERE.md"
  ]
}
---

# Planning baseline and boundaries

- The planning baseline is `main@711ff12` (2026-09-09), the commit the owner pulled.
- `origin/codex/production-source-maintenance-20261027` is prior work to reuse (dependency pins,
  `.dockerignore`, supervisor production commands), not a competing baseline. It is unmerged.
- Scope is fix-first and additive: all 14 existing behaviours are preserved; removing or renaming a
  user-visible feature needs a new decision and owner approval (DEC-002).
- This revision produced planning artifacts only. No application code, skill installation, purchase or
  deployment was performed (SH-004). Implementation starts at WP0 in `07_IMPLEMENTATION_ROADMAP.md`.
- The review evidence is tied to the baseline revision and a measured local environment; it is not a test of
  the future implementation.

Why it matters: a successor chat must not "clean up" the persona, message commands or single-image
deployment, and must not treat the plan as an authorisation to ship.
