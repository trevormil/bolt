import { env, createLogger } from "@vellum/shared";

// LLM access via OpenRouter (OpenAI-compatible endpoint — no SDK needed).
// Cost lever: cheap model by default, escalate to frontier only when the task
// signals complexity. Every call emits a privacy-safe metering record.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const KEY_ENDPOINT = "https://openrouter.ai/api/v1/key";
const log = createLogger("llm");

// OpenRouter rejected the credentials (401/403): the key is missing, invalid, or
// revoked (#85). Typed so a chat surface can tell the user to fix their key in
// Settings rather than bubbling an opaque upstream error up to a 500.
export class LlmAuthError extends Error {
  constructor(public readonly status: number) {
    super(`OpenRouter rejected the API key (${status})`);
    this.name = "LlmAuthError";
  }
}

// Health-check an OpenRouter key (#60). The key-info endpoint is free + fast: it
// returns 200 with the key's limits when valid, 401 when not. Used to block an
// invalid key at onboarding instead of failing silently on the first chat.
// `fetchImpl` is injectable so callers (the web setup route) are testable offline.
export async function verifyOpenRouterKey(
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!key.trim()) return false;
  try {
    const res = await fetchImpl(KEY_ENDPOINT, {
      headers: { Authorization: `Bearer ${key.trim()}` },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok; // 200 = valid; 401/403 = bad key
  } catch {
    return false; // unreachable / timeout → can't confirm, so don't accept it
  }
}

export type Tier = "cheap" | "frontier";
export type Role = "system" | "user" | "assistant" | "tool";

// OpenAI-shaped tool-call as it appears on an assistant message.
export interface ToolCallPart {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
export interface ChatMessage {
  role: Role;
  content: string;
  tool_calls?: ToolCallPart[]; // assistant turns that request tools
  tool_call_id?: string; // role:"tool" — which call this answers
  name?: string; // role:"tool" — tool name (optional, aids debugging)
}

// A tool the model may call. `parameters` is a JSON Schema object.
export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
// A tool call the model decided to make, normalized for the agent loop.
export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // raw JSON string as emitted by the model
}

export interface CompleteOptions {
  tier?: Tier; // explicit override
  model?: string; // explicit model override (bypasses routing)
  complexity?: "low" | "high";
  maxTokens?: number;
  signal?: AbortSignal;
}
export interface Meter {
  model: string;
  tier: Tier;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number; // provider-reported actual cost (OpenRouter usage.cost)
  ms: number;
}
export interface CompleteResult {
  text: string;
  meter: Meter;
}
export interface ToolsResult {
  text: string;
  toolCalls: ToolCall[];
  assistantMessage: ChatMessage; // append verbatim to history before tool results
  meter: Meter;
}

const CONTEXT_ESCALATION_CHARS = 6_000;

/** Decide the tier for a request. Pure + unit-testable. */
export function routeTier(
  messages: ChatMessage[],
  opts: CompleteOptions = {},
): Tier {
  if (opts.tier) return opts.tier;
  if (opts.complexity === "high") return "frontier";
  const chars = messages.reduce((n, m) => n + m.content.length, 0);
  return chars > CONTEXT_ESCALATION_CHARS ? "frontier" : "cheap";
}

function modelFor(tier: Tier, opts: CompleteOptions): string {
  if (opts.model) return opts.model;
  return tier === "frontier" ? env.LLM_MODEL_FRONTIER : env.LLM_MODEL_CHEAP;
}

interface ChatChoiceMessage {
  content?: string | null;
  tool_calls?: ToolCallPart[];
}
interface ChatResponse {
  choices?: { message?: ChatChoiceMessage }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
}

/** POST one chat-completions request, returning the raw message + metering. */
async function callOpenRouter(
  body: Record<string, unknown>,
  tier: Tier,
  model: string,
  opts: CompleteOptions,
): Promise<{ message: ChatChoiceMessage; meter: Meter }> {
  if (!env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not set");
  const start = Date.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      usage: { include: true }, // ask OpenRouter to report actual $ cost
      ...body,
    }),
    signal: opts.signal ?? AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403)
      throw new LlmAuthError(res.status);
    throw new Error(
      `OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  }
  const json = (await res.json()) as ChatResponse;
  const u = json.usage ?? {};
  const meter: Meter = {
    model,
    tier,
    costUsd: u.cost ?? 0,
    promptTokens: u.prompt_tokens ?? 0,
    completionTokens: u.completion_tokens ?? 0,
    totalTokens: u.total_tokens ?? 0,
    ms: Date.now() - start,
  };
  // Metadata only — never log prompt/response content.
  log.info(
    `${tier} · ${model} · ${meter.totalTokens} tok · $${meter.costUsd.toFixed(6)} · ${meter.ms}ms`,
  );
  return { message: json.choices?.[0]?.message ?? {}, meter };
}

/** Route + call OpenRouter; returns the text and a metering record. */
export async function complete(
  messages: ChatMessage[],
  opts: CompleteOptions = {},
): Promise<CompleteResult> {
  const tier = routeTier(messages, opts);
  const model = modelFor(tier, opts);
  const { message, meter } = await callOpenRouter(
    { messages },
    tier,
    model,
    opts,
  );
  return { text: message.content ?? "", meter };
}

/**
 * Tool-aware completion. Exposes `tools` to the model and returns any tool
 * calls it requested alongside the assistant message (to append to history
 * before feeding tool results back). The agent loop drives the round-trips.
 */
export async function completeWithTools(
  messages: ChatMessage[],
  tools: ToolDef[],
  opts: CompleteOptions = {},
): Promise<ToolsResult> {
  const tier = routeTier(messages, opts);
  const model = modelFor(tier, opts);
  const { message, meter } = await callOpenRouter(
    {
      messages,
      tools: tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      tool_choice: "auto",
    },
    tier,
    model,
    opts,
  );
  const text = message.content ?? "";
  const calls = message.tool_calls ?? [];
  return {
    text,
    toolCalls: calls.map((c) => ({
      id: c.id,
      name: c.function.name,
      arguments: c.function.arguments,
    })),
    assistantMessage: {
      role: "assistant",
      content: text,
      ...(calls.length ? { tool_calls: calls } : {}),
    },
    meter,
  };
}
