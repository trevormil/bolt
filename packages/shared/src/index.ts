// Public surface of @vellum/shared.
export { env, setRuntimeEnv, type Env } from "./env.ts";
export { createLogger } from "./logger.ts";
export {
  dataDir,
  dataPath,
  ensureDataDir,
  workspaceDir,
  ensureWorkspaceDir,
  migrateLegacyDb,
} from "./paths.ts";
export { upsertEnvFile } from "./env-file.ts";
export { verifyTelegramToken } from "./telegram-verify.ts";

// Running this package directly (bun run --filter) just validates the env.
if (import.meta.main) {
  const { createLogger } = await import("./logger.ts");
  const { env } = await import("./env.ts");
  createLogger("shared").info(
    `scaffold ready · chain=${env.BITBADGES_CHAIN_ID}`,
  );
}
