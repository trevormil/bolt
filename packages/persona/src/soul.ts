import type { SoulIdentity } from "./types.ts";

/**
 * Render a persona's SOUL into a system-prompt preamble. Deterministic — the
 * orchestrator (0007) prepends this so the persona reasons in-character. Only
 * the persona's own identity is ever rendered; no cross-persona data leaks in.
 */
export function renderSoul(soul: SoulIdentity): string {
  const lines = [
    `You are ${soul.name}.`,
    `Role: ${soul.role}`,
    `Voice: ${soul.voice}`,
  ];
  if (soul.values?.length) {
    lines.push(`Values: ${soul.values.join("; ")}`);
  }
  return lines.join("\n");
}
