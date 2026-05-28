// @vellum/engine — wires the agent backend (personas + memory, wallets, routing,
// ledger, tx lifecycle, vaults, budgets) into one object that any surface (web,
// Telegram) drives. Surfaces stay thin; the engine is the shared core.
export { createEngine, type Engine, type EngineOptions } from "./engine.ts";
export {
  VaultService,
  type VaultRecord,
  type CreateVaultRequest,
  type VaultServiceDeps,
} from "./vaults.ts";
export { vaultTools } from "./agent-tools.ts";
export { mcpTools } from "./mcp-tools.ts";
export { Model, APPROVED_MODELS, isApprovedModel } from "./model-setting.ts";
export {
  BudgetLimits,
  BudgetLimitsSchema,
  evaluateBudget,
  type BudgetWindow,
  type BudgetEvaluation,
} from "./budget-setting.ts";
export { filesystemTools, combineTools } from "./fs-tools.ts";
export { scheduleTools } from "./schedule-tools.ts";
export { TaskStore, type Task } from "./tasks.ts";
export { chat, type ChatInput, type ChatResult } from "./chat.ts";
export { llmBudget, type LlmBudget } from "./budgets.ts";
// Re-export capability helpers so surfaces wire grants/approval without a direct
// @vellum/capabilities dep (#37).
export {
  grantDefaultCapabilities,
  CapabilityDeniedError,
  type Grant,
  type Approver,
} from "@vellum/capabilities";

if (import.meta.main) {
  const { createLogger } = await import("@vellum/shared");
  createLogger("engine").info(
    "ready · personas · wallets · routing · ledger · tx · vaults · budgets",
  );
}
