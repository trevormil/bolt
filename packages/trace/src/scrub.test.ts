import { describe, expect, test } from "bun:test";
import { scrubValue, scrubMetadata } from "./trace.ts";

describe("trace scrubbing (#24 T-10)", () => {
  test("redacts bb1 addresses, long hex, and emails in a string", () => {
    const addr = "bb1qg8x9z2k4m6n8p0r2t4v6x8z0a2c4e6g8j0l2n4";
    const hex = "a".repeat(40);
    const out = scrubValue(`pay ${addr} key ${hex} mail a@b.com`);
    expect(out).not.toContain(addr);
    expect(out).not.toContain(hex);
    expect(out).not.toContain("a@b.com");
    expect(out).toContain("[redacted");
  });

  test("scrubMetadata redacts recursively through nested objects + arrays", () => {
    const meta = scrubMetadata({
      tier: "cheap",
      to: "bb1qg8x9z2k4m6n8p0r2t4v6x8z0a2c4e6g8j0l2n4",
      nested: { contact: "alice@example.com", note: "ok" },
      list: ["bb1qg8x9z2k4m6n8p0r2t4v6x8z0a2c4e6g8j0l2n4", "fine"],
    }) as Record<string, unknown>;
    expect(meta.tier).toBe("cheap"); // non-secret left intact
    expect(JSON.stringify(meta)).not.toContain("bb1qg8x9");
    expect(JSON.stringify(meta)).not.toContain("alice@example.com");
    expect((meta.nested as { note: string }).note).toBe("ok");
  });

  test("undefined passes through", () => {
    expect(scrubMetadata(undefined)).toBeUndefined();
  });
});
