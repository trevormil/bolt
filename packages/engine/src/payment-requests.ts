import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";

// Pending payment requests (0014) — the Stripe-link analog. The agent (or the
// user) raises a request to fund a persona; the human pays it inline in the web
// app (Keplr) or by opening the /pay/:id link elsewhere. The agent never pulls
// funds.
//
// Lives in @vellum/engine (not the web layer) so every surface — web routes, the
// agent's request_funds tool, Telegram — shares ONE instance (#67). This store
// holds ONLY outstanding (pending) requests: a row existing IS the "pending"
// status. On fulfilment the funding is recorded in the ledger (the permanent
// trail) and the request row is deleted — filled requests aren't kept around to
// bloat the store.
export interface PaymentRequest {
  id: string;
  personaId: string;
  toAddress: string; // the persona's bb1 wallet
  denom: string;
  amount: string; // base µUSDC
  memo: string; // human-readable, shown on the /pay/:id page (description)
  created: number;
}

/**
 * The CANONICAL tx-memo that must appear in the chain tx confirming this
 * request (#101 replay defense). Distinct from the human-readable
 * PaymentRequest.memo field (which describes WHY funding is needed): this is
 * the on-chain binding between a tx and a request, asserted in `verifyCredit`.
 * If Alice's payer signs a tx whose body memo is `vellum funding <Alice-id>`,
 * Bob's tx that coincidentally credits the same persona address CANNOT be
 * replayed to mark Alice's request filled.
 */
export const paymentRequestTxMemo = (reqId: string): string =>
  `vellum funding ${reqId}`;

interface Row {
  id: string;
  persona_id: string;
  to_addr: string;
  denom: string;
  amount: string;
  memo: string;
  created: number;
}
const toReq = (r: Row): PaymentRequest => ({
  id: r.id,
  personaId: r.persona_id,
  toAddress: r.to_addr,
  denom: r.denom,
  amount: r.amount,
  memo: r.memo,
  created: r.created,
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
      created INTEGER NOT NULL)`);
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
        `INSERT INTO payment_requests (id, persona_id, to_addr, denom, amount, memo, created)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
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

  /** Remove a request — on fulfilment (funding now in the ledger) or dismissal. */
  delete(id: string): void {
    this.db.query("DELETE FROM payment_requests WHERE id = ?").run(id);
  }

  close(): void {
    this.db.close();
  }
}
