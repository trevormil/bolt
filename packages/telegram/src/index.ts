import { env, createLogger } from "@vellum/shared";

const log = createLogger("telegram");

// Scaffold entrypoint. The grammY bot (primary surface) lands in ticket 0003.
if (env.TELEGRAM_BOT_TOKEN) {
  log.info("scaffold ready · bot token present");
} else {
  log.info(
    "scaffold ready · no TELEGRAM_BOT_TOKEN yet (set in .env for ticket 0003)",
  );
}
