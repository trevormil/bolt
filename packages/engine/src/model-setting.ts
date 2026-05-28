import { z } from "zod";
import { defineSetting } from "@vellum/settings";

/**
 * Per-persona OpenRouter model override (#43). `null` (the default) means the
 * tier router picks (cheap by default, frontier on long context). A non-null
 * value pins every LLM round-trip in the agent loop to that exact OpenRouter
 * model id ("anthropic/claude-3.5-sonnet", "openai/gpt-4o-mini", etc.), so a
 * "Coder" persona can run on a frontier model while an "Errands" persona stays
 * on a cheap one — without touching the global tier env vars.
 */
export const Model = defineSetting<string | null>(
  "model",
  z.string().min(1).nullable(),
  null,
);
