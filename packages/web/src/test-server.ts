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

// /api/setup-status reads these off the env singleton to decide whether the SPA
// shows first-run onboarding. Set them so the seeded server opens straight into
// the app (hasWallet + hasLlmKey true), not the SetupFlow.
setRuntimeEnv({
  AGENT_SIGNER_MNEMONIC: TEST_MNEMONIC,
  OPENROUTER_API_KEY: "sk-or-e2e-test",
});
const DENOM = env.VELLUM_DENOM;
const balance = [{ denom: DENOM, amount: "5000000" }]; // $5 of mock USDC

// A deterministic markdown reply so the chat e2e can assert rendering (links,
// code, bold) AND that cost/tokens are NOT surfaced in the chat (#69).
const REPLY =
  "Here is a **markdown** reply with a [link](https://example.com) and `inline code`.\n\n- bullet one\n- bullet two";

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
  });
  // Seed one persona so the app opens straight into a usable state.
  engine.store.createPersona("atlas", "Atlas", {
    name: "Atlas",
    role: "personal assistant",
    voice: "friendly and concise",
  });
  return engine;
}

const port = Number(process.env.E2E_PORT ?? 8788);
const engine = makeEngine();
await engine.wallets.ensureWallet("atlas"); // provision the wallet (address shown)
const app = buildApp(engine);
Bun.serve({ port, hostname: "127.0.0.1", fetch: app.fetch });
log.info(`e2e test server · http://127.0.0.1:${port} (persona: atlas)`);
