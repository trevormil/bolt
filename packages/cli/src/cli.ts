#!/usr/bin/env bun
import { createEngine } from "@vellum/engine";
import { ensureDataDir, env, migrateLegacyDb } from "@vellum/shared";
import { runCommand } from "./commands.ts";
import { repl } from "./repl.ts";
import { initWizard } from "./init-wizard.ts";

// `vellum` CLI entry (#34). Local-first: ensure ~/.vellum, migrate any legacy
// ./vellum.db, then drive the shared engine. No args (or `chat <persona>` with
// no message) → interactive REPL; otherwise a one-shot subcommand.
ensureDataDir();
const argv = process.argv.slice(2);

// `vellum init` — the install/onboarding wizard (#19). Runs BEFORE the engine is
// built, since it establishes the agent mnemonic the engine needs to derive
// wallets; it builds its own engine with the chosen mnemonic.
if (argv[0] === "init") {
  await initWizard();
  process.exit(0);
}

migrateLegacyDb(env.VELLUM_DB_PATH);
const engine = createEngine();

const interactive =
  argv.length === 0 || (argv[0] === "chat" && argv.length === 2);
if (interactive) {
  await repl(engine, argv[1]);
  process.exit(0);
} else {
  try {
    console.log(await runCommand(engine, argv));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
