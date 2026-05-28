import { existsSync, readFileSync, writeFileSync } from "node:fs";

// Minimal .env reader/writer for the install wizard (#19). The wizard persists
// secrets (OpenRouter key, agent mnemonic, optional API token) to the repo .env
// — the same file Bun auto-loads at startup — so a fresh process picks them up.
// We only need set/merge semantics, not a full dotenv parser.

/** Does `value` need double-quoting to round-trip through Bun's .env loader? */
function needsQuote(value: string): boolean {
  return /[\s#"'=]/.test(value) || value === "";
}

function formatValue(value: string): string {
  if (!needsQuote(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Merge `updates` into the .env file at `path`, preserving existing lines,
 * comments, and order. An existing `KEY=…` line is rewritten in place; a new key
 * is appended. The file is created if absent. Returns the keys that changed.
 */
export function upsertEnvFile(
  path: string,
  updates: Record<string, string>,
): string[] {
  const lines = existsSync(path) ? readFileSync(path, "utf8").split("\n") : [];
  const remaining = new Map(Object.entries(updates));

  const out = lines.map((line) => {
    const m = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    if (!m) return line; // comment / blank / non-assignment — leave untouched
    const key = m[2]!;
    if (!remaining.has(key)) return line;
    const value = remaining.get(key)!;
    remaining.delete(key);
    return `${key}=${formatValue(value)}`;
  });

  // Append any keys that weren't already present.
  if (remaining.size) {
    if (out.length && out[out.length - 1]!.trim() !== "") out.push("");
    for (const [key, value] of remaining)
      out.push(`${key}=${formatValue(value)}`);
  }

  let text = out.join("\n");
  if (!text.endsWith("\n")) text += "\n";
  writeFileSync(path, text, { mode: 0o600 }); // secrets — owner-only
  return Object.keys(updates);
}
