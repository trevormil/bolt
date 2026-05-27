import { env, createLogger } from "@vellum/shared";

// LLM access via OpenRouter (OpenAI-compatible endpoint — no SDK needed).
// Cost lever: cheap model by default, escalate to frontier only when the task
// signals complexity. Every call emits a privacy-safe metering record.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const log = createLogger("llm");

export type Tier = "cheap" | "frontier";
export type Role = "system" | "user" | "assistant";
export interface ChatMessage {
  role: Role;
  content: string;
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
  ms: number;
}
export interface CompleteResult {
  text: string;
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

/** Route + call OpenRouter; returns the text and a metering record. */
export async function complete(
  messages: ChatMessage[],
  opts: CompleteOptions = {},
): Promise<CompleteResult> {
  if (!env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not set");
  const tier = routeTier(messages, opts);
  const model = modelFor(tier, opts);
  const start = Date.now();

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts.maxTokens ?? 1024,
    }),
    signal: opts.signal ?? AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(
      `OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  const u = json.usage ?? {};
  const meter: Meter = {
    model,
    tier,
    promptTokens: u.prompt_tokens ?? 0,
    completionTokens: u.completion_tokens ?? 0,
    totalTokens: u.total_tokens ?? 0,
    ms: Date.now() - start,
  };
  // Metadata only — never log prompt/response content.
  log.info(`${tier} · ${model} · ${meter.totalTokens} tok · ${meter.ms}ms`);
  return { text, meter };
}
