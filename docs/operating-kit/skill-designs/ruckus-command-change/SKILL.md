---
name: ruckus-command-change
description: Use when adding, changing or debugging a Discord command, passive bot reaction, provider call or reply behaviour in ruckus_bot.
---

# ruckus-command-change

## Purpose

Change bot behaviour without breaking dispatch order, reply uniqueness, dedupe, provider fallbacks or help
text.

## Required inputs

- Requirement ID(s) and acceptance criteria from `data/requirements.json`.
- The current work package in `docs/planning/operations/07_IMPLEMENTATION_ROADMAP.md`.
- `docs/planning/contracts/command-contract.md` and the affected provider section.
- Current revision and the bot area guide (`bot/AGENTS.md`) when present.

## Workflow

1. Read root `AGENTS.md`, `MEMORY.md`, the handoff, then the command contract and the affected `REG-*`/`FIX-*`
   IDs.
2. Search the registry (`bot/src/core/registry.js`) for an existing trigger, alias or passive hook. Duplicate
   triggers are a defect, not a feature.
3. If the change alters a preserved reply string or removes a command, stop and require a decision record.
4. Reproduce: add a failing fixture in `bot/test/commands/<id>.test.js` with mocked message objects and a
   provider stub.
5. Implement in `bot/src/modules/commands/<id>.js` using the shared context; return `true` when consumed; await
   every send.
6. Update the registry metadata (trigger, guild-only, cooldown) so help and slash registration follow.
7. Add provider fixtures for success, empty, malformed and timeout responses; assert the fallback line.
8. Run `npm test` in `bot/`; record the exact command and result.

## Outputs and evidence

- Diff limited to the command, registry entry, provider client and tests.
- Failing-before / passing-after output for fixes.
- Help text snapshot proving the command is listed with the dynamic bot id.
- Updated local guide section and CHANGELOG entry.

## Authoritative references

`docs/planning/contracts/command-contract.md`, `docs/planning/contracts/data-model.md` (event payloads),
`docs/operating-kit/RULES.md`.

## Permission boundaries

No feature removal, no new paid provider, no secret in code, no direct `process.env` read in a command, no
gateway restart on a production system. Live Discord checks require a token from the owner.

## Evaluation cases

1. "Add a `!ping` command" → registry search, new file, fixture, help updated; no duplicate trigger.
2. "Make the bot reply twice to flips" → rejected; cites the one-reply invariant and `REG-003`.
3. "The chain sends an error in logs" → reproduces the empty-message path (50006), fixes state machine, adds a
   regression test; does not silence the error.
