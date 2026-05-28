import { describe, expect, test } from "bun:test";
import { createEngine } from "@vellum/engine";
import type { TxChain } from "@vellum/tx";
import { env } from "@vellum/shared";
import {
  onBalance,
  onLedger,
  onNew,
  onPersonas,
  onSpend,
  onStart,
  onSwitch,
  onText,
  onVaults,
  type BotCtx,
} from "./handlers.ts";
import { Sessions } from "./sessions.ts";

// Hardhat's standard BIP-39 test mnemonic — hermetic (no env / network).
const TEST_MNEMONIC =
  "test test test test test test test test test test test junk";

// Fully offline tx chain: funded in USDC, deterministic spend hash, confirms.
// Lets /spend exercise the real TxManager chokepoint without a live chain.
const fakeTxChain: TxChain = {
  getBalances: async () => [{ denom: env.VELLUM_DENOM, amount: "10000000" }],
  signAndBroadcast: async () => "SPENDHASH",
  confirmTx: async () => ({ height: 5, code: 0 }),
};

function engineWithFakes() {
  return createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic: TEST_MNEMONIC,
    txChain: fakeTxChain,
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

function ctx(text?: string, chatId = 1) {
  const replies: string[] = [];
  const c: BotCtx = {
    chat: { id: chatId },
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
    await onText(c, engine, new Sessions());
    expect(replies[0]).toContain("Hi, I'm Bolt.");
    expect(replies[0]).toContain("tok"); // cost footer
  });

  test("/start greets and ensures the default persona + wallet", async () => {
    const engine = engineWithFakes();
    const { c, replies } = ctx();
    await onStart(c, engine, new Sessions());
    expect(replies[0]).toContain("Bolt online");
    expect(engine.store.getPersona("assistant")).not.toBeNull();
    expect(engine.wallets.addressFor("assistant")).toMatch(/^bb1/);
  });

  test("/balance shows the USDC balance", async () => {
    const engine = engineWithFakes();
    const { c, replies } = ctx();
    await onBalance(c, engine, new Sessions());
    expect(replies[0]).toContain("7.50 USDC");
  });

  test("/ledger summarizes proof-of-action", async () => {
    const engine = engineWithFakes();
    const session = new Sessions();
    await onText(ctx("hi").c, engine, session); // produce a ledger entry
    const { c, replies } = ctx();
    await onLedger(c, engine, session);
    expect(replies[0]).toContain("Ledger");
    expect(replies[0]).toMatch(/\d+ actions/);
  });
});

describe("per-chat persona routing (#49)", () => {
  test("/new creates a persona (+ wallet) and switches the chat to it", async () => {
    const engine = engineWithFakes();
    const session = new Sessions();
    const { c, replies } = ctx(undefined, 5);
    await onNew(c, engine, session, "Travel Agent");
    expect(replies[0]).toContain("travel-agent");
    expect(engine.store.getPersona("travel-agent")).not.toBeNull();
    expect(engine.wallets.addressFor("travel-agent")).toMatch(/^bb1/);
    // The chat is now pinned to the new persona.
    expect(session.activePersona(5)).toBe("travel-agent");
  });

  test("/new refuses a duplicate persona id", async () => {
    const engine = engineWithFakes();
    const session = new Sessions();
    await onNew(ctx(undefined, 5).c, engine, session, "Atlas");
    const { c, replies } = ctx(undefined, 5);
    await onNew(c, engine, session, "Atlas");
    expect(replies[0]).toContain("already exists");
  });

  test("/switch changes only the calling chat's active persona (isolation)", async () => {
    const engine = engineWithFakes();
    const session = new Sessions();
    // Two distinct personas exist.
    await onNew(ctx(undefined, 1).c, engine, session, "Atlas");
    await onNew(ctx(undefined, 2).c, engine, session, "Nova");
    // Chat 1 switches to atlas; chat 2 to nova. Each is independent.
    await onSwitch(ctx(undefined, 1).c, engine, session, "atlas");
    await onSwitch(ctx(undefined, 2).c, engine, session, "nova");
    expect(session.activePersona(1)).toBe("atlas");
    expect(session.activePersona(2)).toBe("nova");
  });

  test("/switch to an unknown persona is rejected and leaves the selection unchanged", async () => {
    const engine = engineWithFakes();
    const session = new Sessions();
    await onNew(ctx(undefined, 1).c, engine, session, "Atlas");
    const { c, replies } = ctx(undefined, 1);
    await onSwitch(c, engine, session, "ghost");
    expect(replies[0]).toContain("Unknown persona");
    expect(session.activePersona(1)).toBe("atlas"); // unchanged
  });

  test("onText for a switched chat routes to the switched persona", async () => {
    const engine = engineWithFakes();
    const session = new Sessions();
    await onNew(ctx(undefined, 7).c, engine, session, "Nova");
    const { c, replies } = ctx("hello", 7);
    await onText(c, engine, session);
    // The runLoop echoes the persona name → confirms the routed persona.
    expect(replies[0]).toContain("Hi, I'm Nova.");
  });

  test("/personas marks the active persona for THIS chat", async () => {
    const engine = engineWithFakes();
    const session = new Sessions();
    await onNew(ctx(undefined, 1).c, engine, session, "Atlas");
    await onNew(ctx(undefined, 1).c, engine, session, "Nova"); // chat 1 now on nova
    const { c, replies } = ctx(undefined, 1);
    await onPersonas(c, engine, session);
    expect(replies[0]).toMatch(/▶ nova/);
    expect(replies[0]).toMatch(/• atlas/);
  });

  test("/vaults lists the active persona's vaults", async () => {
    const engine = engineWithFakes();
    const session = new Sessions();
    const { c, replies } = ctx(undefined, 1);
    await onVaults(c, engine, session); // no vaults yet
    expect(replies[0]).toContain("No vaults");
  });
});

