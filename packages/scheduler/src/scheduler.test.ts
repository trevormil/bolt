import { beforeEach, describe, expect, test } from "bun:test";
import { generateWallet, type Coin } from "@vellum/chain";
import { createEngine, type Engine } from "@vellum/engine";
import { CheckInScheduler, checkIn, type CheckIn } from "./index.ts";

const DENOM =
  "ibc/F082B65C88E4B6D5EF1DB243CDA1D331D002759E938A0F5CD3FFDC5D53B3E349";
const usdc = (n: number): Coin[] => [{ denom: DENOM, amount: String(n * 1e6) }];

let mnemonic: string;
beforeEach(async () => {
  mnemonic = (await generateWallet()).mnemonic;
});

// Engine with a fixed balance and no live LLM. The default free-form cap is $25.
function engineWith(balanceUsd: number): Engine {
  return createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic,
    runLoop: async () => ({ text: "ok", meters: [] }),
    getBalances: async () => usdc(balanceUsd),
  });
}

async function persona(engine: Engine, id = "p"): Promise<string> {
  engine.store.createPersona(id, "Atlas", {
    name: "Atlas",
    role: "assistant",
    voice: "terse",
  });
  await engine.wallets.ensureWallet(id);
  return id;
}

describe("checkIn", () => {
  test("is quiet when nothing matters", async () => {
    const engine = engineWith(1); // well under the $25 cap, no spend, no tx
    await persona(engine);
    expect(await checkIn(engine, "p")).toBeNull();
  });

  test("nudges when the LLM budget is near its cap", async () => {
    const engine = engineWith(1);
    await persona(engine);
    // Default LLM cap is $1; record $0.90 of spend → 90% ≥ 80% threshold.
    engine.ledger.record({
      personaId: "p",
      kind: "message",
      summary: "big turn",
      authority: "agent",
      costUsd: 0.9,
    });
    const ci = await checkIn(engine, "p");
    expect(ci).not.toBeNull();
    expect(ci!.lines.some((l) => l.includes("LLM spend"))).toBe(true);
  });

  test("nudges when the free-form balance is near the cap", async () => {
    const engine = engineWith(24); // $24 of a $25 cap → $1 headroom ≤ $5
    await persona(engine);
    const ci = await checkIn(engine, "p");
    expect(ci).not.toBeNull();
    expect(ci!.lines.some((l) => l.includes("near the"))).toBe(true);
  });

  test("respects custom thresholds", async () => {
    const engine = engineWith(10); // $15 headroom
    await persona(engine);
    expect(
      await checkIn(engine, "p", { freeformWarnHeadroomUsd: 20 }),
    ).not.toBeNull();
    expect(
      await checkIn(engine, "p", { freeformWarnHeadroomUsd: 5 }),
    ).toBeNull();
  });
});

describe("CheckInScheduler", () => {
  test("runOnce delivers only the non-quiet personas", async () => {
    const engine = engineWith(1);
    await persona(engine, "noisy");
    await persona(engine, "quiet");

    const delivered: string[] = [];
    const scheduler = new CheckInScheduler({
      engine,
      deliver: (id, msg) => {
        delivered.push(`${id}:${msg}`);
      },
      // Inject a check-in fn: "noisy" has a nudge, "quiet" returns null.
      checkInFn: async (_e, id): Promise<CheckIn | null> =>
        id === "noisy" ? { personaId: id, lines: ["something"] } : null,
    });

    const count = await scheduler.runOnce();
    expect(count).toBe(1);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toContain("noisy");
    expect(delivered[0]).toContain("Atlas check-in"); // formatted with soul name
  });

  test("honors an explicit persona list", async () => {
    const engine = engineWith(1);
    await persona(engine, "a");
    await persona(engine, "b");
    const seen: string[] = [];
    const scheduler = new CheckInScheduler({
      engine,
      deliver: () => {},
      listPersonas: () => ["a"],
      checkInFn: async (_e, id) => {
        seen.push(id);
        return null;
      },
    });
    await scheduler.runOnce();
    expect(seen).toEqual(["a"]);
  });
});
