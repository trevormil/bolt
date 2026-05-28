import { Database } from "bun:sqlite";
import { bankSendMsg, confirmTx as chainConfirmTx } from "@vellum/chain";
import {
  createVault as tokCreateVault,
  vaultRefFromTx,
  vaultTransferMsg,
  type VaultGating,
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
  gating: VaultGating | null; // #45 slice 2 — the withdrawal policy, for display
  managerAddress: string; // #45 slice 4 — the human manager (complete admin)
  created: number;
}

export interface CreateVaultRequest {
  name: string;
  symbol: string;
  description?: string;
  dailyWithdrawLimit?: number; // legacy single daily cap
  gating?: VaultGating; // #45 slice 2 — amount (any period) + time unlock
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
  // Capability gate (#37) at the chokepoint — throws if the persona lacks the
  // capability, so a direct VaultService call can't bypass the surface gates.
  authorize?: (
    personaId: string,
    action: { capability: string; target?: string; summary: string },
  ) => Promise<void>;
  // Escrow tracking (#45): read how many of a vault's tokens an address holds in
  // the x/tokenization collection (alias-converted µUSDC). Injectable for tests;
  // defaults to the chain LCD get_balance query. This is the correct per-vault
  // escrow figure — all USDC vaults share one backing alias, so the agent's
  // per-collection token holding (not the shared backing balance) is the slice.
  fetchTokenBalance?: (
    collectionId: string,
    address: string,
  ) => Promise<string>;
}

const DEFAULT_IMAGE = "https://avatars.githubusercontent.com/u/0?v=4";

// A bech32 bb1 recipient (the chain prefix is "bb"). Cheap structural check —
// CheckTx is the authority, but rejecting an obviously-wrong recipient before
// broadcast gives the agent a clean error instead of a chain revert. Mirrors the
// pattern asserted in chain/client.test (/^bb1[0-9a-z]{38,}$/).
function isBb1Address(addr: string): boolean {
  return /^bb1[0-9a-z]{38,}$/.test(addr);
}

// Defensive amount guard (!58): reject anything that isn't a positive integer
// µUSDC string before a bad amount enters the durable tx lifecycle (a failed
// encode could otherwise leave a stuck `submitting` row). The tool boundary
// validates first; this protects direct callers of the service too.
function assertPositiveMicro(amount: string): void {
  if (!/^[1-9][0-9]*$/.test(amount))
    throw new Error(
      `amount must be a positive integer µUSDC (got "${amount}")`,
    );
}

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

