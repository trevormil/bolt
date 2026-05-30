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
    expect(r.principal()).toBe(101); // only the owner is authorized to drive the bot
    r.close();
  });

  test("#109 §2: claimPrincipal — concurrent claimers, exactly one wins", async () => {
    // Hammer the TOFU claim with two simultaneous chats on an empty
    // Recipients. The audit-flagged structural race (read principal, then
    // record) becomes a real race the moment any `await` lands between the
    // two; the atomic claim must make it impossible for both to win.
    const r = new Recipients();
    const [a, b] = await Promise.all([
      Promise.resolve(r.claimPrincipal(101)),
      Promise.resolve(r.claimPrincipal(202)),
    ]);
    // Exactly one isPrincipal: true; both agree on who the principal is.
    expect(a.principal).toBe(b.principal);
    expect([a.isPrincipal, b.isPrincipal].filter(Boolean)).toHaveLength(1);
    const winner = a.isPrincipal ? 101 : 202;
    expect(a.principal).toBe(winner);
    // A subsequent claim by an unrelated chat sees the existing principal
    // and is refused — the slot doesn't re-open on each call.
    const later = r.claimPrincipal(303);
    expect(later.isPrincipal).toBe(false);
    expect(later.principal).toBe(winner);
    r.close();
  });

  test("#109 §2: claimPrincipal is idempotent for the principal", () => {
    // Re-claiming as the same chat id (a re-/start from the owner) keeps
    // them as principal — no flip, no second row, no false rejection.
    const r = new Recipients();
    const first = r.claimPrincipal(101);
    expect(first.isPrincipal).toBe(true);
    const second = r.claimPrincipal(101);
    expect(second.isPrincipal).toBe(true);
    expect(second.principal).toBe(101);
    expect(r.all()).toEqual([101]);
    r.close();
  });
});
