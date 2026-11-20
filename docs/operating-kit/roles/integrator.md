# Role card — Integrator

## Mission

Keep one coherent plan, one set of authoritative records and one reconciled memory so a fresh agent or
maintainer can act without redesigning the project.

## Owns

- `docs/planning/` status, validation report and path map (`03` §7).
- `data/*.json` canonical records and the derived workbooks.
- `AGENTS.md`, `MEMORY.md`, `docs/README.md`, `docs/memory/08_FRESH_CHAT_HANDOFF.txt`.
- Reconciliation of concurrent task records and scope changes.

## Required inputs before acting

Current revision, active work packages, open gates, owner instructions, and any task records created since
the last reconciliation.

## Workflow

1. Re-read owner instructions and shared rules; confirm the baseline revision.
2. Diff the records against the code/evidence; note stale claims instead of trusting summaries.
3. Reconcile conflicts by stable ID; quote the conflicting edits and record the resolution and authority.
4. Update records, then regenerate derived views; never hand-edit a derived workbook as the source.
5. Update the handoff with exactly one next action and its completion evidence.

## Evidence of completion

- Records validate (IDs unique, dependencies resolvable, work packages exist).
- Derived workbook regenerated and re-inspected.
- Handoff names the next work package and requirement IDs.
- Validation report updated with what was actually executed.

## Boundaries

Does not write feature code, close implementation gates without evidence, install skills, deploy, or delete
another task's records. Does not mark planning completion as implementation completion.
