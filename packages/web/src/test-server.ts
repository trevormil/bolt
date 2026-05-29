// Offline e2e test server (#77). Boots the real web app (buildApp) over a FULLY
// SEAMED engine — no live LLM, chain, or faucet — so Playwright runs the actual
// SPA deterministically and offline. One persona ("Atlas") is pre-seeded with a
// wallet so the in-app flows (chat, sessions, settings, wallet) render without
// going through onboarding. Bound to loopback on E2E_PORT (default 8788).
//
// This is a TEST entrypoint, never shipped in the daemon. The seams mirror the
// ones packages/web/src/server.test.ts already uses, so e2e and unit exercise
// the same fakes.
import { createEngine, type Engine } from "@vellum/engine";
import { env, setRuntimeEnv, createLogger } from "@vellum/shared";
import { buildApp } from "./server.ts";

const log = createLogger("e2e-server");

const TEST_MNEMONIC =
  "test test test test test test test test test test test junk";

const port = Number(process.env.E2E_PORT ?? 8788);

// /api/setup-status reads these off the env singleton to decide whether the SPA
// shows first-run onboarding. Set them so the seeded server opens straight into
// the app (hasWallet + hasLlmKey true), not the SetupFlow. BITBADGES_LCD is
// pointed at this same server's `/lcd` prefix — `signAndBroadcast` (keplr.ts)
// hits the cosmos LCD endpoints same-origin, so the stubs below replace the
// real Meridian devnet for the signed-flow e2e (#98). No cross-origin, no
// Playwright route racing.
setRuntimeEnv({
  AGENT_SIGNER_MNEMONIC: TEST_MNEMONIC,
  OPENROUTER_API_KEY: "sk-or-e2e-test",
  BITBADGES_LCD: `http://127.0.0.1:${port}/lcd`,
});
const DENOM = env.VELLUM_DENOM;
const balance = [{ denom: DENOM, amount: "5000000" }]; // $5 of mock USDC

// A deterministic markdown reply so the chat e2e can assert rendering (links,
// code, bold) AND that cost/tokens are NOT surfaced in the chat (#69).
const REPLY =
  "Here is a **markdown** reply with a [link](https://example.com) and `inline code`.\n\n- bullet one\n- bullet two";

// A fake create-vault tx whose events parse to a VaultRef (mirrors server.test),
// so the Vaults UI can create a vault offline (collection 777 + deposit/withdraw
// approvals) once a (mocked) Keplr wallet supplies the human manager address.
const fakeCreateTxEvents = {
  events: [
    {
      type: "message",
      attributes: [
        { key: "collectionId", value: "777" },
        {
          key: "msg",
          value: JSON.stringify({
            collectionApprovals: [
              { approvalId: "vault-deposit", toListId: "!bb1backing" },
              { approvalId: "vault-withdraw-x", toListId: "bb1backing" },
            ],
          }),
        },
      ],
    },
  ],
};

function makeEngine(): Engine {
  const engine = createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic: TEST_MNEMONIC,
    runLoop: async () => ({
      text: REPLY,
      meters: [
        {
          model: "test-model",
          tier: "cheap",
          promptTokens: 5,
          completionTokens: 5,
          totalTokens: 10,
          costUsd: 0.0001,
          ms: 1,
        },
      ],
    }),
    getBalances: async () => balance,
    txChain: {
      getBalances: async () => balance,
      signAndBroadcast: async () => "E2ETXHASH",
      confirmTx: async () => ({ height: 1, code: 0 }),
    },
    claimFaucet: async () => ({
      txHash: "E2EFAUCET",
      amount: "10000000",
      denom: DENOM,
    }),
    // Seam vault creation offline (mirrors server.test). The human manager comes
    // from the connected (mocked) Keplr wallet; defaultManager is the fallback.
    vault: {
      defaultManager: "bb1human",
      createVault: async () => ({ txHash: "VAULTCREATE1" }),
      confirmTx: async () => ({ height: 9, code: 0 }),
      fetchTx: async () => fakeCreateTxEvents,
      fetchTokenBalance: async () => "2000000",
    },
  });
  // Seed one persona so the app opens straight into a usable state.
  engine.store.createPersona("atlas", "Atlas", {
    name: "Atlas",
    role: "personal assistant",
    voice: "friendly and concise",
  });
  // A little seeded activity (#95) so the unified Activity feed renders rows —
  // an ops event, a tool call, an on-chain settlement (kept, with a tx), and the
  // per-turn ledger cost (deduped into the chat_out event).
  engine.events.emit({
    personaId: "atlas",
    kind: "chat_out",
    summary: "reply sent",
    latencyMs: 640,
    costUsd: 0.0021,
    tokens: 1200,
    ok: true,
  });
  engine.events.emit({
    personaId: "atlas",
    kind: "tool_call",
    summary: "tool:get_balance",
    ok: true,
    meta: { tool: "get_balance" },
  });
  engine.ledger.recordAgentRun("atlas", "chat · hello", [
    {
      model: "anthropic/claude-haiku-4.5",
      tier: "cheap",
      promptTokens: 600,
      completionTokens: 600,
      totalTokens: 1200,
      costUsd: 0.0021,
      ms: 640,
    },
  ]);
  engine.ledger.recordOnchain({
    personaId: "atlas",
    kind: "spend",
    summary: "sent 5 USDC",
    authority: "agent",
    costUsd: 0,
    tokens: 0,
    txHash: "E2ESPEND1",
  });
  return engine;
}

const engine = makeEngine();
await engine.wallets.ensureWallet("atlas"); // provision the wallet (address shown)
const app = buildApp(engine);

// Same-origin cosmos LCD stubs (#98). The page's `signAndBroadcast` hits these
// after the (mocked) Keplr signs; the bitbadges SDK has already left the path
// shape canonical, so we just return committed-success for any tx + a single
// registered account + zero balance. The body content doesn't matter — only
// that fetchAccount sees account_number, the broadcast sees code 0, and
// confirmTx sees the same txhash come back.
const lcdJson = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
function handleLcd(req: Request, url: URL): Response | null {
  const p = url.pathname;
  if (p.startsWith("/lcd/cosmos/bank/v1beta1/balances/"))
    return lcdJson({ balances: [] });
  if (p.startsWith("/lcd/cosmos/auth/v1beta1/accounts/"))
    return lcdJson({
      account: {
        "@type": "/cosmos.auth.v1beta1.BaseAccount",
        account_number: "1",
        sequence: "0",
      },
    });
  if (p === "/lcd/cosmos/tx/v1beta1/txs" && req.method === "POST")
    return lcdJson({
      tx_response: { code: 0, txhash: "E2EHUMANTX", raw_log: "" },
    });
  if (p.startsWith("/lcd/cosmos/tx/v1beta1/txs/"))
    return lcdJson({
      tx_response: {
        code: 0,
        txhash: "E2EHUMANTX",
        height: "1",
        raw_log: "",
      },
    });
  return null;
}

Bun.serve({
  port,
  hostname: "127.0.0.1",
  fetch: (req) => {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/lcd/")) {
      return (
        handleLcd(req, url) ?? new Response("lcd: not found", { status: 404 })
      );
    }
    return app.fetch(req);
  },
});
log.info(`e2e test server · http://127.0.0.1:${port} (persona: atlas)`);
