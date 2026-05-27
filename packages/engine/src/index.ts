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
export { chat, type ChatInput, type ChatResult } from "./chat.ts";
export { llmBudget, type LlmBudget } from "./budgets.ts";

if (import.meta.main) {
  const { createLogger } = await import("@vellum/shared");
  createLogger("engine").info(
    "ready · personas · wallets · routing · ledger · tx · vaults · budgets",
  );
}
