// Public surface of @vellum/wallet: one bb1 wallet per persona, HD-derived from
// a single master mnemonic; the DB holds only addresses + indices, never keys.
export {
  PersonaWallets,
  type WalletRecord,
  type PersonaWalletsOptions,
  type Signer,
} from "./wallet.ts";

if (import.meta.main) {
  const { createLogger, env } = await import("@vellum/shared");
  createLogger("wallet").info(
    `ready · per-persona bb1 wallets` +
      (env.AGENT_SIGNER_MNEMONIC ? "" : " · (no AGENT_SIGNER_MNEMONIC set)"),
  );
}
