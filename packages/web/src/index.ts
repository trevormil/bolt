import { createLogger } from "@vellum/shared";

const log = createLogger("web");

// Scaffold entrypoint. The companion web app (Vite SPA + Hono API — onboarding,
// vault/budget/ledger, streamlined sign pages) lands in tickets 0015-0017.
log.info("scaffold ready · Vite+Hono app to be built (tickets 0015-0017)");
