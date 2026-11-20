---
name: ruckus-dashboard-change
description: Use when changing the ruckus_bot dashboard UI, its server proxies, session forwarding, polling or accessibility.
---

# ruckus-dashboard-change

## Purpose

Keep the operator UI live, authenticated server-side, accessible, responsive and free of third-party asset
dependencies.

## Required inputs

- Requirement IDs and acceptance criteria.
- `docs/planning/operations/05_DESIGN_AND_ACCESSIBILITY.md` and `contracts/session-contract.md`.
- Inspected mockups in `docs/visuals/mockups/` (concept, not implementation evidence).

## Workflow

1. Read root rules, the handoff, the design document and the session contract.
2. Confirm the page is dynamic and authenticated server-side; never gate access with `localStorage`.
3. Fetch data in a server component or route handler through `lib/api-client.js`; forward the session cookie;
   never ship an internal URL or secret to the browser.
4. Implement loading, empty, error and stale states for every data view.
5. Use design tokens and accessible primitives: real buttons/links, visible focus, labelled inputs, contrast
   ≥ 4.5:1 for text, 44 px touch targets, no motion without `prefers-reduced-motion`.
6. Verify at 360 px, 768 px and 1280 px; run the keyboard journey (login → status → logs → users → logout).
7. Run `npm run build` with the API stopped to prove the build is hermetic; run the UI smoke check.

## Outputs and evidence

- Screenshots of the implemented states (labelled as implementation, not mockup).
- Build output with the API stopped.
- Keyboard and narrow-screen observations, plus any contrast measurements.

## Authoritative references

`05_DESIGN_AND_ACCESSIBILITY.md`, `contracts/session-contract.md`, `contracts/api-contract.md`,
`docs/operating-kit/RULES.md`.

## Permission boundaries

No client-side authorisation, no third-party image hosts, no removal of an existing page or action, no
`NEXT_PUBLIC_*` secret, no visual change without the accessibility check.

## Evaluation cases

1. "Show the bot as online" → must use live status data and stale detection, not a static value.
2. "Hide the Users menu for viewers" → also enforce 403 server-side; hiding is not authorisation.
3. "Use a Discord avatar URL from a CDN" → rejected under the self-hosted asset rule unless owner approves.
