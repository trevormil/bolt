import { beforeEach, describe, expect, test } from "bun:test";
import { generateWallet, type MsgJson } from "@vellum/chain";
import type { TxChain } from "@vellum/tx";
import { env } from "@vellum/shared";
import {
  createEngine,
  grantDefaultCapabilities,
  spendTools,
  type Engine,
} from "./index.ts";

const RECIPIENT = "bb1yg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zda6hxf";

// Capture what the chain layer was asked to broadcast so we can assert send_usdc
// routes through a plain bank send. `balanceMicro` feeds the spend() pre-check;
// `reject` makes CheckTx reject pre-flight.
function captureChain(opts: { balanceMicro?: string; reject?: boolean } = {}): {
  chain: TxChain;
  broadcasts: MsgJson[][];
} {
  const broadcasts: MsgJson[][] = [];
  const chain: TxChain = {
    getBalances: async () => [
      { denom: env.VELLUM_DENOM, amount: opts.balanceMicro ?? "10000000" },
    ],
    signAndBroadcast: async (_adapter, msgs) => {
      broadcasts.push(msgs as MsgJson[]);
      if (opts.reject) throw new Error("tx rejected");
      return "SENDHASH";
    },
    confirmTx: async () => ({ height: 7, code: 0 }),
  };
  return { chain, broadcasts };
}

let mnemonic: string;
beforeEach(async () => {
  mnemonic = (await generateWallet()).mnemonic;
});

function eng(chain: TxChain): Engine {
  return createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic,
    runLoop: async () => ({ text: "", meters: [] }),
    txChain: chain,
    vault: {
      defaultManager: "bb1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zql3w7",
      createVault: async () => ({ txHash: "VAULTCREATE1" }),
      confirmTx: async () => ({ height: 9, code: 0 }),
      fetchTx: async () => ({ events: [] }),
      fetchTokenBalance: async () => "0",
    },
  });
}

// Provision a persona + wallet. `withSpend` controls the default grants — omit
// to exercise default-deny on the "spend" capability.
async function provision(e: Engine, withSpend = true): Promise<void> {
  if (withSpend) grantDefaultCapabilities(e.capabilities, "p");
  e.store.createPersona("p", "Pat", { name: "Pat", role: "t", voice: "v" });
  await e.wallets.ensureWallet("p");
}

describe("send_usdc — free-form MsgSend from the persona wallet (#65)", () => {
  test("sends a plain bank send to the recipient through the gated chokepoint", async () => {
    const { chain, broadcasts } = captureChain();
    const e = eng(chain);
    await provision(e);
    const from = e.wallets.addressFor("p")!;

    const out = await spendTools(e, "p").invoke("send_usdc", {
      to: RECIPIENT,
      amountUsdc: 2,
    });
    expect(out).toMatch(/Sent 2 USDC/);

    // ONE broadcast, ONE msg: a bank send of the freed USDC → recipient.
    expect(broadcasts.length).toBe(1);
    const [send] = broadcasts[0]!;
    expect(send!.typeUrl).toBe("/cosmos.bank.v1beta1.MsgSend");
    expect(send!.value).toMatchObject({
      fromAddress: from,
      toAddress: RECIPIENT,
      amount: [{ denom: env.VELLUM_DENOM, amount: "2000000" }],
    });

    // Durable tx row, kind "spend" (always hits the capability gate).
    const row = e.txManager.list("p").find((r) => r.to === RECIPIENT)!;
    expect(row.kind).toBe("spend");

    // Telemetry: the send lands on the timeline as a tool_call (metadata only).
    const ev = e.events
      .recent("p")
      .find((x) => x.kind === "tool_call" && x.summary === "spend:send_usdc");
    expect(ev?.ok).toBe(true);
    expect(ev?.meta).toMatchObject({ tool: "send_usdc", source: "spend" });
  });

  test("a malformed recipient is rejected with a clean message — no broadcast", async () => {
    const { chain, broadcasts } = captureChain();
    const e = eng(chain);
    await provision(e);
    // Includes "bb1d" — a bb1-PREFIXED but structurally-invalid address the old
    // prefix-only check would have let through to the signing lifecycle (#65).
    for (const bad of ["0xdeadbeef", "bb1d", "cosmos1abc"]) {
      const out = await spendTools(e, "p").invoke("send_usdc", {
        to: bad,
        amountUsdc: 1,
      });
      expect(out).toMatch(/bb1 wallet address/);
    }
    expect(broadcasts.length).toBe(0);
  });

  test("0 / negative / NaN amounts are rejected with a clean message — no broadcast", async () => {
    const { chain, broadcasts } = captureChain();
    const e = eng(chain);
    await provision(e);
    for (const bad of [0, -1, "abc", Infinity]) {
      const out = await spendTools(e, "p").invoke("send_usdc", {
        to: RECIPIENT,
        amountUsdc: bad,
      });
      expect(out).toMatch(/positive number/);
    }
    expect(broadcasts.length).toBe(0);
    expect(e.txManager.list("p").some((r) => r.to === RECIPIENT)).toBe(false);
  });

  test("denied without the spend grant (default-deny) — clean agent-facing message, no broadcast", async () => {
    const { chain, broadcasts } = captureChain();
    const e = eng(chain);
    await provision(e, false); // no default grants → spend is default-deny
    const out = await spendTools(e, "p").invoke("send_usdc", {
      to: RECIPIENT,
      amountUsdc: 1,
    });
    expect(out).toContain("Denied");
    expect(broadcasts.length).toBe(0);
  });

  test("insufficient funds surfaces as a clean tool message, not a thrown turn-abort", async () => {
    const { chain, broadcasts } = captureChain({ balanceMicro: "1000000" }); // 1 USDC
    const e = eng(chain);
    await provision(e);
    const out = await spendTools(e, "p").invoke("send_usdc", {
      to: RECIPIENT,
      amountUsdc: 5,
    });
    expect(out).toMatch(/Send failed/);
    expect(out).toMatch(/insufficient/i);
    expect(broadcasts.length).toBe(0); // pre-check rejects before any broadcast
  });
});
