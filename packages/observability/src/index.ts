// @vellum/observability — user-facing product telemetry (#42). Distinct from
// @vellum/trace (dev-side Langfuse) and @vellum/ledger (proof-of-action).
// One append-only event store under ~/.vellum, shared by every surface.
export {
  EventStore,
  type EventInput,
  type Event,
  type EventKind,
  type EventSummary,
  type EventSummaryWindow,
} from "./events.ts";
export {
  mergeObservability,
  latencyByKind,
  projectMonthlySpend,
  type UnifiedRow,
  type ObservabilitySource,
  type LedgerLike,
} from "./merge.ts";

if (import.meta.main) {
  const { createLogger } = await import("@vellum/shared");
  createLogger("observability").info(
    "ready · per-persona event store · summaries · ~/.vellum",
  );
}
