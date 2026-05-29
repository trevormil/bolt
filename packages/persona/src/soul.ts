import type { SoulIdentity } from "./types.ts";

// The starter PERSONA.md every new persona gets when the user doesn't supply one
// (#91 — go all-in on PERSONA.md). A sensible, editable default so every persona
// has an instructions doc rather than falling back to the legacy role/voice.
export const DEFAULT_PERSONA_INSTRUCTIONS = `# Who you are
A warm, concise personal assistant.

## How to act
- Keep replies short and plain-English.
- Be quiet by default; surface a clear receipt for anything that moves money.
- Always confirm before spending or moving funds.`;

// Soft size ceiling for an always-on PERSONA.md (#93): it rides EVERY request, so
// a very large doc inflates token cost on every turn. Past this, callers warn.
export const PERSONA_MD_WARN_CHARS = 8_000;

/**
 * Render a persona's SOUL into a system-prompt preamble. Deterministic — the
 * orchestrator (0007) prepends this so the persona reasons in-character. Only
 * the persona's own identity is ever rendered; no cross-persona data leaks in.
 */
export function renderSoul(soul: SoulIdentity): string {
  const lines = [`You are ${soul.name}.`];
  // PERSONA.md mode (#87): when a freeform instructions doc is set, IT is the
  // persona's customization (appended verbatim, like a CLAUDE.md) and supersedes
  // the legacy structured role/voice/values. Otherwise render the structured
  // fields as before so existing personas are unchanged.
  if (soul.instructions?.trim()) {
    lines.push("", soul.instructions.trim());
  } else {
    lines.push(`Role: ${soul.role}`, `Voice: ${soul.voice}`);
    if (soul.values?.length) {
      lines.push(`Values: ${soul.values.join("; ")}`);
    }
  }
  lines.push("");
  // Trust posture (#25): the proactivity rule every persona carries. "Quiet by
  // default, loud when it matters" — act within granted limits without
  // narrating, but always surface a plain receipt for anything that moves money
  // or changes state, and only interrupt the human for decisions that need them.
  lines.push(
    "Be quiet by default and loud when it matters: act autonomously within your granted limits without narrating routine steps, but always give a concise plain-English receipt for anything that moves money or changes state, and only interrupt the human for decisions that genuinely need them.",
  );
  return lines.join("\n");
}

/**
 * A persona "personality card" (#25) — the friendly summary shown at creation so
 * the human immediately sees who this persona is and which wallet it owns.
 */
export function renderPersonaCard(
  soul: SoulIdentity,
  address?: string | null,
): string {
  const rows: string[] = [];
  if (soul.instructions?.trim()) {
    rows.push(
      `  Instructions: custom PERSONA.md (${soul.instructions.trim().length} chars)`,
    );
  } else {
    rows.push(`  Role:   ${soul.role}`, `  Voice:  ${soul.voice}`);
    if (soul.values?.length) rows.push(`  Values: ${soul.values.join(", ")}`);
  }
  if (address) rows.push(`  Wallet: ${address}`);
  return [`✦ ${soul.name}`, ...rows].join("\n");
}
