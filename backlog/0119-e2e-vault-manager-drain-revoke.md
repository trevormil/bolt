---
id: 119
title: "e2e: Vault manager drain + revoke (human-signed manager actions)"
status: open
priority: high
type: testing
source: trevor
created: 2026-05-29
refs: ["0082-clarify-drain-vs-revoke-wording.md", "0106-test-coverage-backfill.md"]
---

## Description
Manager force-withdraw (drain) and approval revoke are the human-signed
recovery hatches when the agent is misbehaving or the vault needs to be
torn down. Neither is e2e-tested. Drain in particular is the highest-risk
human action in the app — and the path through Playwright is unwalked.

## Acceptance criteria
- `e2e/vault-manager.spec.ts`:
  - **Drain**: manager opens vault detail → invokes drain → Keplr mock signs
    the manager-level tx → escrow zeroed → activity row reflects "drained
    by manager".
  - **Revoke**: revoke approval → subsequent agent withdraw rejected at the
    gate; UI affordance + signed-tx broadcast walked.
- Asserts on the user-facing wording from #0082 (drain vs revoke) to lock
  the copy in.

## Notes
The manager confirm-typing modal may need a small testing affordance if it
proves brittle under Playwright. Keep the production confirmation pattern;
the spec just needs to drive it deterministically.
