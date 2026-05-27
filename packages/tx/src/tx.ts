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

// "submitting" = a durable intent persisted BEFORE broadcast (hash not yet known);
// it transitions to "pending" once the hash is recorded. A row stuck "submitting"
// after a crash is discoverable (never a silent on-chain spend with no record).
export type TxStatus = "submitting" | "pending" | "confirmed" | "failed";
export type TxKind = Extract<LedgerKind, "spend" | "funding" | "vault_op">;

export interface PendingTx {
  id: string; // durable op id (PK) — stable across the submit→confirm lifecycle
  hash: string | null; // null until broadcast records it
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
  id: string;
  hash: string | null;
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
  id: r.id,
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
      id TEXT PRIMARY KEY,
      hash TEXT,
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
    this.db.run(
      "CREATE INDEX IF NOT EXISTS idx_tx_persona_status ON tx(persona_id, status)",
    );
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

    // Persist a durable INTENT before broadcast. If the process dies after the
    // chain accepts the tx but before we record the hash, this "submitting" row
    // is still discoverable — never a silent on-chain spend with no record.
    const id = crypto.randomUUID();
    const now = Date.now();
    try {
      // Durable per-persona guard (§13.4): no new tx while ANY row for this
      // persona is unsettled (submitting/pending) — covers confirmation timeouts
      // and crash+restart. The in-memory lock just serializes the guard+insert
      // window so two calls can't both pass.
      if (this.pending(personaId).length > 0) {
        throw new Error(
          `persona ${personaId} has a pending tx — wait for it to settle`,
        );
      }
      this.insert({
        id,
        hash: null,
        personaId,
        kind,
        to,
        denom: this.denom,
        amount,
        authority,
        status: "submitting",
        height: null,
        error: null,
        created: now,
        updated: now,
      });

      const chainSpan = (input.trace ?? NOOP_SPAN).child(`chain:${kind}`, {
        to,
        amount,
      });
      const adapter = await this.wallets.signerFor(personaId);
      let hash: string;
      try {
        // CheckTx rejects pre-flight failures (bad sig, insufficient funds,
        // over-cap) before inclusion. Returns the hash; confirmation is async.
        hash = await this.chain.signAndBroadcast(adapter, msgs, {
          memo: input.memo ?? `vellum ${kind}`,
        });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        if (/rejected/.test(error)) {
          // Definitive CheckTx rejection — nothing landed; safe to fail the row.
          this.setStatus(id, "failed", { error });
        } else {
          // Ambiguous (network) — the tx MAY have reached the node. Leave the
          // intent "submitting" (discoverable, never auto-rebroadcast).
          this.setStatus(id, "submitting", { error });
        }
        releaseOnce();
        throw e;
      }
      chainSpan.end({ hash });
      this.setHash(id, hash); // → status "pending", hash recorded
      log.info(
        `pending ${kind} · ${personaId} · ${usdc(amount)} → ${to} · ${hash.slice(0, 10)}`,
      );

      // Confirm out of band; the lock is held until this settles.
      void this.confirmPending(id).finally(releaseOnce);
      return this.get(id)!;
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
  async confirmPending(id: string): Promise<void> {
    const row = this.get(id);
    // Only rows with a recorded hash ("pending") are confirmable; "submitting"
    // rows have no hash (crash window) and need manual reconciliation.
    if (!row || row.status !== "pending" || !row.hash) return;
    const hash = row.hash;
    try {
      const { height } = await this.chain.confirmTx(hash);
      // Ledger FIRST, then mark confirmed. A crash between the two leaves the row
      // PENDING so reconcile() re-drives it; recordOnchain is idempotent on the
      // txHash, so the retry is a no-op rather than a duplicate ledger entry. The
      // reverse order would lose the entry forever (reconcile skips confirmed rows).
      this.ledger.recordOnchain({
        personaId: row.personaId,
        kind: row.kind,
        summary: `${row.kind} ${usdc(row.amount)} → ${row.to}`,
        authority: row.authority,
        txHash: hash,
        meta: { height, denom: row.denom, amount: row.amount, to: row.to },
      });
      this.setStatus(id, "confirmed", { height });
      log.info(`confirmed ${hash.slice(0, 10)} @ ${height}`);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      if (e instanceof TxRevertedError) {
        this.setStatus(id, "failed", { error });
        log.warn(`failed ${hash.slice(0, 10)}: ${error}`);
      } else {
        // Unknown (timeout/network) — keep PENDING so reconcile retries.
        this.setStatus(id, "pending", { error });
        log.warn(`unconfirmed ${hash.slice(0, 10)}: ${error} — left pending`);
      }
    }
  }

  /** On startup: drive every unsettled row toward terminal state. Rows with a
   *  hash are confirmed; "submitting" rows (no hash) are left for manual review. */
  async reconcile(): Promise<number> {
    const pendings = this.pending();
    for (const p of pendings) await this.confirmPending(p.id);
    if (pendings.length) log.info(`reconciled ${pendings.length} unsettled tx`);
    return pendings.length;
  }

  get(id: string): PendingTx | null {
    const row = this.db
      .query("SELECT * FROM tx WHERE id = ?")
      .get(id) as TxRow | null;
    return row ? toTx(row) : null;
  }
  // Unsettled = submitting OR pending (the per-persona guard blocks new tx while any exists).
  pending(personaId?: string): PendingTx[] {
    const where = "status IN ('submitting','pending')";
    const q = personaId
      ? this.db.query(
          `SELECT * FROM tx WHERE ${where} AND persona_id = ? ORDER BY created`,
        )
      : this.db.query(`SELECT * FROM tx WHERE ${where} ORDER BY created`);
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
        `INSERT INTO tx (id, hash, persona_id, kind, to_addr, denom, amount, authority, status, height, error, created, updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        t.id,
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
  // Record the broadcast hash on the intent → transition submitting → pending.
  private setHash(id: string, hash: string): void {
    this.db
      .query(
        "UPDATE tx SET hash = ?, status = 'pending', updated = ? WHERE id = ?",
      )
      .run(hash, Date.now(), id);
  }
  private setStatus(
    id: string,
    status: TxStatus,
    extra: { height?: number; error?: string },
  ): void {
    this.db
      .query(
        "UPDATE tx SET status = ?, height = ?, error = ?, updated = ? WHERE id = ?",
      )
      .run(status, extra.height ?? null, extra.error ?? null, Date.now(), id);
  }

  close(): void {
    this.db.close();
  }
}
