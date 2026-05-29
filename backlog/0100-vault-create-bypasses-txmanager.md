---
id: 100
title: "Vault create bypasses TxManager mutex + orphans on local-write failure; vault_op ungated at chokepoint"
status: open
priority: critical
type: bug
source: audit-2026-05-29
created: 2026-05-29
refs: ["0099-tx-state-machine-hardening.md", "0066-agent-vault-criteria.md"]
---

## Description
`vault.create` is the only money-touching path that does NOT route through
`txManager.submit`. The audit traced three real defects:

### 1. Bypasses the per-persona pending guard (CRITICAL)
- Where: `packages/engine/src/vaults.ts:190-201`, `packages/tokenization/src/vault.ts:245-257`.
- `tokCreateVault(agent, ...)` calls `signAndBroadcast` directly. During the
  ~20s confirm window the `tx` table has NO row → `pending(personaId)` returns
  empty → a *second* tx (send_usdc, withdraw) submitted through `txManager.spend`
  passes the durable guard. Sequence collisions or invariant violations follow.
- Fix: route `vault.create` through `txManager.submit({kind:"vault_op", ...})`
  so the per-persona guard covers the in-flight create. Persist the vault row
  in the confirmation callback.

### 2. Local-DB write after chain-write orphans on-chain collections (HIGH)
- Where: `packages/engine/src/vaults.ts:203-226`.
- Vault commits on-chain (`code 0`). Then `vaultRefFromTx(await this.fetchTx(...))`
  runs — if the LCD returns a partial response (events index lagging), parse
  throws. Local row never persists. The collection exists on-chain with the
  agent as `creator` + the human as `manager` but the dashboard never sees it →
  the manager can't revoke it from the UI; the agent can't list it.
- Fix: write a `pending_vault` row *before* broadcast; on confirm, attempt
  parse; on parse failure retry the LCD a few times before giving up. Plus a
  one-shot `discoverOrphanVaults()` scan that queries the chain for
  `manager == principalAddress` and reconciles missing rows.

### 3. `vault_op` is not gated at the TxManager chokepoint (HIGH)
- Where: `packages/tx/src/tx.ts:220-226` (gate fires only on `kind === "spend"`).
- The comment claims "vault_op is gated upstream in VaultService" — true for
  `withdraw` / `pay`, but `engine.txManager.submit({kind:"vault_op", ...})` is a
  public method on the engine. Any future tool/route/MCP server that constructs
  a `vault_op` directly bypasses the `vault.withdraw` capability check. The
  single-chokepoint architecture promise from #37 is structurally false.
- Fix: gate `vault_op` at `submit` too. Resolve the capability from `kind`
  (`vault.create` / `vault.withdraw` / `vault.pay`), and refuse `vault_op`
  unless an explicit witness is presented. Move the upstream `authorize?.()` in
  VaultService to a structural assertion rather than the trust-the-caller note.

## Acceptance criteria
- `vault.create` routes through `txManager.submit` (or an equivalent chokepoint
  that participates in the per-persona pending guard); the existing test for
  "a pending tx blocks the next spend" covers vault-create-then-spend too.
- A vault row is committed only when its on-chain create is parseable; orphans
  are recoverable via a chain-scan reconciliation (manual command for now).
- `txManager.submit({kind:"vault_op"})` from a code path lacking the upstream
  authorize → rejected with `CapabilityDeniedError`. Test asserts the bypass
  closes.

## Notes
Findings #3, #5, #9 from the adversarial-money-path review.
