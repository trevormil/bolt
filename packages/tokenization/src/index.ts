// Public surface of @vellum/tokenization: agent-side BitBadges tokenization
// (vaults now; payment requests next) via the `bitbadges` SDK. The agent does
// all heavy tx lifting; the human is the manager + funds escrow.
export {
  createVault,
  buildVaultMsg,
  applyGating,
  applyManagerAdmin,
  VAULT_WITHDRAW_PROPOSAL_ID,
  VAULT_MANAGER_WITHDRAW_APPROVAL_ID,
  VAULT_MANAGER_REVOKE_APPROVAL_ID,
  vaultWithdraw,
  vaultDeposit,
  vaultTransferMsg,
  vaultRefFromTx,
  type CreateVaultInput,
  type VaultGating,
  type GatingPeriod,
  type VaultRef,
} from "./vault.ts";

export {
  vaultGatingSchema,
  parseVaultGating,
  validateGatingTemporal,
  validateGatingForPersona,
  type VaultGatingInput,
} from "./gating-schema.ts";

if (import.meta.main) {
  const { createLogger } = await import("@vellum/shared");
  createLogger("tokenization").info(
    "ready · createVault (1:1 USDC, agent creates / human manager) · SDK direct-broadcast",
  );
}
