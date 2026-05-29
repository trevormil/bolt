// Bun test preload (see bunfig.toml). Sets offline placeholders for the secrets
// the shared env layer expects, so the unit suite is hermetic — green on a clean
// checkout / CI with no .env and no exported secrets. Only fills values that are
// genuinely unset, so a real local .env still wins.
//
// AGENT_SIGNER_MNEMONIC is a standard, well-known BIP39 test vector — never a
// real key. Tests that assert the "missing secret" path pass an explicit empty
// value or parse a fresh schema, so they're unaffected by these defaults.
process.env.OPENROUTER_API_KEY ??= "test-offline-key";
process.env.AGENT_SIGNER_MNEMONIC ??=
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
// Force the env-only secret backend (ADR-0007) so the unit suite NEVER shells out
// to the real macOS keychain — resolution depends only on the env above (or a
// fake backend a test injects), keeping it hermetic + deterministic.
process.env.VELLUM_SECRET_BACKEND ??= "env";
// Default DBs to in-memory in tests so a default VELLUM_DB_PATH (now ~/.vellum,
// #39) never touches the real filesystem. Tests that need a file pass an explicit
// path; most inject ":memory:" directly.
process.env.VELLUM_DB_PATH ??= ":memory:";