// The address's total holding (µUSDC) of a vault's tokens, from the
// x/tokenization get_balance LCD query. Sums the balance entries; returns "0"
// when the address holds none / the query fails (escrow is a read-only display).
async function defaultFetchTokenBalance(
  collectionId: string,
  address: string,
): Promise<string> {
  try {
    const res = await fetch(
      `${env.BITBADGES_LCD}/bitbadges/bitbadgeschain/tokenization/get_balance/${collectionId}/${address}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return "0";
    const json = (await res.json()) as {
      balance?: { balances?: { amount: string }[] };
    };
    const total = (json.balance?.balances ?? []).reduce(
      (sum, b) => sum + BigInt(b.amount || "0"),
      0n,
    );
    return total.toString();
  } catch {
    return "0";
  }
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
  private authorize: VaultServiceDeps["authorize"];
  private fetchTokenBalance: NonNullable<VaultServiceDeps["fetchTokenBalance"]>;

  constructor(deps: VaultServiceDeps) {
    this.authorize = deps.authorize;
    this.wallets = deps.wallets;
    this.ledger = deps.ledger;
    this.txManager = deps.txManager;
    this.createVaultFn = deps.createVault ?? tokCreateVault;
    this.confirmTx = deps.confirmTx ?? chainConfirmTx;
    this.fetchTokenBalance = deps.fetchTokenBalance ?? defaultFetchTokenBalance;
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
      gating TEXT,
      manager_address TEXT NOT NULL DEFAULT '',
      created INTEGER NOT NULL)`);
    // Migrate older DBs that lack the gating / manager_address columns.
    const cols = this.db.query("PRAGMA table_info(vaults)").all() as {
      name: string;
    }[];
    if (!cols.some((c) => c.name === "gating"))
      this.db.run("ALTER TABLE vaults ADD COLUMN gating TEXT");
    if (!cols.some((c) => c.name === "manager_address"))
      this.db.run(
        "ALTER TABLE vaults ADD COLUMN manager_address TEXT NOT NULL DEFAULT ''",
      );
  }

  async create(
    personaId: string,
    req: CreateVaultRequest,
  ): Promise<VaultRecord> {
    await this.authorize?.(personaId, {
      capability: "vault.create",
      summary: `create vault ${req.symbol}`,
    });
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
      gating: req.gating,
    });
    await this.confirmTx(txHash); // setup action — await confirmation
    const ref = vaultRefFromTx(await this.fetchTx(txHash));
    const created = Date.now();
    this.db
      .query(
        `INSERT INTO vaults (collection_id, persona_id, backing_address, withdraw_approval_id, symbol, name, gating, manager_address, created)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ref.collectionId,
        personaId,
        ref.backingAddress,
        ref.withdrawApprovalId,
        req.symbol,
        req.name,
        req.gating ? JSON.stringify(req.gating) : null,
        manager,
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
    return {
      personaId,
      ...ref,
      symbol: req.symbol,
      name: req.name,
      gating: req.gating ?? null,
      managerAddress: manager,
      created,
    };
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
      gating: string | null;
      manager_address: string;
      created: number;
    }[];
    return rows.map((r) => ({
      personaId: r.persona_id,
      collectionId: r.collection_id,
      backingAddress: r.backing_address,
      withdrawApprovalId: r.withdraw_approval_id,
      symbol: r.symbol,
      name: r.name,
      gating: r.gating ? (JSON.parse(r.gating) as VaultGating) : null,
      managerAddress: r.manager_address ?? "",
      created: r.created,
    }));
  }

  get(personaId: string, collectionId: string): VaultRecord | null {
    return (
      this.list(personaId).find((v) => v.collectionId === collectionId) ?? null
    );
  }

  /** Look up a vault by collectionId across all personas (no persona context).
   *  Backs the PUBLIC sign-off page (#45 slice 3) — collectionId + signers are
   *  on-chain/public, so this exposes nothing the chain doesn't already. */
  getByCollection(collectionId: string): VaultRecord | null {
    const r = this.db
      .query("SELECT * FROM vaults WHERE collection_id = ?")
      .get(collectionId) as { persona_id: string } | null;
    return r ? this.get(r.persona_id, collectionId) : null;
  }

  /**
   * Escrow tracking (#45, ADR-0003 rev 2026-05-28): the per-vault escrow is how
   * much of THIS vault's tokens the persona's AGENT WALLET holds in the
   * x/tokenization collection (alias-converted, 1:1 µUSDC). All USDC vaults share
   * one backing alias, so the shared backing balance is the wrong number — the
   * agent's per-collection holding is this vault's slice. Read-only truth from
   * chain; never gates (gating is the on-chain approvalCriteria). Throws if the
   * persona doesn't own the vault.
   */
  async escrow(
    personaId: string,
    collectionId: string,
  ): Promise<{
    collectionId: string;
    backingAddress: string;
    holderAddress: string;
    denom: string;
    escrowedMicro: string;
  }> {
    const v = this.get(personaId, collectionId);
    if (!v)
      throw new Error(`no vault ${collectionId} for persona ${personaId}`);
    const holderAddress = this.wallets.addressFor(personaId);
    if (!holderAddress) throw new Error(`no wallet for persona: ${personaId}`);
    const escrowedMicro = await this.fetchTokenBalance(
      collectionId,
      holderAddress,
    );
    return {
      collectionId,
      backingAddress: v.backingAddress,
      holderAddress,
      denom: env.VELLUM_DENOM,
      escrowedMicro,
    };
  }

  /** Agent withdraws `amount` µUSDC from a vault — governed (vault_op) + within
   *  the vault's on-chain guardrails (over-cap is rejected at CheckTx). */
  async withdraw(
    personaId: string,
    collectionId: string,
    amount: string,
  ): Promise<PendingTx> {
    await this.authorize?.(personaId, {
      capability: "vault.withdraw",
      target: collectionId,
      summary: `withdraw ${amount} from vault ${collectionId}`,
    });
    assertPositiveMicro(amount);
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

  /**
   * Agent pays `amount` µUSDC from a vault DIRECTLY to a recipient — governed
   * (vault_op) and bound by the SAME on-chain withdrawal guardrails as
   * `withdraw` (amount cap / time lock / multi-sig). Over-limit, time-locked, or
   * unsigned-off pays are rejected at CheckTx, never reaching the recipient.
   *
   * SECURITY CRUX (#51): a vault's withdrawal approval is hardcoded
   * `toListId: backingAddr` (buildVault) — vault tokens can ONLY be burned back
   * to the backing alias (releasing base USDC); there is no on-chain approval to
   * move vault tokens to an arbitrary recipient. So a pay is ONE ATOMIC tx of two
   * msgs:
   *   1. the gated withdraw (vaultTransferMsg → backingAddress, prioritizing the
   *      withdrawApprovalId) — the amount/time/multisig criteria are enforced on
   *      THIS leg at CheckTx, identical to `withdraw`;
   *   2. a bank-send of the freed base USDC from the agent wallet → recipient.
   * Because both msgs are in one atomic tx, if leg 1 is rejected by the gating
   * the whole tx reverts and NO money reaches the recipient. The recipient is
   * NEVER named in any approval — the gating constrains the agent's spend rate,
   * not who receives — so adding a recipient cannot widen what the agent may move.
   */
  async pay(
    personaId: string,
    collectionId: string,
    amount: string,
    to: string,
  ): Promise<PendingTx> {
    // Gate on the SAME capability as withdraw — a pay is a gated withdraw plus a
    // bank send of the freed USDC; no separate privilege, no weaker gate.
    await this.authorize?.(personaId, {
      capability: "vault.withdraw",
      target: collectionId,
      summary: `pay ${amount} from vault ${collectionId} to ${to}`,
    });
    assertPositiveMicro(amount);
    if (!isBb1Address(to))
      throw new Error(`invalid recipient address (expected bb1...): ${to}`);
    const v = this.get(personaId, collectionId);
    if (!v)
      throw new Error(`no vault ${collectionId} for persona ${personaId}`);
    const from = this.wallets.addressFor(personaId);
    if (!from) throw new Error(`no wallet for persona: ${personaId}`);
    // Leg 1: gated unback to backing (releases base USDC to the agent). The
    // withdrawal approval's amount/time/multisig criteria gate this msg.
    const unback = vaultTransferMsg({
      agentAddress: from,
      collectionId,
      from,
      to: v.backingAddress,
      amount,
      approvalId: v.withdrawApprovalId,
    });
    // Leg 2: bank-send the freed base USDC → recipient. Same tx → atomic with
    // leg 1: if the gating rejects leg 1, this never executes.
    const send = bankSendMsg(from, to, amount, env.VELLUM_DENOM);
    return this.txManager.submit({
      personaId,
      kind: "vault_op",
      msgs: [unback, send],
      to,
      amount,
      memo: "vellum vault pay",
    });
  }

  close(): void {
    this.db.close();
  }
}
