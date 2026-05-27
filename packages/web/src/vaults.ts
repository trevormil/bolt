import { Database } from "bun:sqlite";
import { confirmTx as chainConfirmTx } from "@vellum/chain";
import {
  createVault as tokCreateVault,
  vaultRefFromTx,
  vaultTransferMsg,
} from "@vellum/tokenization";
import type { Ledger } from "@vellum/ledger";
import type { PersonaWallets, Signer } from "@vellum/wallet";
import type { PendingTx, TxManager } from "@vellum/tx";
import { env, createLogger } from "@vellum/shared";

const log = createLogger("vaults");

export interface VaultRecord {
  personaId: string;
  collectionId: string;
  backingAddress: string;
  withdrawApprovalId: string;
  symbol: string;
  name: string;
  created: number;
}

export interface CreateVaultRequest {
  name: string;
  symbol: string;
  description?: string;
  dailyWithdrawLimit?: number;
  managerAddress?: string; // defaults to env.VELLUM_PRINCIPAL_ADDRESS
}

// Injectable so the service is unit-testable without the network.
export interface VaultServiceDeps {
  dbPath?: string;
  wallets: PersonaWallets;
  ledger: Ledger;
  txManager: TxManager;
  createVault?: typeof tokCreateVault;
  confirmTx?: typeof chainConfirmTx;
  // Fetch a confirmed tx's LCD response (for parsing the new vault's ids).
  fetchTx?: (hash: string) => Promise<{
    events?: { type: string; attributes: { key: string; value: string }[] }[];
  }>;
  defaultManager?: string; // fallback manager addr (engine passes env.VELLUM_PRINCIPAL_ADDRESS)
}

const DEFAULT_IMAGE = "https://avatars.githubusercontent.com/u/0?v=4";

async function defaultFetchTx(hash: string) {
  const res = await fetch(
    `${env.BITBADGES_LCD}/cosmos/tx/v1beta1/txs/${hash}`,
    {
      signal: AbortSignal.timeout(15_000),
    },
  );
  const json = (await res.json()) as { tx_response?: { events?: never[] } };
  return json.tx_response ?? {};
}

/**
 * Per-persona vault registry + governed create/withdraw. The agent does all the
 * heavy tx lifting; the human is the manager. Vault CREATE awaits confirmation
 * then registers the on-chain ids (setup). WITHDRAW goes through TxManager.submit
 * (vault_op) — the full governed lifecycle (pending → confirm → ledger, mutex).
 */
export class VaultService {
  private db: Database;
  private wallets: PersonaWallets;
  private ledger: Ledger;
  private txManager: TxManager;
  private createVaultFn: typeof tokCreateVault;
  private confirmTx: typeof chainConfirmTx;
  private fetchTx: NonNullable<VaultServiceDeps["fetchTx"]>;
  private defaultManager: string | undefined;

  constructor(deps: VaultServiceDeps) {
    this.wallets = deps.wallets;
    this.ledger = deps.ledger;
    this.txManager = deps.txManager;
    this.createVaultFn = deps.createVault ?? tokCreateVault;
    this.confirmTx = deps.confirmTx ?? chainConfirmTx;
    this.fetchTx = deps.fetchTx ?? defaultFetchTx;
    this.defaultManager = deps.defaultManager ?? env.VELLUM_PRINCIPAL_ADDRESS;
    this.db = new Database(deps.dbPath ?? ":memory:");
    this.db.run(`CREATE TABLE IF NOT EXISTS vaults (
      collection_id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL,
      backing_address TEXT NOT NULL,
      withdraw_approval_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      created INTEGER NOT NULL)`);
  }

  async create(
    personaId: string,
    req: CreateVaultRequest,
  ): Promise<VaultRecord> {
    const manager = req.managerAddress ?? this.defaultManager;
    if (!manager) {
      throw new Error(
        "no vault manager — set VELLUM_PRINCIPAL_ADDRESS (the human) or connect Keplr (0027)",
      );
    }
    const agent: Signer = await this.wallets.signerFor(personaId);
    const { txHash } = await this.createVaultFn(agent, {
      name: req.name,
      symbol: req.symbol,
      description: req.description ?? req.name,
      image: DEFAULT_IMAGE,
      managerAddress: manager,
      dailyWithdrawLimit: req.dailyWithdrawLimit,
    });
    await this.confirmTx(txHash); // setup action — await confirmation
    const ref = vaultRefFromTx(await this.fetchTx(txHash));
    const created = Date.now();
    this.db
      .query(
        `INSERT INTO vaults (collection_id, persona_id, backing_address, withdraw_approval_id, symbol, name, created)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ref.collectionId,
        personaId,
        ref.backingAddress,
        ref.withdrawApprovalId,
        req.symbol,
        req.name,
        created,
      );
    this.ledger.record({
      personaId,
      kind: "vault_op",
      summary: `created vault ${req.symbol} (manager ${manager})`,
      authority: "agent",
      txHash,
      meta: { collectionId: ref.collectionId, manager },
    });
    log.info(
      `vault created · ${personaId} · collection ${ref.collectionId} · ${req.symbol}`,
    );
    return { personaId, ...ref, symbol: req.symbol, name: req.name, created };
  }

  list(personaId: string): VaultRecord[] {
    const rows = this.db
      .query("SELECT * FROM vaults WHERE persona_id = ? ORDER BY created DESC")
      .all(personaId) as {
      collection_id: string;
      persona_id: string;
      backing_address: string;
      withdraw_approval_id: string;
      symbol: string;
      name: string;
      created: number;
    }[];
    return rows.map((r) => ({
      personaId: r.persona_id,
      collectionId: r.collection_id,
      backingAddress: r.backing_address,
      withdrawApprovalId: r.withdraw_approval_id,
      symbol: r.symbol,
      name: r.name,
      created: r.created,
    }));
  }

  get(personaId: string, collectionId: string): VaultRecord | null {
    return (
      this.list(personaId).find((v) => v.collectionId === collectionId) ?? null
    );
  }

  /** Agent withdraws `amount` µUSDC from a vault — governed (vault_op) + within
   *  the vault's on-chain guardrails (over-cap is rejected at CheckTx). */
  async withdraw(
    personaId: string,
    collectionId: string,
    amount: string,
  ): Promise<PendingTx> {
    const v = this.get(personaId, collectionId);
    if (!v)
      throw new Error(`no vault ${collectionId} for persona ${personaId}`);
    const from = this.wallets.addressFor(personaId);
    if (!from) throw new Error(`no wallet for persona: ${personaId}`);
    const msg = vaultTransferMsg({
      agentAddress: from,
      collectionId,
      from,
      to: v.backingAddress,
      amount,
      approvalId: v.withdrawApprovalId,
    });
    return this.txManager.submit({
      personaId,
      kind: "vault_op",
      msgs: [msg],
      to: v.backingAddress,
      amount,
      memo: "vellum vault withdraw",
    });
  }

  close(): void {
    this.db.close();
  }
}
