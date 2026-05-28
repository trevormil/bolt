import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dataPath } from "@vellum/shared";

// Per-persona markdown directory (#41), filesystem-first under ~/.vellum:
//   ~/.vellum/PERSONA.md                       — global, applies to ALL personas
//   ~/.vellum/personas/<id>/PERSONA.md         — this persona's always-on steering
//   ~/.vellum/personas/<id>/*.md (other)       — referenceable docs/skills (on demand)
//
// PERSONA.md is the OpenClaw/CLAUDE.md-style steering layer the user edits on
// disk; it's appended to EVERY request for that persona (after the system
// prompt). The other .md files are NOT auto-injected — they're loadable on
// demand (a future skill/memory tool).

/** Path to a persona's markdown directory (does not create it). */
export function personaDir(personaId: string): string {
  return dataPath("personas", personaId);
}

/**
 * The always-on markdown for a persona, composed in order: the global
 * `PERSONA.md` (if any) then the persona's own `PERSONA.md` (if any). Read fresh
 * each call so on-disk edits take effect next turn. Returns "" when neither
 * exists — a no-op for the system context.
 */
export function readPersonaMarkdown(personaId: string): string {
  const parts: string[] = [];
  for (const file of [dataPath("PERSONA.md"), personaDirFile(personaId)]) {
    if (existsSync(file)) {
      const text = readFileSync(file, "utf8").trim();
      if (text) parts.push(text);
    }
  }
  return parts.join("\n\n");
}

/** The other (non-PERSONA.md) markdown docs in a persona's dir — referenceable
 *  on demand, not auto-injected. Names only; callers read them when relevant. */
export function listPersonaDocs(personaId: string): string[] {
  const dir = personaDir(personaId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "PERSONA.md")
    .sort();
}

function personaDirFile(personaId: string): string {
  return dataPath("personas", personaId, "PERSONA.md");
}
