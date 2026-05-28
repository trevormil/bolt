// @vellum/cli — the local-first terminal surface (#34). The `vellum` binary
// (src/cli.ts) drives the shared @vellum/engine over ~/.vellum: an interactive
// REPL plus scriptable subcommands. Same engine as web + Telegram, so memory,
// vaults, budgets, and the ledger are identical across surfaces.
export { runCommand } from "./commands.ts";
export { repl } from "./repl.ts";
