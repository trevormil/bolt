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
  const rows = [`  Role:   ${soul.role}`, `  Voice:  ${soul.voice}`];
  if (soul.values?.length) rows.push(`  Values: ${soul.values.join(", ")}`);
  if (address) rows.push(`  Wallet: ${address}`);
  return [`✦ ${soul.name}`, ...rows].join("\n");
}
