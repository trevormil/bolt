// Public surface of @vellum/persona: the compartment core — personas with
// hard-walled memory + hybrid retrieval, a thin global layer, and SOUL identity.
export { PersonaStore } from "./store.ts";
export { renderSoul } from "./soul.ts";
export { hashEmbedder, openAiEmbedder } from "./embedder.ts";
export type {
  Persona,
  SoulIdentity,
  MemoryRecord,
  RetrievalHit,
  Embedder,
} from "./types.ts";

if (import.meta.main) {
  const { createLogger } = await import("@vellum/shared");
  createLogger("persona").info(
    "ready · hard-walled memory · hybrid BM25+dense retrieval · SOUL identity",
  );
}
