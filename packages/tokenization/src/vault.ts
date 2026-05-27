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
