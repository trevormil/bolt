import { describe, expect, test } from "bun:test";
import { generateWallet } from "@vellum/chain";
import {
  BudgetLimits,
  BudgetLimitsSchema,
  evaluateBudget,
  createEngine,
} from "./index.ts";

async function eng() {
  const m = (await generateWallet()).mnemonic;
  return createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic: m,
    runLoop: async () => ({ text: "", meters: [] }),
  });
}

const DAY = 86_400_000;

// Synthesize a spend at a specific timestamp by hand-inserting into the ledger
// table — the engine ledger has no time-shifting public surface for testing.
// evaluateBudget is time-windowed; the public ledger.record() stamps Date.now()
// and there's no back-date seam, so the tests insert directly with the same
// schema the ledger module declares. Justified scope: this is the only way to
// exercise multi-window accounting without making time injectable in production.
function spend(
  engine: Awaited<ReturnType<typeof eng>>,
  costUsd: number,
  ts: number,
) {
  const db = (
    engine.ledger as unknown as {
      db: { run: (sql: string, ...args: unknown[]) => void };
    }
  ).db;
  db.run(
    `INSERT INTO ledger (persona_id, ts, kind, summary, authority, cost_usd, tokens, meta) VALUES (?, ?, 'llm', 'test', 'system', ?, 0, '{}')`,
    "p",
    ts,
    costUsd,
  );
}

describe("BudgetLimits (#44) — per-window cost guardrails", () => {
  test("schema rejects negative + non-strict shapes", () => {
    expect(BudgetLimitsSchema.safeParse({ dailyUsd: -1 }).success).toBe(false);
    expect(BudgetLimitsSchema.safeParse({ dailyUsd: 0 }).success).toBe(false);
    expect(BudgetLimitsSchema.safeParse({ stray: 1 }).success).toBe(false);
    expect(BudgetLimitsSchema.safeParse({}).success).toBe(true);
    expect(
      BudgetLimitsSchema.safeParse({ dailyUsd: 1, weeklyUsd: 5 }).success,
    ).toBe(true);
  });

  test("a persona with no override inherits the global default (daily-only)", async () => {
    const e = await eng();
    // No spend; the default daily cap (env VELLUM_LLM_BUDGET_USD) applies.
    const ev = evaluateBudget(e, "p");
    expect(ev.ok).toBe(true);
    expect(ev.windows.daily).toBeDefined();
    expect(ev.windows.weekly).toBeUndefined();
    expect(ev.windows.monthly).toBeUndefined();
  });

  test("multiple windows: breaches the tightest (daily) first", async () => {
    const e = await eng();
    BudgetLimits.setPersona(e.settings, "p", {
      dailyUsd: 1,
      weeklyUsd: 10,
      monthlyUsd: 100,
    });
    spend(e, 1.5, Date.now() - 1_000); // within last 24h → breaches daily
    const ev = evaluateBudget(e, "p");
    expect(ev.ok).toBe(false);
    expect(ev.breached).toBe("daily");
    expect(ev.windows.daily!.ok).toBe(false);
    expect(ev.windows.weekly!.ok).toBe(true);
  });

  test("a spend outside the daily window still hits the weekly cap", async () => {
    const e = await eng();
    BudgetLimits.setPersona(e.settings, "p", { dailyUsd: 10, weeklyUsd: 5 });
    spend(e, 7, Date.now() - 3 * DAY); // outside daily 24h, inside weekly 7d
    const ev = evaluateBudget(e, "p");
    expect(ev.windows.daily!.spentUsd).toBe(0);
    expect(ev.windows.daily!.ok).toBe(true);
    expect(ev.windows.weekly!.spentUsd).toBe(7);
    expect(ev.windows.weekly!.ok).toBe(false);
    expect(ev.breached).toBe("weekly");
  });

  test("PUT {} resets a persona to inherit", async () => {
    const e = await eng();
    BudgetLimits.setPersona(e.settings, "p", { dailyUsd: 5 });
    expect(BudgetLimits.get(e.settings, "p").source).toBe("persona");
    BudgetLimits.reset(e.settings, "p");
    expect(BudgetLimits.get(e.settings, "p").source).toBe("default");
  });
});
