---
id: 85
title: "Basic hardening — clean handling of edge/failure cases (limits, budget, bad key, no TG chat)"
status: closed
priority: high
type: reliability
source: trevor
created: 2026-05-29
updated: 2026-05-29
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/74"]
refs: ["0081-vault-withdrawal-stuck-pending.md", "0044-per-persona-spend-budget.md", "0060-require-validate-openrouter-key.md", "0028-telegram-principal-allowlist.md"]
---

## Description
Sweep the failure/edge paths and make sure each one is **caught and surfaced
cleanly** (a clear user-facing message, never a raw 500 / silent no-op / hang).
Trevor's named cases:
- **Vault limit reached** — a withdrawal/pay over the period cap (or outside the
  time window, or missing multisig sign-off) is rejected at CheckTx. Confirm the
  web route + agent tool + Telegram all return a plain-English "over your
  weekly limit" style message, not a 500 or a stuck pending.
- **Out of LLM budget** — `VELLUM_LLM_BUDGET_USD` exceeded (`chat` returns
  `budgetExceeded`). Make sure web chat, the agent loop, and Telegram all show a
  clear "daily budget reached" message.
- **No Telegram chat found / bot can't reach the user** — sending a proactive
  message to an unknown/blocked chat must fail gracefully (logged, surfaced),
  not crash the poller.
- **OpenRouter key invalid** — not just at onboarding (already validated) but
  when a previously-good key is revoked/expired mid-use: chat should surface
  "your OpenRouter key is no longer valid — update it in Settings", not a raw
  upstream error.

## Acceptance criteria
- Each case above returns a clean, specific message at every surface it can
  occur (web route → JSON error with the right status; agent tool → a usable
  tool error the model can relay; Telegram → a plain reply).
- No unhandled 500s and no perpetual "pending"/hang on these paths.
- A test per case (unit/integration) asserting the clean failure — these are the
  paths that erode trust when they break.

## Notes
This is breadth, not depth: walk the spend/withdraw/chat/Telegram surfaces and
the request_* tools, find the unguarded edges, and add the missing catch +
message + test. Pairs with the trust posture — a confusing failure is a
correctness bug here. Coordinate the "limit reached" wording with the on-chain
rejection reasons so the message is accurate.
