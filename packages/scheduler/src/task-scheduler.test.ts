import { beforeEach, describe, expect, test } from "bun:test";
import { generateWallet } from "@vellum/chain";
import { createEngine, type Engine } from "@vellum/engine";
import { TaskScheduler } from "./index.ts";

let mnemonic: string;
beforeEach(async () => {
  mnemonic = (await generateWallet()).mnemonic;
});
function engineWith(reply: string): Engine {
  return createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic,
    runLoop: async () => ({ text: reply, meters: [] }),
  });
}

describe("TaskScheduler.runDue (#36)", () => {
  test("runs due tasks through the engine, delivers, and advances nextRun", async () => {
    const engine = engineWith("digest: all quiet");
    engine.store.createPersona("p", "Atlas", {
      name: "Atlas",
      role: "assistant",
      voice: "terse",
    });
    await engine.wallets.ensureWallet("p");
    const t = engine.tasks.create({
      personaId: "p",
      prompt: "summarize",
      intervalMs: 1000,
      now: 0,
    });

    const delivered: string[] = [];
    const sched = new TaskScheduler({
      engine,
      deliver: (_id, msg) => {
        delivered.push(msg);
      },
    });

    expect(await sched.runDue(500)).toBe(0); // not due yet
    expect(await sched.runDue(1000)).toBe(1); // due → runs
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toContain("digest: all quiet");
    expect(engine.tasks.get(t.id)!.nextRun).toBe(2000); // advanced
    expect(await sched.runDue(1000)).toBe(0); // not due again until 2000
  });

  test("a failing task still advances (no hot-loop) and doesn't block others", async () => {
    // No persona for the task → engine.chat throws (unknown persona); runDue must
    // swallow, advance nextRun, and keep going.
    const engine = engineWith("ok");
    const t = engine.tasks.create({
      personaId: "ghost",
      prompt: "x",
      intervalMs: 1000,
      now: 0,
    });
    const sched = new TaskScheduler({ engine, deliver: () => {} });
    expect(await sched.runDue(1000)).toBe(1); // counted as attempted
    expect(engine.tasks.get(t.id)!.nextRun).toBe(2000); // advanced despite failure
  });

  test("emits a task_run event on success (ok) with the task metadata (#42)", async () => {
    const engine = engineWith("digest");
    engine.store.createPersona("p", "Atlas", {
      name: "Atlas",
      role: "assistant",
      voice: "terse",
    });
    await engine.wallets.ensureWallet("p");
    const t = engine.tasks.create({
      personaId: "p",
      prompt: "summarize the day",
      intervalMs: 1000,
      now: 0,
      armed: true,
    });
    await new TaskScheduler({ engine, deliver: () => {} }).runDue(1000);
    const ev = engine.events.recent("p").find((x) => x.kind === "task_run");
    expect(ev).toBeTruthy();
    expect(ev!.ok).toBe(true);
    expect(ev!.meta).toMatchObject({ taskId: t.id, armed: true });
  });

  test("emits a task_run event on failure (ok=false) (#42)", async () => {
    const engine = engineWith("ok");
    const t = engine.tasks.create({
      personaId: "ghost", // unknown persona → chat throws
      prompt: "x",
      intervalMs: 1000,
      now: 0,
    });
    await new TaskScheduler({ engine, deliver: () => {} }).runDue(1000);
    const ev = engine.events.recent("ghost").find((x) => x.kind === "task_run");
    expect(ev).toBeTruthy();
    expect(ev!.ok).toBe(false);
    expect(ev!.meta).toMatchObject({ taskId: t.id });
  });
});
