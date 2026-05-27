import { Database } from "bun:sqlite";
import {
  bankSendMsg,
  confirmTx,
  getBalances,
  signAndBroadcast,
  TxRevertedError,
  type MsgJson,
} from "@vellum/chain";
import type { Ledger, LedgerKind } from "@vellum/ledger";
import type { PersonaWallets } from "@vellum/wallet";
import { NOOP_SPAN, type TraceSpan } from "@vellum/trace";
import { env, createLogger } from "@vellum/shared";

const log = createLogger("tx");

// THE chain-state reconciliation invariant (ARCHITECTURE §13, ticket 0023).
// Every value movement goes through here so that:
//  - we simulate before broadcast (reject pre-flight on failure),
//  - we persist a PENDING record BEFORE returning control to the caller/LLM,
//  - confirmation runs out of band and the LEDGER entry is written ONLY from
//    chain-confirmed state — never from the LLM's claim,
//  - a per-persona mutex blocks a 2nd tx from a wallet until the 1st settles,
//  - on restart, all PENDING rows are reconciled against the chain.

export type TxStatus = "pending" | "confirmed" | "failed";
export type TxKind = Extract<LedgerKind, "spend" | "funding" | "vault_op">;

export interface PendingTx {
  hash: string;
  personaId: string;
  kind: TxKind;
  to: string;
  denom: string;
  amount: string; // base units (micro-USDC)
  authority: string;
  status: TxStatus;
  height: number | null;
  error: string | null;
  created: number;
  updated: number;
}

// Injected so the manager is unit-testable without the network. Defaults are the
// real @vellum/chain functions (signatures reused via typeof — no type drift).
export interface TxChain {
  signAndBroadcast: typeof signAndBroadcast;
  confirmTx: typeof confirmTx;
  getBalances: typeof getBalances;
}
const DEFAULT_CHAIN: TxChain = {
  signAndBroadcast,
  confirmTx,
  getBalances,
};

export interface SpendInput {
  personaId: string;
  to: string;
  amount: string; // base units
  kind?: TxKind; // default "spend"
  authority?: string; // who authorized — default "agent"
  trace?: TraceSpan; // optional tracing parent (no-op by default)
}

export interface TxManagerOptions {
  wallets: PersonaWallets;
  ledger: Ledger;
  dbPath?: string;
  denom?: string; // defaults to env.VELLUM_DENOM (USDC)
  chain?: TxChain;
}

interface TxRow {
  hash: string;
  persona_id: string;
  kind: string;
  to_addr: string;
  denom: string;
  amount: string;
  authority: string;
  status: string;
  height: number | null;
  error: string | null;
  created: number;
  updated: number;
}
const toTx = (r: TxRow): PendingTx => ({
  hash: r.hash,
  personaId: r.persona_id,
  kind: r.kind as TxKind,
  to: r.to_addr,
  denom: r.denom,
  amount: r.amount,
  authority: r.authority,
  status: r.status as TxStatus,
  height: r.height,
  error: r.error,
  created: r.created,
  updated: r.updated,
});

function usdc(base: string): string {
  return `${(Number(base) / 1e6).toFixed(2)} USDC`;
}

export class TxManager {
  private db: Database;
  private wallets: PersonaWallets;
  private ledger: Ledger;
  private denom: string;
  private chain: TxChain;
  private locks = new Map<string, Promise<void>>();

  constructor(opts: TxManagerOptions) {
    this.wallets = opts.wallets;
    this.ledger = opts.ledger;
    this.denom = opts.denom ?? env.VELLUM_DENOM;
    this.chain = opts.chain ?? DEFAULT_CHAIN;
    this.db = new Database(opts.dbPath ?? ":memory:");
    this.db.run(`CREATE TABLE IF NOT EXISTS tx (
      hash TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      to_addr TEXT NOT NULL,
      denom TEXT NOT NULL,
      amount TEXT NOT NULL,
      authority TEXT NOT NULL,
      status TEXT NOT NULL,
      height INTEGER,
      error TEXT,
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL)`);
  }

