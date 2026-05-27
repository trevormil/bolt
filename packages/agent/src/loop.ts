import {
  completeWithTools,
  type ChatMessage,
  type Meter,
  type ToolsResult,
} from "@vellum/llm";
import { NOOP_SPAN, type TraceSpan } from "@vellum/trace";
import { createLogger } from "@vellum/shared";
import type { ToolSpec } from "./tools.ts";

const log = createLogger("agent");

// The model decides which tool to call; we execute it and feed the result back.
export type ToolInvoker = (
  name: string,
  args: Record<string, unknown>,
) => Promise<string>;

// Indirection so the loop is unit-testable without hitting the network.
export type AgentChat = (
  messages: ChatMessage[],
  tools: ToolSpec[],
) => Promise<ToolsResult>;

export interface RunAgentInput {
  messages: ChatMessage[];
  tools: ToolSpec[];
  invoke: ToolInvoker;
  chat?: AgentChat; // defaults to the real OpenRouter tool-call path
  maxSteps?: number; // hard cap on round-trips (default 6)
  trace?: TraceSpan; // optional tracing parent (no-op by default)
}
export interface AgentRun {
  text: string; // final assistant answer
  steps: number; // model round-trips taken
  toolCalls: { name: string; args: Record<string, unknown> }[];
  meters: Meter[]; // one per model round-trip (cost trail)
  stopReason: "answered" | "max_steps";
}

/**
 * Minimal tool-using agent loop. Calls the model; if it requests tools, runs
 * them and loops; otherwise returns the answer. Tool execution errors are fed
 * back to the model as tool output (so it can recover) rather than thrown.
 * Bounded by `maxSteps` to guarantee termination.
 */
export async function runAgent({
  messages,
  tools,
  invoke,
  chat = (m, t) => completeWithTools(m, t),
  maxSteps = 6,
  trace = NOOP_SPAN,
}: RunAgentInput): Promise<AgentRun> {
  const history: ChatMessage[] = [...messages];
  const meters: Meter[] = [];
  const toolCalls: AgentRun["toolCalls"] = [];

  for (let step = 1; step <= maxSteps; step++) {
    const stepSpan = trace.child(`step ${step}`);
    const res = await chat(history, tools);
    meters.push(res.meter);
    history.push(res.assistantMessage);
    // Generation span carries model + token + $ cost (metadata only, no content).
    stepSpan.generation("llm", {
      model: res.meter.model,
      tier: res.meter.tier,
      promptTokens: res.meter.promptTokens,
      completionTokens: res.meter.completionTokens,
      totalTokens: res.meter.totalTokens,
      costUsd: res.meter.costUsd,
    });

    if (res.toolCalls.length === 0) {
      stepSpan.end();
      return {
        text: res.text,
        steps: step,
        toolCalls,
        meters,
        stopReason: "answered",
      };
    }

    for (const call of res.toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = call.arguments ? JSON.parse(call.arguments) : {};
      } catch {
        args = {};
      }
      toolCalls.push({ name: call.name, args });
      log.info(`tool ${call.name}`); // metadata only — never log args/results
      const toolSpan = stepSpan.child(`tool:${call.name}`);

      let output: string;
      try {
        output = await invoke(call.name, args);
      } catch (err) {
        output = `tool error: ${err instanceof Error ? err.message : String(err)}`;
      }
      toolSpan.end();
      history.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.name,
        content: output,
      });
    }
    stepSpan.end();
  }

  // Exhausted the step budget without a final answer.
  const lastText = [...history]
    .reverse()
    .find((m) => m.role === "assistant")?.content;
  return {
    text: lastText ?? "",
    steps: maxSteps,
    toolCalls,
    meters,
    stopReason: "max_steps",
  };
}
