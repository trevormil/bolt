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
  // No `kind` override: spend() is always kind "spend" so it always hits the
  // capability gate. Other kinds (vault_op, funding) go through submit() directly.
  authority?: string; // who authorized — default "agent"
  trace?: TraceSpan; // optional tracing parent (no-op by default)
}

// Structural capability gate (#37) — kept structural so @vellum/tx doesn't
// depend on @vellum/capabilities. The engine injects authorizer.authorizeOrThrow;
// it throws (CapabilityDeniedError) when the action is denied. Absent → no gate
// (tests / non-gated callers).
export type TxAuthorize = (
  personaId: string,
  action: { capability: string; target?: string; summary: string },
) => Promise<void>;

export interface TxManagerOptions {
  wallets: PersonaWallets;
  ledger: Ledger;
  dbPath?: string;
  denom?: string; // defaults to env.VELLUM_DENOM (USDC)
  chain?: TxChain;
  authorize?: TxAuthorize; // gate free-form spend at the chokepoint (#37)
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

// Structural guards for free-form spends (#65 review). A FULL bb1 recipient (not
// just the "bb1" prefix) and a strictly-positive integer µ-amount (rejects "0",
// "-1", "1.5", "abc"). Exported so each spend surface can return a clean
// 400/tool/chat message at its boundary while TxManager.spend stays the final
// chokepoint that no malformed input can slip past.
export const isBb1Address = (addr: string): boolean =>
  /^bb1[0-9a-z]{38,}$/.test(addr);
export const isPositiveMicroAmount = (amount: string): boolean =>
  /^[1-9][0-9]*$/.test(amount);

// A transaction that can't proceed and definitively moved no value (#85): a
// pre-flight CheckTx rejection (over a vault cap / outside the time window /
// missing multisig sign-off / bad sig) or a failed balance pre-check. Distinct
// from a raw/ambiguous error so every surface (web routes, agent tools, Telegram)
// can map it to a clean 4xx / plain message instead of a 500 / opaque failure.
export class TxRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TxRejectedError";
  }
}

export class TxManager {
  private db: Database;
  private wallets: PersonaWallets;
  private ledger: Ledger;
  private denom: string;
  private chain: TxChain;
  private authorize?: TxAuthorize;
  private locks = new Map<string, Promise<void>>();

  constructor(opts: TxManagerOptions) {
    this.wallets = opts.wallets;
    this.ledger = opts.ledger;
    this.denom = opts.denom ?? env.VELLUM_DENOM;
    this.chain = opts.chain ?? DEFAULT_CHAIN;
    this.authorize = opts.authorize;
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
    // Capability chokepoint (#37): EVERY free-form spend passes through submit(),
    // so gating here means no public entry (spend() or a direct submit()) can
    // bypass the authorizer. Throws CapabilityDeniedError when denied; surfaces
    // catch it → 403. vault_op is gated upstream in VaultService; funding is
    // incoming value (not gated). Gate before acquiring the lock so a denial
    // never holds the per-persona mutex.
    if (kind === "spend") {
      await this.authorize?.(personaId, {
        capability: "spend",
        target: to,
        summary: `spend ${usdc(amount)} → ${to}`,
      });
    }
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
        releaseOnce();
        if (/rejected/.test(error)) {
          // Definitive CheckTx rejection (over a vault cap / time-locked / missing
          // sign-off / bad sig) — nothing landed; fail the row and surface a typed,
          // user-mappable error instead of the raw chain string (#85).
          this.setStatus(id, "failed", { error });
          throw new TxRejectedError(error);
        }
        // Ambiguous (network) — the tx MAY have reached the node. Leave the intent
        // "submitting" (discoverable, never auto-rebroadcast) and rethrow as-is.
        this.setStatus(id, "submitting", { error });
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
    // Structural input guards at THE chokepoint (#65 review): a malformed bb1
    // recipient or a zero/non-integer amount must never reach the signing +
    // broadcast lifecycle, even when a surface's own check is weaker. Every spend
    // surface (web /spend, agent send_usdc, Telegram /spend) funnels through here.
    if (!isBb1Address(to)) throw new Error(`invalid recipient address: ${to}`);
    if (!isPositiveMicroAmount(amount))
      throw new Error(
        `invalid amount (a positive integer of µUSDC is required): ${amount}`,
      );
    // Note: the capability gate lives in submit() (the true chokepoint) so a
    // direct submit({kind:"spend"}) can't bypass it either.
    const from = this.wallets.addressFor(personaId);
    if (!from) throw new Error(`no wallet for persona: ${personaId}`);
    // Friendly pre-check (CheckTx is authoritative, but this reads better).
    const have = BigInt(
      (await this.chain.getBalances(from)).find((c) => c.denom === this.denom)
        ?.amount ?? "0",
    );
    if (have < BigInt(amount)) {
      throw new TxRejectedError(
        `insufficient USDC: have ${usdc(have.toString())}, need ${usdc(amount)}`,
      );
    }
    // ALWAYS kind "spend" — spend() is the free-form bank-send path and must
    // always pass the capability gate in submit(). The kind is not caller-
    // overridable here, so a vault_op/funding label can't be used to skip it.
    return this.submit({
      personaId,
      kind: "spend",
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

  /**
   * Re-drive broadcast txs that the initial out-of-band confirm left PENDING —
   * a commit that landed AFTER confirmTx's window (#81). Only sweeps rows whose
   * hash is recorded and that haven't been touched for `staleMs`, so it never
   * races the in-flight initial confirm (which keeps `updated` fresh while it
   * polls). Returns how many it re-drove.
   */
  async reconcileStale(staleMs: number): Promise<number> {
    const cutoff = Date.now() - staleMs;
    const stale = this.pending().filter(
      (p) => p.status === "pending" && p.hash && p.updated <= cutoff,
    );
    for (const p of stale) await this.confirmPending(p.id);
    return stale.length;
  }

  /**
   * Periodic safety net behind submit()'s one-shot confirm: without it a tx that
   * commits after confirmTx times out would sit PENDING until the next daemon
   * restart's reconcile() — the withdrawal-stuck-pending bug (#81). A PENDING row
   * also blocks the persona's next tx (the durable guard), so an orphaned confirm
   * freezes the wallet entirely. Sweeps stale-pending rows every `intervalMs`;
   * non-overlapping (skips a tick if the prior sweep is still running) and the
   * timer is unref'd so it never keeps the process alive on its own. Returns a
   * stop handle for clean shutdown.
   */
  startAutoReconcile(intervalMs = 15_000, staleMs = 20_000): () => void {
    let sweeping = false;
    const timer = setInterval(() => {
      if (sweeping) return;
      sweeping = true;
      void this.reconcileStale(staleMs)
        .then((n) => {
          if (n) log.info(`auto-reconcile re-drove ${n} stale pending tx`);
        })
        .catch((e) => log.warn(`auto-reconcile sweep failed: ${e}`))
        .finally(() => {
          sweeping = false;
        });
    }, intervalMs);
    (timer as unknown as { unref?: () => void }).unref?.();
    return () => clearInterval(timer);
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
