import { join } from "node:path";
import {
  env,
  agentMnemonicSource,
  setAgentMnemonic,
  defaultBackend,
  removeEnvKeys,
  SECRET_ACCOUNT,
  type SecretBackend,
} from "@vellum/shared";

// `vellum keys` — manage where the agent's master seed lives at rest (ADR-0007).
// The seed is a hot-wallet key (always agent-accessible, no human unlock); these
// commands move it out of plaintext .env into the OS keychain and report status.
// They NEVER print the seed itself.

export interface KeysDeps {
  envPath?: string; // .env to read/scrub (default: cwd/.env)
  backend?: SecretBackend; // secret store (default: platform)
  // The seed currently in the environment (the loaded .env value). Injectable so
  // migrate is testable without the import-time env snapshot.
  envSeed?: string;
}

/**
 * Move the seed from plaintext .env into the OS keychain and scrub the .env line.
 * Idempotent + safe to re-run: with nothing in env it reports whether the seed is
 * already in the keychain. Returns a human message (never the seed).
 */
export async function migrateSeedToKeychain(opts: {
  seed: string | undefined;
  envPath: string;
  backend: SecretBackend;
}): Promise<{ migrated: boolean; scrubbed: string[]; message: string }> {
  if (!opts.seed) {
    const src = await agentMnemonicSource(opts.backend);
    if (src === "keychain")
      return {
        migrated: false,
        scrubbed: [],
        message: `Seed already in ${opts.backend.name}; nothing in env to migrate.`,
      };
    return {
      migrated: false,
      scrubbed: [],
      message:
        "No seed found in the environment to migrate — run `vellum init` or set AGENT_SIGNER_MNEMONIC first.",
    };
  }
  await setAgentMnemonic(opts.seed, opts.backend);
  const scrubbed = removeEnvKeys(opts.envPath, [SECRET_ACCOUNT]);
  const scrubNote = scrubbed.length
    ? `removed ${SECRET_ACCOUNT} from ${opts.envPath}`
    : `${opts.envPath} had no ${SECRET_ACCOUNT} line to remove`;
  return {
    migrated: true,
    scrubbed,
    message: `Stored the master seed in ${opts.backend.name} and ${scrubNote}. Restart the daemon for it to take effect.`,
  };
}

/** Dispatch `vellum keys <status|migrate>`. Returns text to print. */
export async function runKeysCommand(
  argv: string[],
  deps: KeysDeps = {},
): Promise<string> {
  const sub = argv[0];
  const backend = deps.backend ?? defaultBackend();
  const envPath = deps.envPath ?? join(process.cwd(), ".env");

  switch (sub) {
    case "status": {
      const src = await agentMnemonicSource(backend);
      const where =
        src === "env"
          ? `plaintext env (.env) — run \`vellum keys migrate\` to move it into ${backend.name}`
          : src === "keychain"
            ? `OS secret store (${backend.name})`
            : "not configured";
      return `agent signer seed: ${where}\nsecret backend:    ${backend.name}`;
    }
    case "migrate": {
      const seed = deps.envSeed ?? env.AGENT_SIGNER_MNEMONIC;
      const r = await migrateSeedToKeychain({ seed, envPath, backend });
      return r.message;
    }
    default:
      return "usage: vellum keys <status|migrate>";
  }
}
