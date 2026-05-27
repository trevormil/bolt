import { claimFaucet as chainClaimFaucet, type Coin } from "@vellum/chain";
import { Ledger } from "@vellum/ledger";
import { PersonaStore, hashEmbedder, type Embedder } from "@vellum/persona";
import { Orchestrator, type RunLoop } from "@vellum/orchestrator";
import { TxManager, type TxChain } from "@vellum/tx";
import { PersonaWallets } from "@vellum/wallet";
import { env, createLogger } from "@vellum/shared";
import { VaultService, type VaultServiceDeps } from "./vaults.ts";

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
    "createVault" | "confirmTx" | "fetchTx" | "defaultManager"
  >; // vault test seams
}

export function createEngine(opts: EngineOptions = {}): Engine {
  const dbPath = opts.dbPath ?? env.VELLUM_DB_PATH;
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
  const orchestrator = new Orchestrator(
    store,
    { defaultPersonaId: "", dbPath },
    opts.runLoop,
  );
  const txManager = new TxManager({
    wallets,
    ledger,
    dbPath,
    chain: opts.txChain,
  });
  const vaults = new VaultService({
    dbPath,
    wallets,
    ledger,
    txManager,
    ...opts.vault,
  });
  const claimFaucet = opts.claimFaucet ?? chainClaimFaucet;
  log.info(`engine ready · db=${dbPath}`);
  return {
    store,
    wallets,
    ledger,
    orchestrator,
    txManager,
    vaults,
    claimFaucet,
  };
}
