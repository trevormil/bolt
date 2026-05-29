---
id: 82
title: "Clarify 'Drain' vs 'Revoke agent tokens' manager actions — clearer labels + helper copy"
status: closed
priority: medium
type: ux
source: trevor
created: 2026-05-29
updated: 2026-05-29
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/71"]
refs: ["0045-vault-revamp.md"]
---

## Description
The manager-admin controls in `Vaults.tsx` (shown only when the connected
Keplr wallet is the vault manager) expose two actions whose names are easy to
confuse:
- **"Drain"** (`managerWithdrawMsg`, includes `backingAddress`): burns the
  agent's vault tokens and **releases the escrowed USDC back to the manager** —
  i.e. take the money out.
- **"Revoke agent tokens"** (`managerRevokeMsg`, no backing): claws back / burns
  the agent's vault tokens **without releasing USDC to the manager** — i.e. cut
  off the agent's spending authority while escrow stays put.

Trevor finds the distinction unclear and wants better words.

## Acceptance criteria
- Rename the two actions to plainly convey the difference, e.g.:
  - Drain → something like **"Withdraw all to me"** / **"Reclaim funds"** (money
    comes back to the manager).
  - Revoke agent tokens → something like **"Freeze agent access"** / **"Revoke
    agent's authority"** (agent can no longer spend; funds unaffected).
- Add a one-line helper/tooltip under each that states the outcome in plain
  English (where the money goes vs. what access is cut).
- Keep the underlying chain messages (`managerWithdrawMsg` /
  `managerRevokeMsg`) unchanged — this is wording + helper copy only.
- Verify the labels render correctly for the manager-only view and update any
  e2e/string assertions.

## Notes
Pure UX-copy clarity; no behavior change. Confirm the exact semantics against
the tokenization msg builders before finalizing wording so the labels are
accurate (drain releases USDC; revoke does not). Final copy is Trevor's call —
propose options.
