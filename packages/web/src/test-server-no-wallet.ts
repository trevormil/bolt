// Offline e2e test server — NO-WALLET variant (#124). Boots the same web app
// as test-server.ts but pre-seeds NOTHING: no persona, no wallet, no
// OpenRouter key, no Telegram. /api/setup-status reports
// { hasLlmKey:false, hasWallet:false, personaCount:0, telegramConfigured:false }
// so the SPA renders SetupFlow on first paint. The onboarding spec drives
// the real /api/setup wizard end-to-end against this variant.
//
// Reuses the same offline seams as test-server.ts (LCD stubs, runLoop, chain,
// vault, secret backend) so the seeded engine behaves the same once setup
// completes.
import { createEngine, type Engine } from "@vellum/engine";
import { createLogger, setRuntimeEnv } from "@vellum/shared";
import type { SecretBackend } from "@vellum/shared";
import { buildApp } from "./server.ts";

const log = createLogger("e2e-server-no-wallet");

const port = Number(process.env.E2E_NO_WALLET_PORT ?? 8789);

// Clear ALL secrets — env loaded from .env or process must NOT bleed into the
// no-wallet boot. setRuntimeEnv overwrites each named field; passing undefined
// removes the env key from the singleton.
setRuntimeEnv({
  AGENT_SIGNER_MNEMONIC: undefined,
  OPENROUTER_API_KEY: undefined,
  TELEGRAM_BOT_TOKEN: undefined,
  TELEGRAM_PRINCIPAL_CHAT_ID: undefined,
  BITBADGES_LCD: `http://127.0.0.1:${port}/lcd`,
});

// In-memory secret backend — getAgentMnemonic returns null until the setup
// POST stores one (then it returns whatever was written). Bounded to this
// process, never touches the real keychain.
function memorySecretBackend(): SecretBackend {
  let value: string | null = null;
  return {
    name: "memory-e2e",
    async get() {
      return value;
    },
    async set(_account, v) {
      value = v;
    },
    async delete() {
      value = null;
    },
  };
}

function makeEngine(): Engine {
  return createEngine({
    dbPath: ":memory:",
    embedder: null,
    // No mnemonic — the setup POST will call wallets.setMnemonic to adopt
    // a freshly generated one.
    runLoop: async () => ({
      text: "ok",
      meters: [
        {
          model: "test-model",
          tier: "cheap",
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 2,
          costUsd: 0.00001,
          ms: 1,
        },
      ],
    }),
    getBalances: async () => [],
    txChain: {
      getBalances: async () => [],
      signAndBroadcast: async () => "E2ETXHASH",
      confirmTx: async () => ({ height: 1, code: 0 }),
    },
    claimFaucet: async () => ({
      txHash: "E2EFAUCET",
      amount: "0",
      denom: "ubadge",
    }),
    vault: {
      defaultManager: "bb1human",
      createVault: async () => ({ txHash: "VAULTCREATE1" }),
      confirmTx: async () => ({ height: 9, code: 0 }),
      fetchTx: async () => ({
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
      }),
      fetchTokenBalance: async () => "0",
    },
  });
}

const engine = makeEngine();

const SETTINGS_ENV_FILE = `/tmp/vellum-e2e-no-wallet-${port}-${Math.floor(Math.random() * 1e9)}.env`;
const secretBackend = memorySecretBackend();

const app = buildApp(engine, undefined, undefined, undefined, {
  envFilePath: SETTINGS_ENV_FILE,
  verifyKey: async () => true,
  verifyTelegram: async () => ({ ok: true, username: "e2e_bot" }),
  telegram: {
    attach: async () => {},
    detach: async () => {},
  },
  secretBackend,
});

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
log.info(
  `e2e test server (no-wallet) · http://127.0.0.1:${port} (SetupFlow primed)`,
);
