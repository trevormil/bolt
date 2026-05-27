import type { Coin } from "@vellum/chain";
import { Ledger } from "@vellum/ledger";
import { PersonaStore, openAiEmbedder, type Embedder } from "@vellum/persona";
import { Orchestrator, type RunLoop } from "@vellum/orchestrator";
import { PersonaWallets } from "@vellum/wallet";
import { env, createLogger } from "@vellum/shared";

const log = createLogger("engine");

// Wires the whole agent backend against one persistent store: personas + memory,
// per-persona wallets, deterministic routing, and the cost/trust ledger. The web
// API (server.ts) is a thin shell over this. All four components share the same
// sqlite file (distinct table sets — no conflict) so state survives restarts.
export interface Engine {
  store: PersonaStore;
  wallets: PersonaWallets;
  ledger: Ledger;
  orchestrator: Orchestrator;
}

export interface EngineOptions {
  dbPath?: string;
  embedder?: Embedder | null; // default: OpenAI embeddings (BM25-only if no key)
  runLoop?: RunLoop; // injectable for tests (skip the live LLM)
  getBalances?: (address: string) => Promise<readonly Coin[]>; // test seam
}

export function createEngine(opts: EngineOptions = {}): Engine {
  const dbPath = opts.dbPath ?? env.VELLUM_DB_PATH;
  const embedder =
    opts.embedder === undefined ? openAiEmbedder() : opts.embedder;
  const store = new PersonaStore(dbPath, embedder);
  const wallets = new PersonaWallets({ dbPath, getBalances: opts.getBalances });
  const ledger = new Ledger(dbPath);
  const orchestrator = new Orchestrator(
    store,
    { defaultPersonaId: "", dbPath },
    opts.runLoop,
  );
  log.info(`engine ready · db=${dbPath}`);
  return { store, wallets, ledger, orchestrator };
}
