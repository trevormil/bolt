// Public surface of @vellum/chain.
export {
  walletFromMnemonic,
  addressOf,
  generateWallet,
  getBalances,
  sendCoins,
  confirmTx,
  claimFaucet,
  TxRevertedError,
  type Coin,
} from "./client.ts";
export {
  deriveAdapter,
  signAndBroadcast,
  bankSendMsg,
  parseAccountResponse,
  type MsgJson,
} from "./sdk.ts";

if (import.meta.main) {
  const { createLogger, env } = await import("@vellum/shared");
  createLogger("chain").info(`scaffold ready · rpc=${env.BITBADGES_RPC}`);
}
