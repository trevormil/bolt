import { describe, expect, test } from "bun:test";
import { Conversations } from "./conversations.ts";

const make = () => new Conversations(":memory:");

describe("Conversations store (#72 chat sessions)", () => {
  test("create + list returns the persona's sessions, newest-active first", () => {
    const c = make();
    const a = c.create("alice", "First");
    const b = c.create("alice", "Second");
    // Touch `a` so it becomes the most-recently-active.
    c.append(a.id, "user", "hi");
    const list = c.list("alice");
    expect(list.map((s) => s.id)).toEqual([a.id, b.id]);
    expect(list.every((s) => s.personaId === "alice")).toBe(true);
  });

  test("the persona wall: list/messages/rename/remove are scoped by persona", () => {
    const c = make();
    const conv = c.create("alice", "Alice chat");
    c.append(conv.id, "user", "secret");
    // Bob can't see Alice's sessions or transcript.
    expect(c.list("bob")).toHaveLength(0);
    expect(c.messages("bob", conv.id)).toHaveLength(0);
    // Bob can't rename or delete Alice's conversation.
    expect(c.rename("bob", conv.id, "hijack")).toBeNull();
    expect(c.remove("bob", conv.id)).toBe(false);
    // Alice's data is intact.
    expect(c.get(conv.id)!.title).toBe("Alice chat");
    expect(c.messages("alice", conv.id)).toHaveLength(1);
  });

  test("append records the transcript in order and bumps updated", () => {
    const c = make();
    const conv = c.create("alice");
    c.append(conv.id, "user", "hello");
    c.append(conv.id, "agent", "hi there");
    const msgs = c.messages("alice", conv.id);
    expect(msgs.map((m) => [m.role, m.text])).toEqual([
      ["user", "hello"],
      ["agent", "hi there"],
    ]);
  });

  test("the first user message auto-titles an unnamed session", () => {
    const c = make();
    const conv = c.create("alice"); // default title "New chat"
    expect(conv.title).toBe("New chat");
    c.append(conv.id, "user", "What's my USDC balance right now?");
    expect(c.get(conv.id)!.title).toBe("What's my USDC balance right now?");
    // A later user message does NOT overwrite the established title.
    c.append(conv.id, "user", "and send 5 to bob");
    expect(c.get(conv.id)!.title).toBe("What's my USDC balance right now?");
  });

  test("a long first message is truncated for the title", () => {
    const c = make();
    const conv = c.create("alice");
    c.append(conv.id, "user", "x".repeat(80));
    const title = c.get(conv.id)!.title;
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(51);
  });

  test("ensure binds an explicit id once and refuses cross-persona rebind", () => {
    const c = make();
    const first = c.ensure("web:fixed", "alice");
    expect(first.personaId).toBe("alice");
    // Same id + same persona → returns the existing row (idempotent).
    expect(c.ensure("web:fixed", "alice").id).toBe("web:fixed");
    // Same id + a DIFFERENT persona → wall violation.
    expect(() => c.ensure("web:fixed", "bob")).toThrow(/another persona/);
  });

  test("remove deletes the session and its transcript", () => {
    const c = make();
    const conv = c.create("alice");
    c.append(conv.id, "user", "hi");
    expect(c.remove("alice", conv.id)).toBe(true);
    expect(c.get(conv.id)).toBeNull();
    expect(c.messages("alice", conv.id)).toHaveLength(0);
  });

  test("rename updates the title (scoped to the owner)", () => {
    const c = make();
    const conv = c.create("alice", "Old");
    const renamed = c.rename("alice", conv.id, "New name");
    expect(renamed!.title).toBe("New name");
    expect(c.get(conv.id)!.title).toBe("New name");
  });
});
