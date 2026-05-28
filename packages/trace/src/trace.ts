import { env, createLogger } from "@vellum/shared";

const log = createLogger("trace");

// Langfuse tracing wrapper (ticket 0021). Goals:
//  - one trace per request, with NESTED spans: agent step → LLM → tool → chain,
//    each carrying token + $ cost,
//  - a no-op when unconfigured so dev/tests run without creds and callers never
//    branch on null (spans always return a usable handle),
//  - PRIVACY: only metadata (model, tokens, cost) is sent — never prompt/response
//    content. Content scrubbing/inclusion is revisited pre-mainnet (0024).

export interface GenerationData {
  model: string;
  tier?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}

export interface TraceSpan {
  child(name: string, metadata?: Record<string, unknown>): TraceSpan;
  generation(name: string, data: GenerationData): void;
  end(metadata?: Record<string, unknown>): void;
}

export interface Tracer {
  enabled: boolean;
  trace(name: string, metadata?: Record<string, unknown>): TraceSpan;
  flush(): Promise<void>;
}

// ---- No-op (default when unconfigured) ----------------------------------
export const NOOP_SPAN: TraceSpan = {
  child: () => NOOP_SPAN,
  generation: () => {},
  end: () => {},
};
const NOOP_TRACER: Tracer = {
  enabled: false,
  trace: () => NOOP_SPAN,
  flush: async () => {},
};

// ---- Minimal Langfuse client surface we depend on (injectable for tests) -
export interface LfNode {
  span(opts: { name: string; metadata?: Record<string, unknown> }): LfNode;
  generation(opts: {
    name: string;
    model?: string;
    usage?: { input?: number; output?: number; total?: number; unit?: string };
    metadata?: Record<string, unknown>;
  }): { end: () => void };
  end?(opts?: { metadata?: Record<string, unknown> }): void;
}
export interface LfClient {
  trace(opts: { name: string; metadata?: Record<string, unknown> }): LfNode;
  flushAsync?(): Promise<void>;
}

class LfSpan implements TraceSpan {
  constructor(private node: LfNode) {}
  child(name: string, metadata?: Record<string, unknown>): TraceSpan {
    return new LfSpan(this.node.span({ name, metadata }));
  }
  generation(name: string, d: GenerationData): void {
    this.node
      .generation({
        name,
        model: d.model,
        usage: {
          input: d.promptTokens,
          output: d.completionTokens,
          total: d.totalTokens,
          unit: "TOKENS",
        },
        metadata: { tier: d.tier, costUsd: d.costUsd },
      })
      .end();
  }
  end(metadata?: Record<string, unknown>): void {
    this.node.end?.({ metadata });
  }
}

/** Build a tracer from an injected client (null → no-op). Exposed for tests. */
export function createTracer(client: LfClient | null): Tracer {
  if (!client) return NOOP_TRACER;
  return {
    enabled: true,
    trace: (name, metadata) => new LfSpan(client.trace({ name, metadata })),
    flush: async () => {
      await client.flushAsync?.();
    },
  };
}

function envClient(): LfClient | null {
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) return null;
  // Lazy require so the SDK isn't loaded (or required) when unconfigured.
  const { Langfuse } = require("langfuse") as typeof import("langfuse");
  log.info("Langfuse tracing enabled");
  return new Langfuse({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    baseUrl: env.LANGFUSE_HOST,
  }) as unknown as LfClient;
}

// Process-wide tracer, configured from env at import (no-op without creds).
export const tracer: Tracer = createTracer(envClient());
