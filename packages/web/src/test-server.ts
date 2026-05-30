// Offline e2e test server (#77). Boots the real web app (buildApp) over a FULLY
// SEAMED engine — no live LLM, chain, or faucet — so Playwright runs the actual
// SPA deterministically and offline. One persona ("Atlas") is pre-seeded with a
// wallet so the in-app flows (chat, sessions, settings, wallet) render without
// going through onboarding. Bound to loopback on E2E_PORT (default 8788).
//
// This is a TEST entrypoint, never shipped in the daemon. The seams mirror the
// ones packages/web/src/server.test.ts already uses, so e2e and unit exercise
// the same fakes.
import {
  createEngine,
  grantDefaultCapabilities,
  type Engine,
} from "@vellum/engine";
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

// Fake create-vault tx whose events parse to a VaultRef (mirrors server.test).
// Both txHash and collectionId must be unique per call so multiple specs in one
// suite run don't collide on the vaults PK or the ledger.tx_hash UNIQUE index.
// createVault returns a fresh txHash and records the mapping; fetchTx returns
// the matching collectionId envelope.
let nextVaultIdx = 0;
const vaultSeamCollection: Record<string, string> = {};
function nextVaultTxHash(): string {
  const idx = nextVaultIdx++;
  const txHash = `VAULTCREATE${idx + 1}`;
  vaultSeamCollection[txHash] = String(777 + idx);
  return txHash;
}
function fakeCreateTxEventsFor(txHash: string): {
  events: { type: string; attributes: { key: string; value: string }[] }[];
} {
  const collectionId = vaultSeamCollection[txHash] ?? "777";
  return {
    events: [
      {
        type: "message",
        attributes: [
          { key: "collectionId", value: collectionId },
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
}

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
      createVault: async () => ({ txHash: nextVaultTxHash() }),
      confirmTx: async () => ({ height: 9, code: 0 }),
      fetchTx: async (txHash: string) => fakeCreateTxEventsFor(txHash),
      fetchTokenBalance: async () => "2000000",
    },
  });
  // Seed one persona so the app opens straight into a usable state. The web
  // POST /api/personas route also calls grantDefaultCapabilities (server.ts);
  // bypass the route to seed → must mirror the surface's grant policy here, or
  // the gated flows (vault.create / spend / vault.withdraw) silently 403 and
  // specs that don't assert on outcome state false-positive.
  engine.store.createPersona("atlas", "Atlas", {
    name: "Atlas",
    role: "personal assistant",
    voice: "friendly and concise",
  });
  grantDefaultCapabilities(engine.capabilities, "atlas");
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
// Atlas's deterministic signer address (derived from TEST_MNEMONIC, index 0).
// Used by the LCD GET tx stub to fabricate a coin_received event that satisfies
// /api/payment-requests/:id/confirm's verifyCredit check — without it, the
// server-side credit verification reads zero credited and 400s, blocking the
// public /pay/:id e2e (#121).
const ATLAS_ADDRESS = engine.wallets.walletFor("atlas")!.address;

// Settings WRITE routes (rotate OpenRouter key, set Telegram token) hit the
// live OpenRouter/Telegram APIs and write to .env by default. Stub both
// channels so e2e is offline + can't corrupt the developer's actual .env.
const SETTINGS_ENV_FILE = `/tmp/vellum-e2e-${port}-${Math.floor(Math.random() * 1e9)}.env`;
const app = buildApp(engine, undefined, undefined, undefined, {
  envFilePath: SETTINGS_ENV_FILE,
  verifyKey: async () => true,
  verifyTelegram: async () => ({ ok: true, username: "e2e_bot" }),
  telegram: {
    attach: async () => {},
    detach: async () => {},
  },
});

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
        // verifyCredit sums coin_received events that name `toAddress` as the
        // receiver. The payment-request flow has the persona's signer address
        // as the recipient; fabricating a 1000 USDC credit lets confirm pass
        // for any reasonable request amount in tests.
        events: [
          {
            type: "coin_received",
            attributes: [
              { key: "receiver", value: ATLAS_ADDRESS },
              { key: "amount", value: `1000000000${DENOM}` },
            ],
          },
        ],
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
