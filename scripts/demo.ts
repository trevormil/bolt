// Vellum E2E demo (0020) — the thesis, live on the Meridian devnet. Scenario C+A:
// the agent does ALL the BitBadges machinery from plain intent; the human stays
// the manager; every action lands in the ledger as proof. Run from the repo root:
//
//   bun scripts/demo.ts
//
// Requires AGENT_SIGNER_MNEMONIC (a funded-able devnet signer) in .env. Uses the
// real engine + chain — no mocks. Funding stands in via the faucet; a live
// PaymentRequest (0014) is the production funding path. The narrated steps map
// 1:1 to docs/demo.md.
import { confirmTx, getBalances } from "@vellum/chain";
import { createEngine } from "@vellum/engine";
import { createLogger, env } from "@vellum/shared";
import { vaultDeposit } from "@vellum/tokenization";

const log = createLogger("demo");
const PERSONA = "demo-assistant";
const DENOM = env.VELLUM_DENOM;
const usdc = (micro: string | number) => (Number(micro) / 1e6).toFixed(2);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function beat(n: number, title: string) {
  console.log(`\n━━━ ${n}. ${title} ━━━`);
}
async function balance(address: string): Promise<string> {
  const b = await getBalances(address);
  return b.find((c) => c.denom === DENOM)?.amount ?? "0";
}
// Block until a submitted tx settles (the TxManager confirms in the background).
async function awaitSettled(
  engine: ReturnType<typeof createEngine>,
  id: string,
  timeoutMs = 30_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = engine.txManager.get(id);
    if (row?.status === "confirmed") return;
    if (row?.status === "failed")
      throw new Error(`tx ${id} failed: ${row.error}`);
    await sleep(1000);
  }
  throw new Error(`tx ${id} did not settle within ${timeoutMs / 1000}s`);
}

const engine = createEngine();

beat(1, "Setup — persona + wallet");
if (!engine.store.getPersona(PERSONA)) {
  engine.store.createPersona(PERSONA, "Vellum", {
    name: "Vellum",
    role: "payment-first personal agent",
    voice: "warm, concise, plain-English",
  });
}
const wallet = await engine.wallets.ensureWallet(PERSONA);
console.log(`Persona "Vellum" · wallet ${wallet.address}`);

beat(2, "Fund the wallet (faucet — stands in for a PaymentRequest, 0014)");
await engine.claimFaucet(wallet.address);
for (let i = 0; i < 15 && Number(await balance(wallet.address)) === 0; i++) {
  await sleep(1000);
}
console.log(`Wallet balance: ${usdc(await balance(wallet.address))} USDC`);

beat(
  3,
  "Scenario A — the agent creates a USDC vault (the vault-creation moment)",
);
console.log('Intent: "Earmark my rent into a vault with a 5 USDC/day limit."');
const vault = await engine.vaults.create(PERSONA, {
  name: "Rent",
  symbol: "vRENT",
  dailyWithdrawLimit: 5,
});
console.log(
  `Vault ${vault.symbol} · collection ${vault.collectionId} · backing ${vault.backingAddress}`,
);
console.log(
  "The human is the vault manager; the agent has zero manager capability.",
);

beat(4, "Human funds the vault escrow (5 USDC → 1:1-backed vault tokens)");
const agent = await engine.wallets.signerFor(PERSONA);
const dep = await vaultDeposit(
  agent,
  { collectionId: vault.collectionId, backingAddress: vault.backingAddress },
  "5000000",
);
await confirmTx(dep.txHash);
console.log(`Deposited 5.00 USDC (tx ${dep.txHash.slice(0, 10)})`);
console.log(`Wallet now: ${usdc(await balance(wallet.address))} USDC`);

beat(
  5,
  "Scenario C — the agent withdraws 2 USDC within the rule (recurring payment)",
);
console.log(
  'Intent: "Pay this month\'s rent — release 2 USDC from the Rent vault."',
);
const w = await engine.vaults.withdraw(PERSONA, vault.collectionId, "2000000");
await awaitSettled(engine, w.id);
console.log(
  `Withdrew 2.00 USDC (tx ${(w.hash ?? w.id).slice(0, 10)}) — now spendable base USDC`,
);
console.log(`Wallet now: ${usdc(await balance(wallet.address))} USDC`);

beat(6, "Proof — the ledger (every action, with who authorized it)");
for (const e of engine.ledger.list(PERSONA)) {
  console.log(`  • ${e.kind.padEnd(9)} ${e.summary} [${e.authority}]`);
}

log.info("demo complete · all actions confirmed on the Meridian devnet");
engine.txManager.close();
