// Public surface of @vellum/orchestrator: deterministic message → persona
// routing + bounded dispatch to the persona's agent loop.
export {
  Orchestrator,
  type RouteDecision,
  type HandleResult,
  type RunLoop,
  type OrchestratorOptions,
} from "./orchestrator.ts";

if (import.meta.main) {
  const { createLogger } = await import("@vellum/shared");
  createLogger("router").info(
    "ready · deterministic routing (/switch + binding) · bounded dispatch",
  );
}
