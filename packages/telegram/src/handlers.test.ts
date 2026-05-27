import { describe, expect, test } from "bun:test";
import { createEngine } from "@vellum/engine";
import { env } from "@vellum/shared";
import {
  onBalance,
  onLedger,
  onStart,
  onText,
  type BotCtx,
} from "./handlers.ts";

// Hardhat's standard BIP-39 test mnemonic — hermetic (no env / network).
const TEST_MNEMONIC =
  "test test test test test test test test test test test junk";

function engineWithFakes() {
  return createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic: TEST_MNEMONIC,
    runLoop: async ({ persona }) => ({
      text: `Hi, I'm ${persona.name}.`,
      meters: [
        {
          model: "m",
          tier: "cheap",
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 42,
          costUsd: 0.0003,
          ms: 0,
        },
      ],
    }),
    getBalances: async () => [{ denom: env.VELLUM_DENOM, amount: "7500000" }],
  });
}

function ctx(text?: string) {
  const replies: string[] = [];
  const c: BotCtx = {
    chat: { id: 1 },
    message: text ? { text } : undefined,
    reply: async (t: string) => {
      replies.push(t);
      return {};
    },
  };
  return { c, replies };
}

describe("telegram handlers (engine-wired)", () => {
  test("onText routes through the agent + appends a cost receipt", async () => {
    const engine = engineWithFakes();
    const { c, replies } = ctx("what can you do?");
    await onText(c, engine);
    expect(replies[0]).toContain("Hi, I'm Vellum.");
    expect(replies[0]).toContain("tok"); // cost footer
  });

  test("/start greets and ensures the assistant persona + wallet", async () => {
    const engine = engineWithFakes();
    const { c, replies } = ctx();
    await onStart(c, engine);
    expect(replies[0]).toContain("Vellum online");
    expect(engine.store.getPersona("assistant")).not.toBeNull();
    expect(engine.wallets.addressFor("assistant")).toMatch(/^bb1/);
  });

  test("/balance shows the USDC balance", async () => {
    const engine = engineWithFakes();
    const { c, replies } = ctx();
    await onBalance(c, engine);
    expect(replies[0]).toContain("7.50 USDC");
  });

  test("/ledger summarizes proof-of-action", async () => {
    const engine = engineWithFakes();
    await onText(ctx("hi").c, engine); // produce a ledger entry
    const { c, replies } = ctx();
    await onLedger(c, engine);
    expect(replies[0]).toContain("Ledger");
    expect(replies[0]).toMatch(/\d+ actions/);
  });
});
