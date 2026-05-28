import { describe, expect, test } from "bun:test";
import { Recipients } from "./recipients.ts";

describe("Recipients", () => {
  test("records chat ids and dedupes", () => {
    const r = new Recipients();
    r.record(101);
    r.record(101); // duplicate — ignored
    r.record(202);
    expect(r.all().sort((a, b) => a - b)).toEqual([101, 202]);
    r.close();
  });

  test("starts empty", () => {
    const r = new Recipients();
    expect(r.all()).toEqual([]);
    expect(r.principal()).toBeNull();
    r.close();
  });

  test("principal is the first chat seen (owner), not later ones", () => {
    const r = new Recipients();
    r.record(101); // owner
    r.record(202); // a stranger who later /starts the bot
    expect(r.principal()).toBe(101); // proactive output targets the owner only
    r.close();
  });
});
