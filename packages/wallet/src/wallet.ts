import { Database } from "bun:sqlite";
import {
  deriveAdapter,
  getBalances as chainGetBalances,
  type Coin,
} from "@vellum/chain";
import { createLogger, getAgentMnemonic } from "@vellum/shared";

const log = createLogger("wallet");

// The persona's hot signer — the BitBadges SDK adapter (one tested identity for
// bank + vaults + payment requests). Typed via deriveAdapter so @vellum/wallet
// needn't import the SDK directly.
export type Signer = Awaited<ReturnType<typeof deriveAdapter>>;

// One bb1 wallet per persona, all derived from a SINGLE master mnemonic at
// distinct SDK HD indices (m/44'/60'/0'/0/index). The DB stores only derivation
// metadata (hd_index + the public bb1 address) — never a private key or the
// mnemonic. The master seed is resolved via getAgentMnemonic (ADR-0007): an
// explicit env override first, else the OS keychain — never plaintext on disk;
// the signer is re-derived at runtime and never persisted.
export interface WalletRecord {
  personaId: string;
  address: string;
  hdIndex: number;
  created: number;
}

type BalanceFetcher = (address: string) => Promise<readonly Coin[]>;

export interface PersonaWalletsOptions {
  mnemonic?: string; // explicit override; else resolved via getAgentMnemonic
  dbPath?: string;
  getBalances?: BalanceFetcher; // injectable for tests
}

export class PersonaWallets {
  private db: Database;
  private mnemonic: string | undefined;
  private getBalances: BalanceFetcher;
  // Serializes wallet creation. ensureWallet reads MAX(hd_index), then awaits
  // async key derivation before inserting — concurrent first-use calls would
  // otherwise observe the same index and collide on the UNIQUE constraint. Our
  // deployment is a single process, so an in-process critical section is the
  // right tool (a sync DB transaction can't span the awaited derivation).
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(opts: PersonaWalletsOptions = {}) {
    // No eager env read: the seed is resolved lazily (env override → OS keychain)
    // on first use, so a daemon can boot with the seed only in the keychain.
    this.mnemonic = opts.mnemonic;
    this.getBalances = opts.getBalances ?? chainGetBalances;
    this.db = new Database(opts.dbPath ?? ":memory:");
    this.db.run(`CREATE TABLE IF NOT EXISTS wallets (
      persona_id TEXT PRIMARY KEY,
      hd_index INTEGER NOT NULL UNIQUE,
      address TEXT NOT NULL,
      created INTEGER NOT NULL)`);
  }

  /** Adopt a master mnemonic at runtime (#54 web onboarding): a daemon that
   *  booted with no AGENT_SIGNER_MNEMONIC can derive persona wallets right after
   *  first-run setup, without a restart. Existing rows' addresses still re-derive
   *  from this mnemonic + their stored HD index (the mismatch guard catches a
   *  swap to a different mnemonic). */
  setMnemonic(mnemonic: string): void {
    this.mnemonic = mnemonic;
  }

  // Resolve the master seed once, then memoize on the instance for the tx hot
  // path: an explicit override (test seam OR setMnemonic runtime-adopt) wins,
  // else getAgentMnemonic (env → OS keychain, ADR-0007).
  private async resolveMnemonic(): Promise<string> {
    if (this.mnemonic) return this.mnemonic;
    const m = await getAgentMnemonic();
    if (!m) {
      throw new Error(
        "No agent signer seed — set AGENT_SIGNER_MNEMONIC, run the setup " +
          "wizard, or `vellum keys migrate` to store it in the OS keychain",
      );
    }
    this.mnemonic = m;
    return m;
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

  // Run `fn` after all prior queued writes complete (in-process mutex). Keeps
  // the queue alive across both success and failure without leaking rejections.
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(fn, fn);
    this.writeQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** Get a persona's wallet, deriving + persisting one the first time. */
  async ensureWallet(personaId: string): Promise<WalletRecord> {
    const existing = this.walletFor(personaId);
    if (existing) return existing;

    return this.serialize(async () => {
      // Re-check inside the critical section: a concurrent call may have just
      // created this persona's wallet while we waited for the lock.
      const won = this.walletFor(personaId);
      if (won) return won;

      const mnemonic = await this.resolveMnemonic();
      const next =
        (
          this.db
            .query("SELECT COALESCE(MAX(hd_index), -1) AS m FROM wallets")
            .get() as {
            m: number;
          }
        ).m + 1;
      const adapter = await deriveAdapter(mnemonic, next);
      const address = adapter.address;
      const created = Date.now();
      this.db
        .query(
          "INSERT INTO wallets (persona_id, hd_index, address, created) VALUES (?, ?, ?, ?)",
        )
        .run(personaId, next, address, created);
      log.info(`wallet derived · ${personaId} · index ${next} · ${address}`);
      return { personaId, address, hdIndex: next, created };
    });
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

  /**
   * Re-derive the persona's hot signer (SDK adapter) at runtime from the master
   * seed + its HD index. The key is never persisted — only the index is. Used by
   * the tx layer; callers must not log or store the result.
   */
  async signerFor(personaId: string): Promise<Signer> {
    const w = this.walletFor(personaId);
    if (!w) throw new Error(`no wallet for persona: ${personaId}`);
    const adapter = await deriveAdapter(
      await this.resolveMnemonic(),
      w.hdIndex,
    );
    // The persisted address must match what the current derivation path + master
    // mnemonic produce for this HD index. A mismatch means the row predates a
    // derivation change (or the mnemonic differs): addressFor() would report one
    // identity while this signer is another, so the tx layer would build a send
    // FROM the stored address but sign AS a different key. Fail loudly before any
    // broadcast rather than silently producing a wrong-key tx.
    if (adapter.address !== w.address) {
      throw new Error(
        `wallet ${personaId} address mismatch: stored ${w.address} but the current ` +
          `derivation yields ${adapter.address} — this row predates the current ` +
          `signing path; re-provision (migrate) the wallet before signing`,
      );
    }
    return adapter;
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
