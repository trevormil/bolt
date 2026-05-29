---
id: 75
title: "Vault creation fails with 500 (no vault manager) — return a clean 400 + wire the manager address"
status: closed
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/66"]
priority: high
type: bug
source: trevor
created: 2026-05-28
updated: 2026-05-28
refs: ["0027-keplr-connect.md", "0045-vault-revamp-gating-multisig.md", "0073-keplr-address-in-agent-context.md"]
---

## Description
Creating a vault via the UI returns **500 Internal Server Error**. Root cause
(from the live demo daemon log):

```
error: no vault manager — set VELLUM_PRINCIPAL_ADDRESS (the human) or connect Keplr (0027)
  at create (packages/engine/src/vaults.ts:186)
```

`VaultService.create` computes `manager = req.managerAddress ?? this.defaultManager`
(`defaultManager` = `env.VELLUM_PRINCIPAL_ADDRESS`). A fresh install has **neither**
— no principal env var, and Keplr-connect (#0027) doesn't yet supply one — so it
throws, and the create route doesn't catch this case, so it surfaces as an
unhandled **500**. This affects **all** vault creation (not just the 1-of-1
multisig the tester tried) — any create without a manager fails.

## Acceptance criteria
1. **Graceful error, not a 500.** The vault-create route catches the
   "no manager" case and returns **400** with the clear message (connect a wallet
   / set a manager) — no unhandled 500. Add a test.
2. **Wire the manager address.** A from-scratch user must be able to create a
   vault. Pick the path (coordinate with #73 / #0027):
   - Use the **connected Keplr address** as the vault `managerAddress` (preferred
     — the human manager IS the connected wallet), passed from the UI; and/or
   - collect a principal address at onboarding; and/or
   - gate the vault-create UI behind "connect Keplr" when no manager is configured,
     with a clear prompt instead of a failed submit.
3. Repro covered by a test: create-with-no-manager → 400 (+ the happy path with a
   manager supplied still 201).

## Notes
High — core feature is broken for any fresh install. The manager-from-Keplr path
ties into #73 (inject the connected address) and #0027 (Keplr connect).
