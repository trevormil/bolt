import { env, createLogger } from "@vellum/shared";

const log = createLogger("agent");

// Scaffold entrypoint. The orchestrator + per-persona sub-agents land in later
// tickets (0005 loop+MCP, 0006 compartments, 0007 routing). For now: boot clean.
log.info(
  `scaffold ready · chain=${env.BITBADGES_CHAIN_ID} · rpc=${env.BITBADGES_RPC}`,
);
