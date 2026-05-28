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

// Trace scrubbing (#24 T-10): even though only metadata (never prompt/response
// content) is sent, a caller could put a bb1 address, a hex key, or an email in
// a span's metadata. Redact those defensively before anything leaves the process
// so traces can't leak PII / secrets to the (shared, off-host) Langfuse backend.
const SCRUB: { re: RegExp; with: string }[] = [
  { re: /bb1[02-9ac-hj-np-z]{38,}/g, with: "bb1…[redacted]" }, // bech32 addrs
  { re: /\b[0-9a-fA-F]{32,}\b/g, with: "[redacted-hex]" }, // keys / hashes
  { re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, with: "[redacted-email]" },
];

export function scrubValue(s: string): string {
  return SCRUB.reduce((acc, p) => acc.replace(p.re, p.with), s);
}

/** Recursively redact secret-shaped substrings from metadata string values. */
export function scrubMetadata(
  meta?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!meta) return meta;
  const walk = (v: unknown): unknown =>
    typeof v === "string"
      ? scrubValue(v)
      : Array.isArray(v)
        ? v.map(walk)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v as Record<string, unknown>).map(([k, x]) => [
                k,
                walk(x),
              ]),
            )
          : v;
  return walk(meta) as Record<string, unknown>;
}

class LfSpan implements TraceSpan {
  constructor(private node: LfNode) {}
  child(name: string, metadata?: Record<string, unknown>): TraceSpan {
    return new LfSpan(
      this.node.span({ name, metadata: scrubMetadata(metadata) }),
    );
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
        metadata: scrubMetadata({ tier: d.tier, costUsd: d.costUsd }),
      })
      .end();
  }
  end(metadata?: Record<string, unknown>): void {
    this.node.end?.({ metadata: scrubMetadata(metadata) });
  }
}

/** Build a tracer from an injected client (null → no-op). Exposed for tests. */
export function createTracer(client: LfClient | null): Tracer {
  if (!client) return NOOP_TRACER;
  return {
    enabled: true,
    trace: (name, metadata) =>
      new LfSpan(client.trace({ name, metadata: scrubMetadata(metadata) })),
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
