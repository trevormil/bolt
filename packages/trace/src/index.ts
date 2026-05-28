// Public surface of @vellum/trace: env-gated Langfuse tracing (no-op default).
export {
  tracer,
  createTracer,
  NOOP_SPAN,
  type Tracer,
  type TraceSpan,
  type GenerationData,
  type LfClient,
  type LfNode,
} from "./trace.ts";

if (import.meta.main) {
  const { createLogger } = await import("@vellum/shared");
  const { tracer } = await import("./trace.ts");
  createLogger("trace").info(
    `ready · langfuse tracing ${tracer.enabled ? "enabled" : "disabled (no creds)"}`,
  );
}
