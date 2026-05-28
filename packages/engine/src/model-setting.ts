import { z } from "zod";
import { env } from "@vellum/shared";
import { defineSetting } from "@vellum/settings";

/**
 * Per-persona OpenRouter model override (#43). `null` (the default) means the
 * tier router picks (cheap by default, frontier on long context). A non-null
 * value pins every LLM round-trip in the agent loop to that exact OpenRouter
 * model id, so a "Coder" persona can run on a frontier model while an "Errands"
 * persona stays on a cheap one — without touching the global tier env vars.
 */
export const Model = defineSetting<string | null>(
  "model",
  z.string().min(1).nullable(),
  null,
);

/** The allowlist of "approved" models (#43) a persona may be pinned to.
 *  Configured via env.VELLUM_APPROVED_MODELS (comma-separated). */
export const APPROVED_MODELS: readonly string[] =
  env.VELLUM_APPROVED_MODELS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** A model is settable iff it's on the approved allowlist (null = inherit). */
export function isApprovedModel(model: string): boolean {
  return APPROVED_MODELS.includes(model);
}
