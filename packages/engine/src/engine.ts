import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  Authorizer,
  CapabilityStore,
  type Approver,
} from "@vellum/capabilities";
import { claimFaucet as chainClaimFaucet, type Coin } from "@vellum/chain";
import { Ledger } from "@vellum/ledger";
import { PersonaStore, hashEmbedder, type Embedder } from "@vellum/persona";
import { Orchestrator, type RunLoop } from "@vellum/orchestrator";
import { TxManager, type TxChain } from "@vellum/tx";
import { PersonaWallets } from "@vellum/wallet";
import { SettingsStore } from "@vellum/settings";
import { EventStore } from "@vellum/observability";
import { env, createLogger } from "@vellum/shared";
import { VaultService, type VaultServiceDeps } from "./vaults.ts";
import { Model } from "./model-setting.ts";
import { McpManager, type McpConnector } from "./mcp-manager.ts";

const log = createLogger("engine");

type FaucetClaim = (
  address: string,
) => Promise<{ txHash?: string; amount?: string; denom?: string }>;

// Wires the whole agent backend against one persistent store: personas + memory,
// per-persona wallets, deterministic routing, the cost/trust ledger, and the
// tx-lifecycle manager (0023). The web API (server.ts) is a thin shell over this.
// All components share one sqlite file (distinct table sets) so state survives
// restarts — which is exactly what tx reconciliation relies on.
export interface Engine {
  store: PersonaStore;
  wallets: PersonaWallets;
  ledger: Ledger;
  orchestrator: Orchestrator;
  txManager: TxManager;
  vaults: VaultService;
  capabilities: CapabilityStore; // per-persona grants (#37)
  authorizer: Authorizer; // the single gate for filesystem/cron/mcp/spend (#37)
  settings: SettingsStore; // global + per-persona settings (#40)
  events: EventStore; // per-persona product telemetry (#42)
  mcp: McpManager; // long-lived MCP server connections (#46)
  claimFaucet: FaucetClaim;
}

export interface EngineOptions {
  dbPath?: string;
  embedder?: Embedder | null; // default: local hash embedder (no API key)
  runLoop?: RunLoop; // injectable for tests (skip the live LLM)
  getBalances?: (address: string) => Promise<readonly Coin[]>; // test seam
  txChain?: TxChain; // test seam for the tx lifecycle
  claimFaucet?: FaucetClaim; // test seam for the faucet
  mnemonic?: string; // test seam — wallet derivation (else env.AGENT_SIGNER_MNEMONIC)
  vault?: Pick<
    VaultServiceDeps,
    | "createVault"
    | "confirmTx"
    | "fetchTx"
    | "defaultManager"
    | "fetchTokenBalance"
  >; // vault test seams
  approve?: Approver; // capability approval prompt (#37); surfaces inject. Default fail-closed.
  mcpConnect?: McpConnector; // test seam — connect MCP servers without spawning subprocesses (#46)
}

export function createEngine(opts: EngineOptions = {}): Engine {
  const dbPath = opts.dbPath ?? env.VELLUM_DB_PATH;
  // Ensure the DB's directory exists (filesystem-first #39): the default lives
  // under ~/.vellum, and any custom file path needs its parent. (":memory:" and
  // other non-file paths are skipped.)
  if (dbPath !== ":memory:" && dbPath.includes("/"))
    mkdirSync(dirname(dbPath), { recursive: true });
  // OpenRouter is the sole remote LLM provider; OpenRouter has no embeddings
  // endpoint, so dense retrieval uses the built-in network-free hash embedder
  // (no OpenAI key needed). Pass `embedder` explicitly to opt into a semantic
  // one (e.g. openAiEmbedder) where a key is available.
  const embedder = opts.embedder === undefined ? hashEmbedder() : opts.embedder;
  const store = new PersonaStore(dbPath, embedder);
  const wallets = new PersonaWallets({
    dbPath,
    mnemonic: opts.mnemonic,
    getBalances: opts.getBalances,
  });
  const ledger = new Ledger(dbPath);
  // Settings is built early so the orchestrator can read per-persona model
  // overrides (#43) on each turn — the tier router falls back when unset.
  const settings = new SettingsStore(dbPath);
  const orchestrator = new Orchestrator(
    store,
    {
      defaultPersonaId: "",
      dbPath,
      modelFor: (id) => Model.get(settings, id).value,
    },
    opts.runLoop,
  );
  // Capabilities first so the vault chokepoint can gate (#37). Observability
  // is built early too so the Authorizer can emit capability decisions onto
  // the per-persona event timeline (#42).
  const events = new EventStore(dbPath);
  const capabilities = new CapabilityStore(dbPath);
  const authorizer = new Authorizer(capabilities, {
    ledger,
    approve: opts.approve,
    events,
  });
  const txManager = new TxManager({
    wallets,
    ledger,
    dbPath,
    chain: opts.txChain,
    // Gate free-form spend at the chokepoint (#37) — symmetric with vaults.
    authorize: (personaId, action) =>
      authorizer.authorizeOrThrow(personaId, action),
  });
  const vaults = new VaultService({
    dbPath,
    wallets,
    ledger,
    txManager,
    // Gate vault create/withdraw at the chokepoint — a direct call can't bypass
    // the surface gates. Throws CapabilityDeniedError; callers catch it.
    authorize: (personaId, action) =>
      authorizer.authorizeOrThrow(personaId, action),
    // Escrow tracking (#45): fetchTokenBalance defaults to the LCD get_balance
    // query; tests inject it via opts.vault.
    ...opts.vault,
  });
  // MCP connections live on the engine so they're pooled across chat turns and
  // shared by every surface; the daemon warms the global set + closes on exit.
  const mcp = new McpManager(opts.mcpConnect);
  const claimFaucet = opts.claimFaucet ?? chainClaimFaucet;
  log.info(`engine ready · db=${dbPath}`);
  return {
    store,
    wallets,
    capabilities,
    authorizer,
    settings,
    events,
    mcp,
    ledger,
    orchestrator,
    txManager,
    vaults,
    claimFaucet,
  };
}