describe("/spend goes through the capability gate + ledger (#37, security crux)", () => {
  test("an allowed persona spend submits a tx and records nothing ungated", async () => {
    const engine = engineWithFakes();
    const session = new Sessions();
    // Create via the handler → grantDefaultCapabilities makes spend "allow".
    await onNew(ctx(undefined, 1).c, engine, session, "Atlas");
    const { c, replies } = ctx(undefined, 1);
    await onSpend(c, engine, session, "bb1dest 1.50");
    expect(replies[0]).toContain("submitted");
    expect(replies[0]).toContain("SPENDHASH".slice(0, 10));
    // The capability decision was ledgered (proof-of-action), not bypassed.
    const led = engine.ledger.list({ personaId: "atlas" });
    expect(led.some((e) => e.kind === "capability")).toBe(true);
  });

  test("a revoked spend capability BLOCKS /spend — no tx leaves (gate, not bypass)", async () => {
    const engine = engineWithFakes();
    const session = new Sessions();
    await onNew(ctx(undefined, 1).c, engine, session, "Atlas");
    // Revoke the default spend grant → the gate denies (default-deny).
    engine.capabilities.revoke("atlas", "spend", null);
    const { c, replies } = ctx(undefined, 1);
    await onSpend(c, engine, session, "bb1dest 1.00");
    expect(replies[0]).toContain("Denied");
    // No spend tx was submitted — the chokepoint stopped it before broadcast.
    const led = engine.ledger.list({ personaId: "atlas" });
    expect(led.some((e) => e.kind === "spend")).toBe(false);
  });

  test("/spend rejects a non-bb1 recipient and a non-positive amount (no tx)", async () => {
    const engine = engineWithFakes();
    const session = new Sessions();
    await onNew(ctx(undefined, 1).c, engine, session, "Atlas");
    const bad = ctx(undefined, 1);
    await onSpend(bad.c, engine, session, "notanaddr 1.00");
    expect(bad.replies[0]).toContain("bb1");
    const zero = ctx(undefined, 1);
    await onSpend(zero.c, engine, session, "bb1dest 0");
    expect(zero.replies[0]).toContain("positive");
    const led = engine.ledger.list({ personaId: "atlas" });
    expect(led.some((e) => e.kind === "spend")).toBe(false);
  });

  test("/spend with too few args shows usage (no tx)", async () => {
    const engine = engineWithFakes();
    const session = new Sessions();
    await onNew(ctx(undefined, 1).c, engine, session, "Atlas");
    const { c, replies } = ctx(undefined, 1);
    await onSpend(c, engine, session, "bb1dest");
    expect(replies[0]).toContain("Usage");
  });
});
