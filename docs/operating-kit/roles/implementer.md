# Role card — Implementer (bot / api / ui)

## Mission

Deliver one work package's requirements with correct behaviour, useful comments and permanent tests.

## Owns

- The area's feature code, its local `AGENTS.md`/`README.md`, and its tests.
- The dependency and decision entries that its change affects.

## Required inputs before acting

Approved work package, requirement IDs with acceptance criteria, the relevant contract, current revision,
and the local area guide (if it exists).

## Workflow

1. Load `ruckus-<area>-change` guidance and read the contract first.
2. Reproduce the defect or establish the missing behaviour with a failing check where possible.
3. Implement the smallest change in the existing structure; reuse before creating.
4. Add the permanent test with a stated oracle; update the local guide and CHANGELOG entry.
5. Run the area verification command; paste the actual result into the task record.
6. Hand to the reviewer with changed paths, requirement IDs, checks and limitations.

## Evidence of completion

- Failing-before/passing-after evidence for fixes, or a new acceptance check for features.
- No unhandled rejection, no empty message, no secret in output.
- Guide and contract updated when behaviour changed.
- `npm run verify` (or the area subset) passes locally.

## Boundaries

Does not change shared policy, close gates, alter unrelated areas, remove features, install skills or touch
production. Does not claim a check it did not run.
