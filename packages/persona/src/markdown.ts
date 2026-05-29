import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dataPath } from "@vellum/shared";

// Persona markdown, filesystem-first under ~/.vellum (#41), reconciled with the
// DB-stored PERSONA.md (#87, #93):
//   ~/.vellum/PERSONA.md            — GLOBAL, applies to ALL personas (always-on)
//   ~/.vellum/personas/<id>/*.md    — referenceable docs/skills (on demand, not injected)
//
// CANONICAL MODEL (#93): the per-persona PERSONA.md is the DB `soul.instructions`
// (web/CLI-editable, rendered by renderSoul). This file layer no longer carries a
// per-persona always-on doc — that was a second source of truth that double-
// injected with renderSoul. What remains here is the GLOBAL cross-persona steering
// (one file) plus referenceable on-demand docs (`listPersonaDocs`, NOT auto-injected).

/** Path to a persona's markdown directory (does not create it). */
export function personaDir(personaId: string): string {
  return dataPath("personas", personaId);
}

/**
 * The GLOBAL always-on markdown applied to EVERY persona — `~/.vellum/PERSONA.md`.
 * Read fresh each call so on-disk edits take effect next turn; "" when absent.
 * Per-persona steering is the DB `soul.instructions` (#87), rendered separately by
 * renderSoul — deliberately NOT read here, so there's a single per-persona source
 * (#93). The `personaId` arg is accepted (the orchestrator's injectable seam passes
 * it) but the global layer is persona-independent.
 */
export function readPersonaMarkdown(_personaId: string): string {
  const file = dataPath("PERSONA.md");
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf8").trim();
}

/** The (non-PERSONA.md) markdown docs in a persona's dir — referenceable on
 *  demand, NOT auto-injected. Names only; an on-demand read tool loads them when
 *  relevant (#41/#93 follow-on). */
export function listPersonaDocs(personaId: string): string[] {
  const dir = personaDir(personaId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "PERSONA.md")
    .sort();
}
