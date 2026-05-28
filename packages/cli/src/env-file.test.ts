import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { upsertEnvFile } from "./env-file.ts";

function tmpEnv(initial?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "vellum-env-"));
  const path = join(dir, ".env");
  if (initial !== undefined) writeFileSync(path, initial);
  return path;
}

describe("upsertEnvFile (#19)", () => {
  test("creates the file when absent and quotes values with spaces", () => {
    const path = tmpEnv();
    const changed = upsertEnvFile(path, {
      OPENROUTER_API_KEY: "sk-or-abc",
      AGENT_SIGNER_MNEMONIC: "word one two three",
    });
    expect(changed.sort()).toEqual([
      "AGENT_SIGNER_MNEMONIC",
      "OPENROUTER_API_KEY",
    ]);
    const text = readFileSync(path, "utf8");
    expect(text).toContain("OPENROUTER_API_KEY=sk-or-abc");
    expect(text).toContain('AGENT_SIGNER_MNEMONIC="word one two three"');
  });

  test("rewrites an existing key in place and preserves comments + order", () => {
    const path = tmpEnv("# secrets\nOPENROUTER_API_KEY=old\nWEB_PORT=8787\n");
    upsertEnvFile(path, { OPENROUTER_API_KEY: "new" });
    const lines = readFileSync(path, "utf8").trimEnd().split("\n");
    expect(lines[0]).toBe("# secrets");
    expect(lines[1]).toBe("OPENROUTER_API_KEY=new");
    expect(lines[2]).toBe("WEB_PORT=8787");
  });

  test("appends new keys after existing content", () => {
    const path = tmpEnv("WEB_PORT=8787\n");
    upsertEnvFile(path, { VELLUM_API_TOKEN: "tok123" });
    const text = readFileSync(path, "utf8");
    expect(text).toContain("WEB_PORT=8787");
    expect(text).toContain("VELLUM_API_TOKEN=tok123");
  });

  test("is idempotent — re-applying the same value leaves one line", () => {
    const path = tmpEnv();
    upsertEnvFile(path, { AGENT_SIGNER_MNEMONIC: "a b c" });
    upsertEnvFile(path, { AGENT_SIGNER_MNEMONIC: "a b c" });
    const occurrences = readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l.startsWith("AGENT_SIGNER_MNEMONIC=")).length;
    expect(occurrences).toBe(1);
  });
});
