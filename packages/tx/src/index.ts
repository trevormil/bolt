// Public surface of @vellum/tx: chain-state reconciliation + tx lifecycle.
export {
  TxManager,
  TxRejectedError,
  isBb1Address,
  isPositiveMicroAmount,
  type PendingTx,
  type TxStatus,
  type TxKind,
  type TxChain,
  type SpendInput,
  type TxManagerOptions,
} from "./tx.ts";

// Test-only constants — real bech32-checksummed bb1 addresses used by unit
// tests across the workspace. Exported here so any package's tests can import
// them without re-deriving via @cosmjs/crypto. Not part of the prod surface.
export { TEST_BB1 } from "./test-bb1.ts";

if (import.meta.main) {
  const { createLogger } = await import("@vellum/shared");
  createLogger("tx").info(
    "ready · simulate→broadcast→persist→confirm · per-persona mutex · startup reconcile",
  );
}
