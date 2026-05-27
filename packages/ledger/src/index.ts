// Public surface of @vellum/ledger: the append-only cost + trust ledger.
export {
  Ledger,
  type LedgerKind,
  type LedgerInput,
  type LedgerEntry,
  type LedgerSummary,
} from "./ledger.ts";

if (import.meta.main) {
  const { createLogger } = await import("@vellum/shared");
  createLogger("ledger").info(
    "ready · append-only proof-of-action (cost + authority)",
  );
}
