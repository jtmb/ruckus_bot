# Planning status

| Field | Value |
| --- | --- |
| Project | ruckus_bot (Discord bot + Express API + Next.js dashboard) |
| Baseline | `main` @ `711ff12` (2026-09-09) |
| Planning revision | 2026-11-16 |
| Active plan | [`operations/00_START_HERE.md`](operations/00_START_HERE.md) … [`operations/07_IMPLEMENTATION_ROADMAP.md`](operations/07_IMPLEMENTATION_ROADMAP.md) |
| Handoff | [`../memory/08_FRESH_CHAT_HANDOFF.txt`](../memory/08_FRESH_CHAT_HANDOFF.txt) |
| Validation report | [`validation-report.md`](validation-report.md) |
| Status | Planning complete (G0). Implementation **not started**; G1–G10 unpassed. |

## Scope summary

96 requirements: 14 preserved behaviours, 40 defects, 10 security controls, 18 features (6 launch, 12 later),
10 operational items, 4 documentation items. 11 work packages, 24 decisions, 18 dependency decisions,
10 assumptions, 12 sources, 11 gates.

## Scope amendments

| ID | Date | Change | Authority |
| --- | --- | --- | --- |
| SH-001 | 2026-11-16 | Initial review and plan request (review, improve, add features, fix, no removals) | Owner brief |
| SH-002 | 2026-11-16 | Prior maintenance branch identified and reused where verified | Repository inspection |
| SH-003 | 2026-11-16 | Planning package produced | This revision |
| SH-004 | 2026-11-16 | Implementation not authorised by planning | planning-specification.md §13 |

Full record: `data/scope-history.json`.

## Open decisions owned by the owner

These are activation inputs, not planning gaps:

1. Discord token with `MESSAGE_CONTENT` and `GUILD_MEMBERS` approved (`ASM-001`).
2. Whether a production database dump must be preserved (`ASM-003`).
3. OpenWeatherMap plan/quota (`ASM-006`).
4. Staging/production host target (`ASM-002`).
5. Licence confirmation for the missing `LICENSE` file (`ASM-008`).
6. Skill installation approval for WP0.

## Known baseline defects kept visible

The readme links `LICENSE`, which does not exist in the baseline. It is recorded as `FIX-028`/`ASM-008` and
excluded from the link check as a known baseline defect rather than silently passing.

## Archive state

The plan is active and unfinished; nothing is archived under `operations/archive/`. Archiving would require
delivered implementation, which this revision does not claim.
