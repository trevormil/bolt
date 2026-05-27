import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";

// One-time-use payment requests (0014) — the Stripe-link analog. The agent (or
// the user) raises a request to fund a persona; the human opens the link and
// signs a USDC transfer to the persona's wallet from their OWN (Keplr) wallet.
// The agent never pulls funds. On confirmation the funded amount lands in the
// persona's global balance and a `funding` ledger entry is recorded.
export type PaymentRequestStatus = "pending" | "paid";

export interface PaymentRequest {
  id: string;
  personaId: string;
  toAddress: string; // the persona's bb1 wallet
  denom: string;
  amount: string; // base µUSDC
  memo: string;
  status: PaymentRequestStatus;
  txHash: string | null;
  created: number;
  paidAt: number | null;
}

interface Row {
  id: string;
  persona_id: string;
  to_addr: string;
  denom: string;
  amount: string;
  memo: string;
  status: string;
  tx_hash: string | null;
  created: number;
  paid_at: number | null;
}
const toReq = (r: Row): PaymentRequest => ({
  id: r.id,
  personaId: r.persona_id,
  toAddress: r.to_addr,
  denom: r.denom,
  amount: r.amount,
  memo: r.memo,
  status: r.status as PaymentRequestStatus,
  txHash: r.tx_hash,
  created: r.created,
  paidAt: r.paid_at,
});

export class PaymentRequests {
  private db: Database;

  constructor(dbPath = ":memory:") {
    this.db = new Database(dbPath);
    this.db.run(`CREATE TABLE IF NOT EXISTS payment_requests (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL,
      to_addr TEXT NOT NULL,
      denom TEXT NOT NULL,
      amount TEXT NOT NULL,
      memo TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      tx_hash TEXT,
      created INTEGER NOT NULL,
      paid_at INTEGER)`);
  }

  create(input: {
    personaId: string;
    toAddress: string;
    denom: string;
    amount: string;
    memo?: string;
  }): PaymentRequest {
    const id = randomUUID();
    const created = Date.now();
    this.db
      .query(
        `INSERT INTO payment_requests (id, persona_id, to_addr, denom, amount, memo, status, created)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run(
        id,
        input.personaId,
        input.toAddress,
        input.denom,
        input.amount,
        input.memo ?? "",
        created,
      );
    return this.get(id)!;
  }

  get(id: string): PaymentRequest | null {
    const r = this.db
      .query("SELECT * FROM payment_requests WHERE id = ?")
      .get(id) as Row | null;
    return r ? toReq(r) : null;
  }

  listForPersona(personaId: string): PaymentRequest[] {
    return (
      this.db
        .query(
          "SELECT * FROM payment_requests WHERE persona_id = ? ORDER BY created DESC",
        )
        .all(personaId) as Row[]
    ).map(toReq);
  }

  /** Mark paid (idempotent — only transitions a pending row). */
  markPaid(id: string, txHash: string): PaymentRequest | null {
    this.db
      .query(
        "UPDATE payment_requests SET status = 'paid', tx_hash = ?, paid_at = ? WHERE id = ? AND status = 'pending'",
      )
      .run(txHash, Date.now(), id);
    return this.get(id);
  }

  close(): void {
    this.db.close();
  }
}