  // Per-persona async mutex. Held from spend start THROUGH confirmation so no
  // second tx leaves a wallet until the first confirms or fails (§13.4).
  private async acquire(personaId: string): Promise<() => void> {
    const prior = this.locks.get(personaId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((res) => (release = res));
    this.locks.set(
      personaId,
      prior.then(() => gate),
    );
    await prior;
    return release;
  }

  /**
   * Submit pre-built msgs through the governed lifecycle: durable per-persona
   * guard + in-memory mutex → sign + broadcast → persist PENDING before
   * returning → confirm out of band (ledger written only from chain-confirmed
   * state). The single chokepoint for ALL on-chain actions (spend, vault_op,
   * funding). Returns the PENDING tx immediately.
   */
  async submit(input: {
    personaId: string;
    kind: TxKind;
    msgs: MsgJson[];
    to: string; // ledger/summary context (recipient, vault backing, …)
    amount: string; // µUSDC for the summary
    authority?: string;
    memo?: string;
    trace?: TraceSpan;
  }): Promise<PendingTx> {
    const { personaId, kind, msgs, to, amount } = input;
    const authority = input.authority ?? "agent";
    const release = await this.acquire(personaId);
    let released = false;
    const releaseOnce = () => {
      if (!released) {
        released = true;
        release();
      }
    };

    try {
      // Durable per-persona guard (§13.4): no new tx while ANY row for this
      // persona is still pending — covers confirmation timeouts (row stays
      // pending) and crash+restart (reconcile settles first). The in-memory lock
      // just serializes the guard+broadcast window so two calls can't both pass.
      if (this.pending(personaId).length > 0) {
        throw new Error(
          `persona ${personaId} has a pending tx — wait for it to settle`,
        );
      }

      const chainSpan = (input.trace ?? NOOP_SPAN).child(`chain:${kind}`, {
        to,
        amount,
      });
      const adapter = await this.wallets.signerFor(personaId);
      // CheckTx rejects pre-flight failures (bad sig, insufficient funds,
      // over-cap) before inclusion. Returns the hash; confirmation is async.
      const hash = await this.chain.signAndBroadcast(adapter, msgs, {
        memo: input.memo ?? `vellum ${kind}`,
      });
      chainSpan.end({ hash });

      const now = Date.now();
      const pending: PendingTx = {
        hash,
        personaId,
        kind,
        to,
        denom: this.denom,
        amount,
        authority,
        status: "pending",
        height: null,
        error: null,
        created: now,
        updated: now,
      };
      this.insert(pending);
      log.info(
        `pending ${kind} · ${personaId} · ${usdc(amount)} → ${to} · ${hash.slice(0, 10)}`,
      );

      // Confirm out of band; the lock is held until this settles.
      void this.confirmPending(hash).finally(releaseOnce);
      return pending;
    } catch (e) {
      releaseOnce();
      throw e;
    }
  }

  /**
   * Move value from a persona's wallet (bank send). Friendly balance pre-check,
   * then through submit() — the governed lifecycle.
   */
  async spend(input: SpendInput): Promise<PendingTx> {
    const { personaId, to, amount } = input;
    const from = this.wallets.addressFor(personaId);
    if (!from) throw new Error(`no wallet for persona: ${personaId}`);
    // Friendly pre-check (CheckTx is authoritative, but this reads better).
    const have = BigInt(
      (await this.chain.getBalances(from)).find((c) => c.denom === this.denom)
        ?.amount ?? "0",
    );
    if (have < BigInt(amount)) {
      throw new Error(
        `insufficient USDC: have ${usdc(have.toString())}, need ${usdc(amount)}`,
      );
    }
    return this.submit({
      personaId,
      kind: input.kind ?? "spend",
      msgs: [bankSendMsg(from, to, amount, this.denom)],
      to,
      amount,
      authority: input.authority,
      trace: input.trace,
    });
  }

  /**
   * Poll a pending tx toward a terminal state. On CONFIRMED, write the ledger
   * entry from chain-confirmed state (height + hash). On a DEFINITIVE revert
   * (TxRevertedError), mark FAILED — no ledger value entry (no value moved). A
   * timeout / network / not-yet-observed result is NOT failure: the row stays
   * PENDING (error recorded) so reconcile() retries it — a tx that commits after
   * the poll window must never be lost. Idempotent — only acts on pending rows.
   */
  async confirmPending(hash: string): Promise<void> {
    const row = this.get(hash);
    if (!row || row.status !== "pending") return;
    try {
      const { height } = await this.chain.confirmTx(hash);
      this.setStatus(hash, "confirmed", { height });
      this.ledger.record({
        personaId: row.personaId,
        kind: row.kind,
        summary: `${row.kind} ${usdc(row.amount)} → ${row.to}`,
        authority: row.authority,
        txHash: hash,
        meta: { height, denom: row.denom, amount: row.amount, to: row.to },
      });
      log.info(`confirmed ${hash.slice(0, 10)} @ ${height}`);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      if (e instanceof TxRevertedError) {
        this.setStatus(hash, "failed", { error });
        log.warn(`failed ${hash.slice(0, 10)}: ${error}`);
      } else {
        // Unknown (timeout/network) — keep PENDING so reconcile retries.
        this.setStatus(hash, "pending", { error });
        log.warn(`unconfirmed ${hash.slice(0, 10)}: ${error} — left pending`);
      }
    }
  }

  /** On startup: drive every still-PENDING row to a terminal state. */
  async reconcile(): Promise<number> {
    const pendings = this.pending();
    for (const p of pendings) await this.confirmPending(p.hash);
    if (pendings.length) log.info(`reconciled ${pendings.length} pending tx`);
    return pendings.length;
  }

  get(hash: string): PendingTx | null {
    const row = this.db
      .query("SELECT * FROM tx WHERE hash = ?")
      .get(hash) as TxRow | null;
    return row ? toTx(row) : null;
  }
  pending(personaId?: string): PendingTx[] {
    const q = personaId
      ? this.db.query(
          "SELECT * FROM tx WHERE status = 'pending' AND persona_id = ? ORDER BY created",
        )
      : this.db.query(
          "SELECT * FROM tx WHERE status = 'pending' ORDER BY created",
        );
    return (personaId ? q.all(personaId) : q.all()).map((r) =>
      toTx(r as TxRow),
    );
  }
  list(personaId: string): PendingTx[] {
    return (
      this.db
        .query("SELECT * FROM tx WHERE persona_id = ? ORDER BY created DESC")
        .all(personaId) as TxRow[]
    ).map(toTx);
  }

  private insert(t: PendingTx): void {
    this.db
      .query(
        `INSERT INTO tx (hash, persona_id, kind, to_addr, denom, amount, authority, status, height, error, created, updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        t.hash,
        t.personaId,
        t.kind,
        t.to,
        t.denom,
        t.amount,
        t.authority,
        t.status,
        t.height,
        t.error,
        t.created,
        t.updated,
      );
  }
  private setStatus(
    hash: string,
    status: TxStatus,
    extra: { height?: number; error?: string },
  ): void {
    this.db
      .query(
        "UPDATE tx SET status = ?, height = ?, error = ?, updated = ? WHERE hash = ?",
      )
      .run(status, extra.height ?? null, extra.error ?? null, Date.now(), hash);
  }

  close(): void {
    this.db.close();
  }
}
