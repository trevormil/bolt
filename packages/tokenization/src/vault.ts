import { buildVault } from "bitbadges";
import { signAndBroadcast, type MsgJson } from "@vellum/chain";
import { createLogger } from "@vellum/shared";

const log = createLogger("tokenization");

type Adapter = Parameters<typeof signAndBroadcast>[0];

// Configurable withdrawal gating (#45 slice 2). Constrains the AGENT, never the
// recipient. `amount` is a rolling per-period spend cap; `time.unlockAt` makes
// withdrawals invalid until an epoch-ms unlock. (Multi-sig via votingChallenges
// is slice 3.) These compile to the withdrawal approval's approvalCriteria.
export type GatingPeriod = "daily" | "weekly" | "monthly";
export interface VaultGating {
  amount?: { limitUsd: number; period: GatingPeriod };
  time?: { unlockAt?: number }; // epoch ms; withdrawals invalid before this
  // Multi-sig (#45 slice 3) via BitBadges votingChallenges: a withdrawal needs
  // N-of-M signer yes-weight (quorumThreshold) before it executes; each signer's
  // MsgCastVote IS a signature. resetAfterExecution → fresh quorum per withdrawal.
  multisig?: {
    signers: { address: string; weight?: number }[];
    threshold: number; // total yes-weight required (the N in N-of-M)
    challengeDelayMs?: number; // optional timelock after quorum, before execute
  };
}

// Deterministic proposal id for a vault's reusable withdrawal vote (one
// challenge, re-tallied each withdrawal via resetAfterExecution).
export const VAULT_WITHDRAW_PROPOSAL_ID = "vault-withdraw-vote";

const PERIOD_MS: Record<GatingPeriod, number> = {
  daily: 86_400_000,
  weekly: 604_800_000,
  monthly: 2_592_000_000, // 30d (rolling, matches the #44 budget windows)
};
const MAX_UINT64 = "18446744073709551615";

export interface CreateVaultInput {
  name: string;
  symbol: string; // e.g. vUSDC
  description: string;
  image: string;
  // The HUMAN principal — set as the collection manager. canUpdateManager is
  // permanently forbidden by buildVault, so the agent (creator) has ZERO manager
  // capability and the manager can never be reassigned (the 0012 trust property).
  managerAddress: string;
  // Agent guardrails ONLY (vaults are siloed — never gate recipients, since the
  // agent unwraps to base USDC and vendors take base USDC). Time/amount-gating
  // and votingChallenges constrain the AGENT, not who receives.
  dailyWithdrawLimit?: number; // legacy single daily cap; 0/undefined = unlimited
  gating?: VaultGating; // #45 slice 2 — supersedes dailyWithdrawLimit when set
  require2fa?: string; // 2FA collection id gating withdrawals
  emergencyRecovery?: string; // bb1 recovery address
}

/**
 * Compile a gating policy onto a built vault msg by editing the withdrawal-tier
 * approvalCriteria (#45 slice 2). Pure — mutates + returns the msg. The
 * withdrawal approval is the one whose approvalId starts with "vault-withdraw".
 * amount → rolling per-period approvalAmounts; time.unlockAt → transferTimes.
 */
export function applyGating(
  msg: MsgJson,
  gating: VaultGating,
  now: number = Date.now(),
): MsgJson {
  const approvals =
    (msg.value as { collectionApprovals?: Record<string, unknown>[] })
      .collectionApprovals ?? [];
  const wd = approvals.find(
    (a) =>
      typeof a.approvalId === "string" &&
      (a.approvalId as string).startsWith("vault-withdraw"),
  );
  if (!wd) throw new Error("vault msg has no withdrawal approval to gate");
  const criteria = (wd.approvalCriteria ?? {}) as Record<string, unknown>;

  if (gating.amount) {
    criteria.approvalAmounts = {
      overallApprovalAmount: "0",
      perToAddressApprovalAmount: "0",
      perFromAddressApprovalAmount: "0",
      perInitiatedByAddressApprovalAmount: String(
        Math.round(gating.amount.limitUsd * 1e6),
      ),
      amountTrackerId: `withdrawal-${gating.amount.period}`,
      resetTimeIntervals: {
        startTime: String(now),
        intervalLength: String(PERIOD_MS[gating.amount.period]),
      },
    };
  }
  if (gating.time?.unlockAt != null) {
    wd.transferTimes = [
      { start: String(gating.time.unlockAt), end: MAX_UINT64 },
    ];
  }
  if (gating.multisig) {
    // The withdrawal carries a voting challenge: it executes only once signers
    // cast >= quorumThreshold of yes-weight. resetAfterExecution re-arms the
    // tally so each withdrawal needs fresh sign-off.
    criteria.votingChallenges = [
      {
        proposalId: VAULT_WITHDRAW_PROPOSAL_ID,
        quorumThreshold: String(gating.multisig.threshold),
        voters: gating.multisig.signers.map((s) => ({
          address: s.address,
          weight: String(s.weight ?? 1),
        })),
        uri: "",
        customData: "",
        resetAfterExecution: true,
        delayAfterQuorum: String(gating.multisig.challengeDelayMs ?? 0),
      },
    ];
  }
  wd.approvalCriteria = criteria;
  return msg;
}

