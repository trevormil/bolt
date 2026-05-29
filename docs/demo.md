# Bolt E2E demo — the thesis, live on devnet (0020)

**Pinned scenario: C + A** — a recurring payment plus the vault-creation moment.
~5–7 minutes live on the Meridian devnet. The thesis in one run: **the agent does
all the BitBadges machinery from plain intent; the human stays the manager; every
action lands in the ledger as proof.**

## Run it

```bash
bun run demo        # scripts/demo.ts — real engine + chain, no mocks
```

Requires `AGENT_SIGNER_MNEMONIC` in `.env` (a devnet signer the faucet can fund).
Funding uses the faucet as a stand-in; in production a **PaymentRequest** (ticket
0014) is the funding path.

## The beats

1. **Setup** — a persona ("Vellum") and its derived `bb1…` wallet.
2. **Fund** — the faucet drops 10 USDC into the wallet (PaymentRequest analog).
3. **Scenario A — vault creation.** From the intent _"earmark my rent into a vault
   with a 5 USDC/day limit,"_ the agent creates a 1:1 USDC-backed vault. The human
   is set as the vault **manager**; the agent has zero manager capability.
4. **Fund escrow** — 5 USDC is deposited into the vault (1:1-backed vault tokens).
5. **Scenario C — recurring payment.** From _"pay this month's rent — release 2
   USDC from the Rent vault,"_ the agent withdraws within the daily rule; the
   released base USDC is then spendable.
6. **Proof** — the ledger, every action tagged with who authorized it.

## Expected ledger (illustrative)

```
  • vault_op  created vault vRENT (manager bb1…)        [agent]
  • vault_op  vault_op 2.00 USDC → bb1…backing          [agent]
```

Plus the funding/deposit movements reflected in the wallet balance printed at
each step. Exact ordering and any `message` rows depend on the run; the
invariant is that **no value moves without a confirmed on-chain tx behind a
ledger row** (0023).

## Demo-day notes

Risks + mitigations live in [`research/audit/03-failure-ops.md`](../research/audit/03-failure-ops.md)
(§Demo-day); the full narrated script is in
[`research/audit/04-new-ideas.md`](../research/audit/04-new-ideas.md)
(§Recommended demo).
