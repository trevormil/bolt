---
id: 125
title: "e2e: Autonomous money path via chat — send_usdc + faucet + budget breach"
status: closed
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/105"]
priority: medium
type: testing
source: trevor
created: 2026-05-29
updated: 2026-05-29
refs: ["0106-test-coverage-backfill.md", "0051-agent-money-autonomy.md", "0076-agent-eval-suite.md"]
---

## Description
The agent's autonomous money tools (`send_usdc`, faucet claim, budget-breach
behavior) are unit-tested at the tool layer but no Playwright spec walks
the chat → tool-call → tx → activity-feed path. This is the surface where
prompt-injection or misuse manifests as user-visible behavior — exactly the
path that wants e2e coverage.

The eval suite (#0076) probes refusal at the LLM layer; this spec asserts
the deterministic UI path when the LLM does take the action.

## Acceptance criteria
- `e2e/chat-money.spec.ts`:
  - **Happy path**: chat "send 1 USDC to <addr>" with adequate budget →
    `send_usdc` tool call → activity row pending → confirmed → balance moves.
  - **Faucet**: chat "claim from faucet" → faucet tool call → balance
    updates.
  - **Budget breach**: persona budget at 0 → chat "send 1 USDC" → reply
    includes the budget-exhausted message + NO outgoing tx in the activity
    feed.
- Asserts both the user-visible reply AND the side-effect (activity event
  presence/absence).

## Notes
Chat-layer mirror of #0118 (vault withdraw UI). Stub the LLM tool-call
rather than running real OpenRouter (cost). Use the existing LLM seam
pattern in the chat test-server setup.

## Scope landed (2026-05-29 / MR !105)
The initial e2e drives the **WalletPanel** affordances (faucet claim +
USDC send) which hit the same engine.claimFaucet + txManager.spend
chokepoints as the chat-driven send_usdc tool. Asserts the faucet
event lands on the per-persona event feed AND that the send shows
"Sent N USDC (E2ETXHASH…)" in the wallet note.

What's deferred: a runLoop seam that synthesizes tool calls from
prompt text would let the spec drive "send 1 USDC to bb1…" through
the chat surface. The agent-tools layer (send_usdc selection +
gating) is already exercised by `agent-tools.test.ts` deterministically,
so the chat-mediated layer would add seam coverage, not engine
coverage — punted to a follow-up. Budget breach behavior likewise
applies to LLM cost (#44), not USDC sends; out of scope here.