const FOREVER = [{ start: "1", end: MAX_UINT64 }];

// Manager-admin approval ids (#45 slice 4).
export const VAULT_MANAGER_WITHDRAW_APPROVAL_ID = "vault-manager-withdraw";
export const VAULT_MANAGER_REVOKE_APPROVAL_ID = "vault-manager-revoke";

/**
 * Manager = complete admin (#45 slice 4). Adds two collection approvals that
 * ONLY the human manager can initiate, independent of the agent's gated
 * withdrawal (no amount/time/vote limits apply to the manager):
 *
 *  1. `vault-manager-withdraw` — the manager can burn ANY circulating vault
 *     tokens back to the backing (→ release USDC), draining/"archiving" the
 *     vault. `overridesFromOutgoingApprovals` lets it burn the agent's holdings
 *     without the agent's consent.
 *  2. `vault-manager-revoke` — forceful clawback: move the agent's vault tokens
 *     to the manager, with `overridesFromOutgoingApprovals` +
 *     `overridesToIncomingApprovals` so neither side's user approval is needed.
 *
 * The agent never gets these (initiatedBy is the manager address only).
 */
export function applyManagerAdmin(
  msg: MsgJson,
  managerAddress: string,
): MsgJson {
  const value = msg.value as {
    collectionApprovals?: Record<string, unknown>[];
  };
  const backingAddr = (value.collectionApprovals ?? []).find(
    (a) =>
      typeof a.approvalId === "string" &&
      (a.approvalId as string).startsWith("vault-withdraw"),
  )?.toListId as string | undefined;
  const base = {
    initiatedByListId: managerAddress,
    customData: "",
    transferTimes: FOREVER,
    tokenIds: FOREVER,
    ownershipTimes: FOREVER,
    version: "0",
  };
  value.collectionApprovals = [
    ...(value.collectionApprovals ?? []),
    {
      ...base,
      fromListId: "!Mint", // burn circulating tokens → backing (release USDC)
      toListId: backingAddr,
      approvalId: VAULT_MANAGER_WITHDRAW_APPROVAL_ID,
      approvalCriteria: {
        mustPrioritize: true,
        allowBackedMinting: true,
        overridesFromOutgoingApprovals: true,
      },
    },
    {
      ...base,
      fromListId: "!Mint", // claw circulating tokens (the agent's) → manager
      toListId: managerAddress,
      approvalId: VAULT_MANAGER_REVOKE_APPROVAL_ID,
      approvalCriteria: {
        mustPrioritize: true,
        overridesFromOutgoingApprovals: true,
        overridesToIncomingApprovals: true,
      },
    },
  ];
  return msg;
}

/**
 * Build the vault-create message: a 1:1 USDC-backed Smart Token collection.
 * Agent is the creator (signer); the human is the manager. Pure — no I/O — so
 * it's unit-testable; createVault() signs + broadcasts it.
 */
export function buildVaultMsg(
  agentAddress: string,
  input: CreateVaultInput,
): MsgJson {
  const msg = buildVault({
    backingCoin: "USDC",
    name: input.name,
    symbol: input.symbol,
    description: input.description,
    image: input.image,
    // Only an explicit gating.amount supersedes the SDK's daily cap. A gating
    // policy WITHOUT an amount (e.g. time-only) must NOT suppress the legacy
    // dailyWithdrawLimit — otherwise the vault would be left uncapped.
    dailyWithdrawLimit: input.gating?.amount
      ? undefined
      : input.dailyWithdrawLimit,
    require2fa: input.require2fa,
    emergencyRecovery: input.emergencyRecovery,
  }) as MsgJson;
  // The SDK builder leaves both blank — the agent signs (creator); the human owns
  // the manager role (frozen via the builder's canUpdateManager = forbidden).
  msg.value.creator = agentAddress;
  msg.value.manager = input.managerAddress;
  if (input.gating) applyGating(msg, input.gating);
  // The manager always gets complete-admin approvals (#45 slice 4).
  applyManagerAdmin(msg, input.managerAddress);
  return msg;
}

/**
 * Agent creates a 1:1 USDC-backed vault on-chain. The agent does the heavy
 * lifting (build + sign + broadcast); the human is the manager and funds escrow
 * separately. Returns the broadcast tx hash — confirm + ledger out of band.
 */
