import { Database } from "bun:sqlite";
import {
  addressAt,
  getBalances as chainGetBalances,
  type Coin,
} from "@vellum/chain";
import { env, createLogger } from "@vellum/shared";

const log = createLogger("wallet");

// One bb1 wallet per persona, all derived from a SINGLE master mnemonic at
// distinct BIP-44 account indices. The DB stores only derivation metadata
// (hd_index + the public bb1 address) — never a private key or the mnemonic.
// The mnemonic lives in env/.env (AGENT_SIGNER_MNEMONIC) and is committed
// nowhere; deriving a signer (0013) re-derives at runtime from env.
export interface WalletRecord {
  personaId: string;
  address: string;
  hdIndex: number;
  created: number;
}

type BalanceFetcher = (address: string) => Promise<readonly Coin[]>;

export interface PersonaWalletsOptions {
  mnemonic?: string; // defaults to env.AGENT_SIGNER_MNEMONIC
  dbPath?: string;
  getBalances?: BalanceFetcher; // injectable for tests
}

export class PersonaWallets {
  private db: Database;
  private mnemonic: string | undefined;
  private getBalances: BalanceFetcher;

  constructor(opts: PersonaWalletsOptions = {}) {
    this.mnemonic = opts.mnemonic ?? env.AGENT_SIGNER_MNEMONIC;
    this.getBalances = opts.getBalances ?? chainGetBalances;
    this.db = new Database(opts.dbPath ?? ":memory:");
    this.db.run(`CREATE TABLE IF NOT EXISTS wallets (
      persona_id TEXT PRIMARY KEY,
      hd_index INTEGER NOT NULL UNIQUE,
      address TEXT NOT NULL,
      created INTEGER NOT NULL)`);
  }

  private requireMnemonic(): string {
    if (!this.mnemonic) {
      throw new Error(
        "AGENT_SIGNER_MNEMONIC not set — cannot derive persona wallets",
      );
    }
    return this.mnemonic;
  }

  private rowToRecord(r: {
    persona_id: string;
    address: string;
    hd_index: number;
    created: number;
  }): WalletRecord {
    return {
      personaId: r.persona_id,
      address: r.address,
      hdIndex: r.hd_index,
      created: r.created,
    };
  }

  /** Get a persona's wallet, deriving + persisting one the first time. */
  async ensureWallet(personaId: string): Promise<WalletRecord> {
    const existing = this.walletFor(personaId);
    if (existing) return existing;

    const mnemonic = this.requireMnemonic();
    const next =
      (
        this.db
          .query("SELECT COALESCE(MAX(hd_index), -1) AS m FROM wallets")
          .get() as {
          m: number;
        }
      ).m + 1;
    const address = await addressAt(mnemonic, next);
    const created = Date.now();
    this.db
      .query(
        "INSERT INTO wallets (persona_id, hd_index, address, created) VALUES (?, ?, ?, ?)",
      )
      .run(personaId, next, address, created);
    log.info(`wallet derived · ${personaId} · index ${next} · ${address}`);
    return { personaId, address, hdIndex: next, created };
  }

  walletFor(personaId: string): WalletRecord | null {
    const row = this.db
      .query(
        "SELECT persona_id, hd_index, address, created FROM wallets WHERE persona_id = ?",
      )
      .get(personaId) as {
      persona_id: string;
      address: string;
      hd_index: number;
      created: number;
    } | null;
    return row ? this.rowToRecord(row) : null;
  }

  addressFor(personaId: string): string | null {
    return this.walletFor(personaId)?.address ?? null;
  }

  /** Live balances for a persona's wallet (read-only chain query). */
  async balanceFor(personaId: string): Promise<readonly Coin[]> {
    const w = this.walletFor(personaId);
    if (!w) throw new Error(`no wallet for persona: ${personaId}`);
    return this.getBalances(w.address);
  }

  list(): WalletRecord[] {
    const rows = this.db
      .query(
        "SELECT persona_id, hd_index, address, created FROM wallets ORDER BY hd_index",
      )
      .all() as {
      persona_id: string;
      address: string;
      hd_index: number;
      created: number;
    }[];
    return rows.map((r) => this.rowToRecord(r));
  }

  close(): void {
    this.db.close();
  }
}
