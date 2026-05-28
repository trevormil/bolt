// Public surface of @vellum/tx: chain-state reconciliation + tx lifecycle.
export {
  TxManager,
  type PendingTx,
  type TxStatus,
  type TxKind,
  type TxChain,
  type SpendInput,
  type TxManagerOptions,
} from "./tx.ts";

if (import.meta.main) {
  const { createLogger } = await import("@vellum/shared");
  createLogger("tx").info(
    "ready · simulate→broadcast→persist→confirm · per-persona mutex · startup reconcile",
  );
}
