import { describe, expect, test } from "bun:test";
import { createTracer, NOOP_SPAN, type LfClient, type LfNode } from "./index.ts";

interface Rec {
  type: "trace" | "span" | "generation";
  name: string;
  model?: string;
  usage?: { total?: number };
  metadata?: Record<string, unknown>;
  children: Rec[];
}

// Records the observation tree the tracer builds — no network.
function recordingClient(): { client: LfClient; traces: Rec[]; flushed: () => number } {
  const traces: Rec[] = [];
  let flushes = 0;
  const node = (rec: Rec): LfNode => ({
    span: ({ name, metadata }) => {
      const c: Rec = { type: "span", name, metadata, children: [] };
      rec.children.push(c);
      return node(c);
    },
    generation: ({ name, model, usage, metadata }) => {
      rec.children.push({ type: "generation", name, model, usage, metadata, children: [] });
      return { end: () => {} };
    },
    end: () => {},
  });
  return {
    traces,
    flushed: () => flushes,
    client: {
      trace: ({ name, metadata }) => {
        const t: Rec = { type: "trace", name, metadata, children: [] };
        traces.push(t);
        return node(t);
      },
      flushAsync: async () => {
        flushes++;
      },
    },
  };
}

describe("tracer (no-op default)", () => {
  test("unconfigured tracer no-ops without throwing", async () => {
    const t = createTracer(null);
    expect(t.enabled).toBe(false);
    const span = t.trace("chat");
    expect(span).toBe(NOOP_SPAN);
    span.child("step").generation("llm", { model: "m", totalTokens: 5, costUsd: 0.1 });
    span.child("step").end();
    span.end();
    await t.flush(); // resolves
  });
});

describe("tracer (Langfuse-backed)", () => {
  test("builds nested spans with token + cost on the generation", () => {
    const { client, traces } = recordingClient();
    const tracer = createTracer(client);
    expect(tracer.enabled).toBe(true);

    const trace = tracer.trace("chat", { personaId: "atlas" });
    const step = trace.child("step", { n: 1 });
    step.generation("llm", {
      model: "anthropic/claude-haiku-4.5",
      tier: "cheap",
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      costUsd: 0.00015,
    });
    step.child("tool:echo").end();
    step.end();
    trace.end();

    expect(traces).toHaveLength(1);
    const root = traces[0]!;
    expect(root.type).toBe("trace");
    expect(root.name).toBe("chat");
    expect(root.metadata?.personaId).toBe("atlas");

    expect(root.children).toHaveLength(1);
    const stepRec = root.children[0]!;
    expect(stepRec.type).toBe("span");
    const gen = stepRec.children.find((c) => c.type === "generation")!;
    expect(gen.name).toBe("llm");
    expect(gen.model).toBe("anthropic/claude-haiku-4.5");
    expect(gen.usage?.total).toBe(30);
    expect(gen.metadata?.costUsd).toBe(0.00015);
    expect(gen.metadata?.tier).toBe("cheap");
    expect(stepRec.children.some((c) => c.type === "span" && c.name === "tool:echo")).toBe(true);
  });

  test("flush delegates to the client", async () => {
    const { client, flushed } = recordingClient();
    await createTracer(client).flush();
    expect(flushed()).toBe(1);
  });
});
