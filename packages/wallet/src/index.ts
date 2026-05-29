// Public surface of @vellum/wallet: one bb1 wallet per persona, HD-derived from
// a single master mnemonic; the DB holds only addresses + indices, never keys.
export {
  PersonaWallets,
  type WalletRecord,
  type PersonaWalletsOptions,
  type Signer,
} from "./wallet.ts";

if (import.meta.main) {
  const { createLogger, getAgentMnemonic } = await import("@vellum/shared");
  const present = !!(await getAgentMnemonic());
  createLogger("wallet").info(
    `ready · per-persona bb1 wallets` +
      (present ? "" : " · (no signer seed configured)"),
  );
}
