// Public surface of @vellum/llm.
export {
  complete,
  completeWithTools,
  routeTier,
  verifyOpenRouterKey,
  LlmAuthError,
  type Tier,
  type Role,
  type ChatMessage,
  type ToolDef,
  type ToolCall,
  type ToolCallPart,
  type CompleteOptions,
  type CompleteResult,
  type ToolsResult,
  type Meter,
} from "./router.ts";

if (import.meta.main) {
  const { createLogger, env } = await import("@vellum/shared");
  createLogger("llm").info(
    `ready · cheap=${env.LLM_MODEL_CHEAP} · frontier=${env.LLM_MODEL_FRONTIER}` +
      (env.OPENROUTER_API_KEY ? "" : " · (no OPENROUTER_API_KEY set)"),
  );
}
