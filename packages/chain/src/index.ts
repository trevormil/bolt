// Public surface of @vellum/chain.
export {
  walletFromMnemonic,
  walletAtIndex,
  addressOf,
  addressAt,
  generateWallet,
  getBalances,
  sendCoins,
  confirmTx,
  type Coin,
} from "./client.ts";

if (import.meta.main) {
  const { createLogger, env } = await import("@vellum/shared");
  createLogger("chain").info(`scaffold ready · rpc=${env.BITBADGES_RPC}`);
}
