// @vellum/tokenization — agent-side BitBadges tokenization (vaults, payment
// requests) via the `bitbadges` SDK. The agent does all heavy tx lifting:
// build → set value.creator → encode → sign (GenericCosmosAdapter) → broadcast
// DIRECT to the cosmos LCD (the devnet's BitBadges /api/v0 isn't public).
//
// VALIDATED LIVE 2026-05-27 (vault create, code 0 on Meridian devnet). Recipe:
//   const adapter = await GenericCosmosAdapter.fromMnemonic(mnemonic, "bitbadges-1");
//   const msg = buildVault({ backingCoin:"USDC", name, symbol, description, image, dailyWithdrawLimit? });
//   msg.value.creator = adapter.address;                 // builder leaves it blank
//   const proto = encodeMsgsFromJson([msg]);
//   const payload = createTransactionPayload(txContext, proto);
//   const sig = await adapter.signDirect(payload, accountNumber);
//   POST JSON.parse(createTxBroadcastBody(txContext, proto, sig.signature))
//        → LCD /cosmos/tx/v1beta1/txs  → confirm via @vellum/chain confirmTx.
//
// TODO (0012 build): createVault() wrapper + manager = human (freeze manager
// perms → agent has zero manager capability) + address reconciliation (the
// adapter derives a different bb1 than cosmjs coin-118; unify @vellum/wallet on
// the adapter derivation) + TxManager `vault_op` integration + tests.

if (import.meta.main) {
  const { createLogger } = await import("@vellum/shared");
  createLogger("tokenization").info(
    "scaffold ready · bitbadges SDK · vault-create path validated live (0012 build next)",
  );
}
