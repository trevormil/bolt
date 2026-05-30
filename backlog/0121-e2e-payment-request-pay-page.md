---
id: 121
title: "e2e: Payment request — /pay/:id public fund page"
status: open
priority: high
type: testing
source: audit-2026-05-29
created: 2026-05-29
refs: ["0106-test-coverage-backfill.md", "0101-payment-confirm-coverage.md", "0067-agent-request-tools.md"]
---

## Description
Split from #0106 §2. The `/pay/:id` page is the unauthenticated payer-side
of a payment request. Today no Playwright test exercises open → sign →
confirm through a browser; only the engine-side request-mint is unit-tested.

The route-level `/api/payment-requests/:id/confirm` branches are a related-
but-separate critical gap tracked under #0101. This ticket is the UI walk;
**#0101 should land first** so this spec walks the hardened route.

## Acceptance criteria
- `e2e/pay.spec.ts`: open `/pay/:id` with a fresh payment request → Keplr
  mock signs MsgSend → broadcast → page shows "paid" + the requester-side
  state flips to `funded` in the agent's view.
- Asserts both the public page's success UI AND the requester-side state
  transition.
- Negative path: expired or already-funded request shows the right banner
  (not a generic error).

## Notes
Coordinate with #0101 — sequence is #0101 then #0121 so this spec walks the
fortified server route.
