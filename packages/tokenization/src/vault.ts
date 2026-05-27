import { buildVault } from "bitbadges";
import { signAndBroadcast, type MsgJson } from "@vellum/chain";
import { createLogger } from "@vellum/shared";

const log = createLogger("tokenization");

type Adapter = Parameters<typeof signAndBroadcast>[0];

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
  dailyWithdrawLimit?: number; // display units; 0/undefined = unlimited
  require2fa?: string; // 2FA collection id gating withdrawals
  emergencyRecovery?: string; // bb1 recovery address
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
    dailyWithdrawLimit: input.dailyWithdrawLimit,
    require2fa: input.require2fa,
    emergencyRecovery: input.emergencyRecovery,
  }) as MsgJson;
  // The SDK builder leaves both blank — the agent signs (creator); the human owns
  // the manager role (frozen via the builder's canUpdateManager = forbidden).
  msg.value.creator = agentAddress;
  msg.value.manager = input.managerAddress;
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
