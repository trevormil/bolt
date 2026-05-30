import { env } from "./env.ts";
import { createLogger } from "./logger.ts";

const log = createLogger("secrets");

// Keychain coordinates for the agent's master signer seed. Stable so setup,
// migrate, rotate, and status all address the same item.
const KEYCHAIN_SERVICE = "vellum-agent-signer";
export const SECRET_ACCOUNT = "AGENT_SIGNER_MNEMONIC";
// Telegram bot token (#109 §1). Same service entry so the keychain ACL is one
// item the user can audit; distinct account name so the seed and the token
// never alias each other under any backend.
export const TELEGRAM_TOKEN_ACCOUNT = "TELEGRAM_BOT_TOKEN";

/**
 * An OS-level secret store for the agent's master seed (ADR-0007). The agent
 * wallet is a hot wallet — always programmatically accessible, no human gate —
 * so the goal is keeping the seed out of plaintext at rest, NOT locking it
 * behind an interactive unlock. Pluggable so the test suite never shells out,
 * and a headless backend (sops+age / Vault transit) can replace the macOS
 * Keychain on a server deploy without touching callers.
 */
export interface SecretBackend {
  readonly name: string;
  get(account: string): Promise<string | null>;
  set(account: string, value: string): Promise<void>;
  delete(account: string): Promise<void>;
}

async function runSecurity(
  args: string[],
): Promise<{ ok: boolean; out: string }> {
  const proc = Bun.spawn(["security", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return { ok: proc.exitCode === 0, out };
}

/**
 * macOS login-keychain backend via the `security` CLI. Encrypted at rest by the
 * OS and ACL'd to this user; stays non-interactive while the keychain is
 * unlocked at login (the hot-wallet requirement).
 */
export const keychainBackend: SecretBackend = {
  name: "macos-keychain",
  async get(account) {
    // -w prints ONLY the secret to stdout; a missing item exits non-zero.
    const { ok, out } = await runSecurity([
      "find-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      account,
      "-w",
    ]);
    if (!ok) return null;
    return out.replace(/\n$/, "") || null;
  },
  async set(account, value) {
    // -U updates an existing item in place. The value is a discrete argv element
    // (no shell), so there's no injection — but it IS briefly visible in `ps` to
    // this same user; acceptable for a setup/rotate-time write (ADR-0007).
    const { ok, out } = await runSecurity([
      "add-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      account,
      "-w",
      value,
      "-U",
    ]);
    if (!ok)
      throw new Error(
        `keychain write failed: ${out || "security exited non-zero"}`,
      );
  },
  async delete(account) {
    // Idempotent — a missing item is not an error (used by rotation teardown).
    await runSecurity([
      "delete-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      account,
    ]);
  },
};

// Used off macOS or when secret storage is forced off. Reads resolve to env
// only; writes fail loudly with guidance rather than silently dropping a seed.
const nullBackend: SecretBackend = {
  name: "none",
  async get() {
    return null;
  },
  async set() {
    throw new Error(
      "No OS secret backend on this platform. Set AGENT_SIGNER_MNEMONIC in the " +
        "environment, or configure a backend (macOS keychain is built in; " +
        "sops+age / Vault for server deploys — see ADR-0007).",
    );
  },
  async delete() {
    /* nothing is stored in this backend */
  },
};

/** The backend for the current platform + `VELLUM_SECRET_BACKEND` knob. */
export function defaultBackend(): SecretBackend {
  switch (env.VELLUM_SECRET_BACKEND) {
    case "env":
      return nullBackend; // force env-only (CI / tests / opt-out)
    case "keychain":
      return keychainBackend; // force, even off-darwin (errors on use)
    default:
      return process.platform === "darwin" ? keychainBackend : nullBackend;
  }
}

/**
 * Resolve the agent master seed from the most secure available source:
 * explicit env (`.env` / CI / tests / runtime-adopt) first — backward-compatible
 * and the fast path — then the OS secret store. Returns undefined if neither has
 * it. Not cached here: `PersonaWallets` memoizes the resolved seed on its
 * instance for the transaction hot path, and the remaining callers (setup
 * status, seed export, the devnet CLI) are infrequent, so a fresh keychain read
 * is cheap enough and avoids a stale process-wide cache. (ADR-0007.)
 */
export async function getAgentMnemonic(
  backend: SecretBackend = defaultBackend(),
): Promise<string | undefined> {
  if (env.AGENT_SIGNER_MNEMONIC) return env.AGENT_SIGNER_MNEMONIC;
  const fromStore = await backend.get(SECRET_ACCOUNT).catch((e) => {
    log.warn(
      `secret backend ${backend.name} read failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  });
  return fromStore ?? undefined;
}

/** Store the master seed in the OS secret store (install wizard / keys import). */
export async function setAgentMnemonic(
  value: string,
  backend: SecretBackend = defaultBackend(),
): Promise<void> {
  await backend.set(SECRET_ACCOUNT, value);
}

/** Remove the master seed from the OS secret store (rotation teardown). */
export async function clearAgentMnemonic(
  backend: SecretBackend = defaultBackend(),
): Promise<void> {
  await backend.delete(SECRET_ACCOUNT);
}

/** Where the seed resolves from — for `keys status`. Never returns the value. */
export async function agentMnemonicSource(
  backend: SecretBackend = defaultBackend(),
): Promise<"env" | "keychain" | "none"> {
  if (env.AGENT_SIGNER_MNEMONIC) return "env";
  const v = await backend.get(SECRET_ACCOUNT).catch(() => null);
  return v ? "keychain" : "none";
}

/**
 * Telegram bot token resolution (#109 §1). Same env-first/keychain-fallback
 * shape as the agent seed — the goal isn't a human-unlock gate but keeping
 * the token out of plaintext at rest. A leaked .env that previously included
 * TELEGRAM_BOT_TOKEN would let an attacker post messages AS the bot to the
 * principal (social-engineering the human into running /switch or /spend);
 * pushing the token into the keychain closes that exfil path. Env still
 * wins so CI / Docker / one-off boot overrides remain frictionless.
 */
export async function getTelegramBotToken(
  backend: SecretBackend = defaultBackend(),
): Promise<string | undefined> {
  if (env.TELEGRAM_BOT_TOKEN) return env.TELEGRAM_BOT_TOKEN;
  const fromStore = await backend.get(TELEGRAM_TOKEN_ACCOUNT).catch((e) => {
    log.warn(
      `secret backend ${backend.name} read failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  });
  return fromStore ?? undefined;
}

/** Store the Telegram bot token in the OS secret store (setup wizard / rotate). */
export async function setTelegramBotToken(
  value: string,
  backend: SecretBackend = defaultBackend(),
): Promise<void> {
  await backend.set(TELEGRAM_TOKEN_ACCOUNT, value);
}

/** Remove the Telegram bot token from the OS secret store (setup clear). */
export async function clearTelegramBotToken(
  backend: SecretBackend = defaultBackend(),
): Promise<void> {
  await backend.delete(TELEGRAM_TOKEN_ACCOUNT);
}

/** Where the TG token resolves from — for `keys status`. Never returns the value. */
export async function telegramBotTokenSource(
  backend: SecretBackend = defaultBackend(),
): Promise<"env" | "keychain" | "none"> {
  if (env.TELEGRAM_BOT_TOKEN) return "env";
  const v = await backend.get(TELEGRAM_TOKEN_ACCOUNT).catch(() => null);
  return v ? "keychain" : "none";
}
