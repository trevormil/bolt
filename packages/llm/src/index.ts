// Public surface of @vellum/llm.
export {
  complete,
  routeTier,
  type Tier,
  type Role,
  type ChatMessage,
  type CompleteOptions,
  type CompleteResult,
  type Meter,
} from "./router.ts";

if (import.meta.main) {
  const { createLogger, env } = await import("@vellum/shared");
  createLogger("llm").info(
    `ready · cheap=${env.LLM_MODEL_CHEAP} · frontier=${env.LLM_MODEL_FRONTIER}` +
      (env.OPENROUTER_API_KEY ? "" : " · (no OPENROUTER_API_KEY set)"),
  );
}
