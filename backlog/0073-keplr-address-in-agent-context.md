---
id: 73
title: "Auto-inject the connected Keplr address into the agent's context (when connected)"
status: closed
priority: medium
type: feature
source: trevor
created: 2026-05-28
updated: 2026-05-28
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/68"]
refs: ["0027-keplr-connect.md", "0051-agent-money-autonomy.md", "0075-vault-create-no-manager-500.md"]
---

## Description
When the human has Keplr connected in the web app, the agent should KNOW the
human's bb1 address — so it can address payment/deposit requests to the right
place, set it as a vault manager, or reference "your wallet" without asking. Pass
the connected address into the chat context (system/context block) for the turn.

## Acceptance criteria
- When a Keplr wallet is connected in the browser, the active chat turn includes
  the human's bb1 address in the agent's context (e.g. a context line "the
  human's connected wallet is bb1…").
- When not connected, nothing is injected (the agent shouldn't hallucinate one).
- The address flows from the client (it knows the Keplr connection) to the chat
  request — not stored server-side as a secret; it's a public address.
- Don't break the persona memory wall — this is per-turn context, not persisted
  cross-persona.

## Notes
Related to #75 (vault manager needs the human address) and #0027 (Keplr connect).
The connected address is the natural source for the vault `managerAddress` too —
coordinate so "connected → agent knows it → can use it as manager / request
target."
