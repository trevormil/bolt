import { env, createLogger } from "@vellum/shared";
import type { Embedder } from "./types.ts";

const log = createLogger("embed");

function l2normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < v.length; i++) v[i]! /= norm;
  return v;
}

/**
 * Deterministic, network-free embedder: hashes word tokens into `dim` buckets
 * (signed) and L2-normalizes. Lexical, not semantic — used in tests and as the
 * offline fallback so retrieval still has a dense signal without an API key.
 */
export function hashEmbedder(dim = 256): Embedder {
  return {
    dim,
    async embed(texts) {
      return texts.map((text) => {
        const v = new Float32Array(dim);
        for (const m of text.toLowerCase().matchAll(/[a-z0-9]+/g)) {
          let h = 2166136261;
          for (let i = 0; i < m[0].length; i++) {
            h = (h ^ m[0].charCodeAt(i)) >>> 0;
            h = (h * 16777619) >>> 0;
          }
          const bucket = h % dim;
          const sign = (h >>> 31) & 1 ? -1 : 1;
          v[bucket]! += sign;
        }
        return l2normalize(v);
      });
    },
  };
}

const OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings";

/**
 * OpenAI `text-embedding-3-small` embedder (1536-dim). Requires OPENAI_API_KEY.
 * Returns null if no key is configured so callers can degrade to BM25-only.
 */
export function openAiEmbedder(
  model = "text-embedding-3-small",
): Embedder | null {
  if (!env.OPENAI_API_KEY) {
    log.warn("OPENAI_API_KEY not set — dense retrieval disabled (BM25 only)");
    return null;
  }
  return {
    dim: 1536,
    async embed(texts) {
      const res = await fetch(OPENAI_EMBED_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model, input: texts }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        throw new Error(
          `OpenAI embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`,
        );
      }
      const json = (await res.json()) as {
        data?: { embedding: number[] }[];
      };
      return (json.data ?? []).map((d) =>
        l2normalize(Float32Array.from(d.embedding)),
      );
    },
  };
}