export async function createVault(
  agent: Adapter,
  input: CreateVaultInput,
): Promise<{ txHash: string }> {
  const msg = buildVaultMsg(agent.address, input);
  const txHash = await signAndBroadcast(agent, [msg], {
    memo: "vellum vault create",
  });
  log.info(
    `vault create · ${input.symbol} · manager ${input.managerAddress} · ${txHash.slice(0, 10)}`,
  );
  return { txHash };
}

const FULL_RANGE = [{ start: "1", end: "18446744073709551615" }];

/**
 * A vault back/unback transfer (0013). Moving vault tokens TO the backing
 * address unbacks (burn → release base USDC to the initiator); moving FROM it
 * backs (mint → initiator provides USDC). 1 token = 1 µUSDC (1:1 conversion).
 * Pure msg builder — createVault's withdrawal-tier approval enforces the agent
 * guardrails (daily cap etc.) at execution. amount is in µUSDC.
 */
export function vaultTransferMsg(input: {
  agentAddress: string;
  collectionId: string;
  from: string;
  to: string;
  amount: string; // µUSDC (= token amount, 1:1)
  approvalId: string;
}): MsgJson {
  return {
    typeUrl: "/tokenization.MsgTransferTokens",
    value: {
      creator: input.agentAddress,
      collectionId: input.collectionId,
      transfers: [
        {
          from: input.from,
          toAddresses: [input.to],
          balances: [
            {
              amount: input.amount,
              tokenIds: [{ start: "1", end: "1" }],
              ownershipTimes: FULL_RANGE,
            },
          ],
          prioritizedApprovals: [
            {
              approvalId: input.approvalId,
              approvalLevel: "collection",
              approverAddress: "",
              version: "0",
            },
          ],
          onlyCheckPrioritizedCollectionApprovals: true,
        },
      ],
    },
  };
}

export interface VaultRef {
  collectionId: string;
  backingAddress: string;
  withdrawApprovalId: string;
}

interface TxEvent {
  type: string;
  attributes: { key: string; value: string }[];
}

/**
 * Parse a confirmed create-vault tx (LCD `tx_response`) into a VaultRef: the new
 * collectionId (from the `message.collectionId` event attr) + the backing address
 * & withdraw approvalId (from the create msg's approvals). The withdraw approval's
 * toListId IS the backing address.
 */
export function vaultRefFromTx(txResponse: { events?: TxEvent[] }): VaultRef {
  let collectionId = "";
  let msg: {
    collectionApprovals?: { approvalId?: string; toListId?: string }[];
  } | null = null;
  for (const e of txResponse.events ?? []) {
    if (e.type !== "message") continue;
    for (const a of e.attributes ?? []) {
      if (a.key === "collectionId") collectionId = a.value;
      if (a.key === "msg") {
        try {
          msg = JSON.parse(a.value);
        } catch {
          /* ignore */
        }
      }
    }
  }
  const withdraw = (msg?.collectionApprovals ?? []).find((a) =>
    a.approvalId?.startsWith("vault-withdraw"),
  );
  if (!collectionId || !withdraw?.approvalId || !withdraw.toListId) {
    throw new Error("could not parse vault ref from create tx");
  }
  return {
    collectionId,
    backingAddress: withdraw.toListId,
    withdrawApprovalId: withdraw.approvalId,
  };
}

/** Agent withdraws (unbacks) `amount` µUSDC from a vault — within the vault's
 *  on-chain guardrails (the withdrawal-tier approval rejects over-cap). The base
 *  USDC lands in the agent's wallet; spending onward to a vendor is a bank send. */
export async function vaultWithdraw(
  agent: Adapter,
  vault: VaultRef,
  amount: string,
): Promise<{ txHash: string }> {
  const msg = vaultTransferMsg({
    agentAddress: agent.address,
    collectionId: vault.collectionId,
    from: agent.address,
    to: vault.backingAddress,
    amount,
    approvalId: vault.withdrawApprovalId,
  });
  const txHash = await signAndBroadcast(agent, [msg], {
    memo: "vellum vault withdraw",
  });
  log.info(
    `vault withdraw · ${vault.collectionId} · ${amount}µUSDC · ${txHash.slice(0, 10)}`,
  );
  return { txHash };
}

/** Back (deposit) `amount` µUSDC into a vault — the initiator provides USDC and
 *  receives vault tokens. (For tests/funding; the human funds escrow in prod.) */
export async function vaultDeposit(
  agent: Adapter,
  vault: { collectionId: string; backingAddress: string },
  amount: string,
): Promise<{ txHash: string }> {
  const msg = vaultTransferMsg({
    agentAddress: agent.address,
    collectionId: vault.collectionId,
    from: vault.backingAddress,
    to: agent.address,
    amount,
    approvalId: "vault-deposit",
  });
  const txHash = await signAndBroadcast(agent, [msg], {
    memo: "vellum vault deposit",
  });
  log.info(
    `vault deposit · ${vault.collectionId} · ${amount}µUSDC · ${txHash.slice(0, 10)}`,
  );
  return { txHash };
}
