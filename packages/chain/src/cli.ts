// Small CLI for the chain client — wallet bootstrap, balances, and a validation
// send against the Meridian devnet. Usage:
//   bun run packages/chain/src/cli.ts gen
//   bun run packages/chain/src/cli.ts whoami
//   bun run packages/chain/src/cli.ts balance [bb1addr]
//   bun run packages/chain/src/cli.ts send <bb1addr> <amount> [denom]
import { getAgentMnemonic } from "@vellum/shared";
import {
  addressOf,
  generateWallet,
  getBalances,
  sendCoins,
  confirmTx,
} from "./client.ts";

// Resolve the devnet signer seed via env → OS keychain (ADR-0007), so this CLI
// still works after the seed moves out of plaintext .env.
async function requireSigner(): Promise<string> {
  const m = await getAgentMnemonic();
  if (!m)
    throw new Error(
      "no agent signer seed (set AGENT_SIGNER_MNEMONIC or store it in the keychain)",
    );
  return m;
}

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "gen": {
    const w = await generateWallet();
    console.log(JSON.stringify(w, null, 2));
    break;
  }
  case "whoami": {
    console.log(await addressOf(await requireSigner()));
    break;
  }
  case "balance": {
    const addr = args[0] ?? (await addressOf(await requireSigner()));
    console.log(addr);
    console.log(JSON.stringify(await getBalances(addr), null, 2));
    break;
  }
  case "send": {
    const [to, amount, denom] = args;
    if (!to || !amount)
      throw new Error("usage: send <bb1addr> <amount> [denom]");
    const res = await sendCoins(await requireSigner(), to, amount, denom);
    const confirmed = await confirmTx(res.transactionHash);
    console.log(
      JSON.stringify({ txHash: res.transactionHash, ...confirmed }, null, 2),
    );
    break;
  }
  default:
    console.error(
      `unknown command: ${cmd ?? "(none)"} — try gen | whoami | balance | send`,
    );
    process.exit(1);
}
