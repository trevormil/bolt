import { beforeEach, describe, expect, test } from "bun:test";
import { generateWallet } from "@vellum/chain";
import type { Approver } from "@vellum/capabilities";
import {
  createEngine,
  scheduleTools,
  TaskStore,
  type Engine,
} from "./index.ts";

describe("TaskStore (#36)", () => {
  test("create sets nextRun; due() and markRan() advance correctly", () => {
    const s = new TaskStore(":memory:");
    const t = s.create({
      personaId: "p",
      prompt: "check news",
      intervalMs: 1000,
      now: 0,
    });
    expect(t.nextRun).toBe(1000);
    expect(s.due(500)).toHaveLength(0); // not yet due
    expect(s.due(1000).map((x) => x.id)).toEqual([t.id]); // due
    s.markRan(t.id, 1000);
    expect(s.get(t.id)!.nextRun).toBe(2000); // advanced one interval
    expect(s.due(1000)).toHaveLength(0);
    s.close();
  });

  test("pause excludes from due; delete removes; per-persona list; persists", () => {
    const path = `/tmp/vellum-tasks-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    let s = new TaskStore(path);
    const t = s.create({
      personaId: "a",
      prompt: "x",
      intervalMs: 100,
      now: 0,
    });
    s.create({ personaId: "b", prompt: "y", intervalMs: 100, now: 0 });
    expect(s.list("a")).toHaveLength(1);
    s.setEnabled(t.id, false);
    expect(s.due(10_000).some((x) => x.id === t.id)).toBe(false);
    s.close();
    // survives restart
    s = new TaskStore(path);
    expect(s.list().length).toBe(2);
    s.delete(t.id);
    expect(s.list("a")).toHaveLength(0);
    s.close();
  });
});

describe("scheduleTools (#36) — gated by 'schedule'", () => {
  let mnemonic: string;
  beforeEach(async () => {
    mnemonic = (await generateWallet()).mnemonic;
  });
  const eng = (approve?: Approver): Engine =>
    createEngine({
      dbPath: ":memory:",
      embedder: null,
      mnemonic,
      runLoop: async () => ({ text: "", meters: [] }),
      approve,
    });

  test("create_task denied without the 'schedule' grant (fail-closed)", async () => {
    const e = eng();
    const out = await scheduleTools(e, "p").invoke("create_task", {
      prompt: "daily digest",
      everyMinutes: 60,
    });
    expect(out).toContain("Denied");
    expect(e.tasks.list("p")).toHaveLength(0);
  });

  test("create_task works with a standing grant; list + cancel", async () => {
    const e = eng();
    e.capabilities.grant({
      personaId: "p",
      capability: "schedule",
      scope: null,
      mode: "allow",
    });
    const { invoke } = scheduleTools(e, "p");
    const created = await invoke("create_task", {
      prompt: "daily digest",
      everyMinutes: 60,
    });
    expect(created).toContain("Scheduled task");
    expect(e.tasks.list("p")).toHaveLength(1);
    const id = e.tasks.list("p")[0]!.id;
    expect(await invoke("list_tasks", {})).toContain("daily digest");
    expect(await invoke("cancel_task", { id: id.slice(0, 8) })).toContain(
      "Cancelled",
    );
    expect(e.tasks.list("p")).toHaveLength(0);
  });
});
