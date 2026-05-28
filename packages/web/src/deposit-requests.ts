import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";

// Pending vault deposit requests (#62) — the "fund this vault" analog of payment
// requests (0014). The agent (or the user) raises a request to fund a specific
// vault's escrow; the funder signs `vaultDepositMsg` inline in the web app
// (Keplr) or by opening the /deposit/:id link elsewhere. Mirrors PaymentRequests
// closely — same shape and trust posture — but carries the vault context the
// /deposit page needs to build the deposit tx (collectionId + backingAddress +
// the agent recipient).
//
// This store holds ONLY outstanding (pending) requests: a row existing IS the
// "pending" status. On fulfilment the row is deleted — the deposit itself is the
// funder's on-chain tx (the permanent trail), so filled requests aren't kept
// around to bloat the store.
export interface DepositRequest {
  id: string;
  personaId: string;
  collectionId: string;
  vaultSymbol: string;
  vaultName: string;
  backingAddress: string;
  agentAddress: string; // recipient of the minted vault tokens (the persona)
  denom: string;
  amount: string; // base µUSDC
  memo: string;
  created: number;
}

interface Row {
  id: string;
  persona_id: string;
  collection_id: string;
  vault_symbol: string;
  vault_name: string;
  backing_addr: string;
  agent_addr: string;
  denom: string;
  amount: string;
  memo: string;
  created: number;
}
const toReq = (r: Row): DepositRequest => ({
  id: r.id,
  personaId: r.persona_id,
  collectionId: r.collection_id,
  vaultSymbol: r.vault_symbol,
  vaultName: r.vault_name,
  backingAddress: r.backing_addr,
  agentAddress: r.agent_addr,
  denom: r.denom,
  amount: r.amount,
  memo: r.memo,
  created: r.created,
});

export class DepositRequests {
  private db: Database;

  constructor(dbPath = ":memory:") {
    this.db = new Database(dbPath);
    this.db.run(`CREATE TABLE IF NOT EXISTS deposit_requests (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL,
      collection_id TEXT NOT NULL,
      vault_symbol TEXT NOT NULL,
      vault_name TEXT NOT NULL,
      backing_addr TEXT NOT NULL,
      agent_addr TEXT NOT NULL,
      denom TEXT NOT NULL,
      amount TEXT NOT NULL,
      memo TEXT NOT NULL DEFAULT '',
      created INTEGER NOT NULL)`);
  }

  create(input: {
    personaId: string;
    collectionId: string;
    vaultSymbol: string;
    vaultName: string;
    backingAddress: string;
    agentAddress: string;
    denom: string;
    amount: string;
    memo?: string;
  }): DepositRequest {
    const id = randomUUID();
    const created = Date.now();
    this.db
      .query(
        `INSERT INTO deposit_requests (id, persona_id, collection_id, vault_symbol, vault_name, backing_addr, agent_addr, denom, amount, memo, created)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.personaId,
        input.collectionId,
        input.vaultSymbol,
        input.vaultName,
        input.backingAddress,
        input.agentAddress,
        input.denom,
        input.amount,
        input.memo ?? "",
        created,
      );
    return this.get(id)!;
  }

  get(id: string): DepositRequest | null {
    const r = this.db
      .query("SELECT * FROM deposit_requests WHERE id = ?")
      .get(id) as Row | null;
    return r ? toReq(r) : null;
  }

  listForPersona(personaId: string): DepositRequest[] {
    return (
      this.db
        .query(
          "SELECT * FROM deposit_requests WHERE persona_id = ? ORDER BY created DESC",
        )
        .all(personaId) as Row[]
    ).map(toReq);
  }

  /** Remove a request — on fulfilment (the funder's deposit is on-chain) or dismissal. */
  delete(id: string): void {
    this.db.query("DELETE FROM deposit_requests WHERE id = ?").run(id);
  }

  close(): void {
    this.db.close();
  }
}
