// Public surface of @vellum/shared.
export { env, type Env } from "./env.ts";
export { createLogger } from "./logger.ts";

// Running this package directly (bun run --filter) just validates the env.
if (import.meta.main) {
  const { createLogger } = await import("./logger.ts");
  const { env } = await import("./env.ts");
  createLogger("shared").info(
    `scaffold ready · chain=${env.BITBADGES_CHAIN_ID}`,
  );
}
