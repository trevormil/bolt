import type { ToolDef } from "@vellum/llm";

// A tool the agent can offer to the model. Shape matches @vellum/llm's ToolDef
// (name + description + JSON-Schema params), so specs pass straight through.
export type ToolSpec = ToolDef;

const WORD = /[a-z0-9]+/g;
const STOP = new Set([
  "the",
  "a",
  "an",
  "to",
  "of",
  "and",
  "or",
  "is",
  "are",
  "my",
  "me",
  "i",
  "you",
  "for",
  "with",
  "what",
  "whats",
  "how",
  "do",
  "can",
  "please",
]);

function terms(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.toLowerCase().matchAll(WORD)) {
    if (!STOP.has(m[0]) && m[0].length > 1) out.add(m[0]);
  }
  return out;
}

/**
 * Selective tool loading: keep only the tools most relevant to `query` in the
 * model's context (cost lever — fewer tokens, sharper choices). Scores each
 * tool by keyword overlap of the query against its name + description; ties
 * and zero-overlap tools keep their original order so the result is stable.
 * Returns at most `max` tools. With no query terms, returns the first `max`.
 */
export function selectTools(
  tools: ToolSpec[],
  query: string,
  max = 8,
): ToolSpec[] {
  if (tools.length <= max) return tools;
  const q = terms(query);
  if (q.size === 0) return tools.slice(0, max);

  const scored = tools.map((t, i) => {
    const hay = terms(`${t.name} ${t.description}`);
    let score = 0;
    for (const term of q) if (hay.has(term)) score++;
    return { t, i, score };
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, max).map((s) => s.t);
}
