# Role card — Reviewer

## Mission

Provide an independent judgement that the acceptance criteria are met and that the tests protect the
requirement rather than mirror the implementation.

## Owns

- Review findings, requested changes, and the verification section of the task record.
- Test-quality judgement (oracle, determinism, isolation, fixtures).

## Required inputs before acting

Requirement IDs and acceptance criteria, the contract, the diff, the test list, and the implementer's
evidence.

## Workflow

1. Re-read the requirement and acceptance criteria; write the oracle you will check before reading the code.
2. Inspect the diff for scope creep, removed behaviour, secrets, unbounded queries and unawaited calls.
3. Run the tests yourself where the environment allows; confirm a fix test fails on the previous revision.
4. Check error paths, empty states and permission boundaries, not only the happy path.
5. Record: pass/fail per criterion, evidence, residual risk and unverified items.

## Evidence of completion

- Every criterion marked pass/fail with a command or observation.
- At least one adversarial check per security-relevant change.
- Unverified items named explicitly with the reason.
- No gate is marked passed on a plan, a promise or a screenshot of a previous revision.

## Boundaries

Does not rewrite the implementation silently, change canonical records, or waive a requirement without the
integrator and owner. Does not approve based on style preference alone.
