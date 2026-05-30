---
id: 7
title: "Agent signer seed lives in the OS keychain, not plaintext .env — hot-wallet posture"
status: accepted
date: 2026-05-29
last-verified: 2026-05-30
relates-to: ["0005-multisig-one-time-unlock", "0003-vault-gating-revamp"]
---

## Context

A security eval of agent private-key storage (#96). Every persona wallet is
HD-derived from a **single master mnemonic** (`AGENT_SIGNER_MNEMONIC`); the DB
stores only the bb1 address + HD index, never a key (`@vellum/wallet`). The seed
never leaks into git, logs, prompts, or API responses — the injection guard even
blocks seed-extraction prompts, and `/api/setup-status` exposes only a `hasWallet`
boolean. The design is sound except for one narrow weakness: the master seed sat
**plaintext in the repo `.env`** (`chmod 0600`, gitignored). Any process/user that
can read `.env`, the process env (`/proc/<pid>/environ`), a memory dump, or a
stray backup obtains *every* persona's key at once. No envelope encryption, no
rotation path, no per-persona blast-radius isolation.

These are intentionally **hot wallets**: always programmatically accessible to the
agent, no human in the loop. That is a product requirement, not an oversight — the
agent acts autonomously. Human-password / interactive unlock is therefore the
wrong tool; it would kill the autonomy that is the whole point. The human holds
their own 2FA-gated wallet; the agent wallet is treated like an exchange
operational hot wallet.

## Decision

Move the master seed out of plaintext `.env` into the **OS secret store**, while
keeping it fully non-interactive (Option A of the eval).

- A resolver in `@vellum/shared` — `getAgentMnemonic()` — resolves the seed from
  the most secure available source: **explicit env first** (`.env` / CI / tests /
  runtime-adopt — backward-compatible + the fast path), **then the OS secret
  store**. A pluggable `SecretBackend` interface keeps the suite hermetic and lets
  a headless backend slot in later (see "Deferred").
- The built-in backend is the **macOS login keychain** via the `security` CLI
  (encrypted at rest by the OS, ACL'd to the user, unlocked at login → no prompt).
  Off macOS / forced off, the backend is env-only.
- `PersonaWallets` resolves the seed **lazily** through `getAgentMnemonic` and
  memoizes it on the instance for the transaction hot path. The install wizard and
  web onboarding write the seed to the keychain (never `.env`); the seed-export
  route (#57), the `hasWallet` status, and the devnet CLI all read through the
  resolver. `vellum keys migrate` moves an existing `.env` seed into the keychain
  and scrubs the line; `vellum keys status` reports the source (never the value).
- `VELLUM_SECRET_BACKEND` (`auto` | `keychain` | `env`) overrides selection;
  `env` forces env-only (CI / tests).

The seed is still decrypted into process memory at use — unavoidable for a hot
signer. The win is removing the cleartext-on-disk exposure and adding a rotation +
migration seam, without sacrificing autonomy.

### The primary loss-limiter is on-chain, not the key store

The strongest control already exists: **vault amount caps + the multisig unlock**
(ADR-0005). A fully-stolen hot key can still only move funds within a per-period
cap, with real value escrowed behind the human multisig. Operational discipline —
keep only float on the bare agent wallet, escrow value in multisig-gated vaults —
bounds blast radius independent of where the seed is stored. Storage hardening is
complementary, not the main defense.

## Consequences

- The seed no longer needs to be in plaintext `.env` to run; on macOS it resolves
  from the keychain. `.env` still works (env-first), so dev/CI/existing installs
  are unaffected until they migrate.
- One new local dependency: the macOS `security` CLI (always present). The seed is
  briefly visible in `ps` during a keychain *write* (argv) — acceptable for a
  setup/rotate-time op, same-user only; reads go via stdout with no argv exposure.
- A rotation path now exists (see `docs/runbooks/rotate-agent-mnemonic.md`); there
  was none before.

## Deferred (explicitly out of scope)

- **Headless server backend (sops+age / Vault transit).** Vellum has no
  Dockerfile / k8s / deploy today — it runs local-only on macOS; Meridian is just
  the chain endpoint. macOS Keychain *is* the current prod environment. Build the
  server backend when vellum actually deploys headless; the `SecretBackend`
  interface is the seam.
- **Remote signer service** (key never enters the agent process) — largely
  re-implements the on-chain approval engine; not worth it at this scale.
- **HSM / Secure Enclave / MPC threshold signing** — custody-grade, massive
  overkill here.
- **Per-persona key isolation** (independent seed per persona) — a blast-radius
  lever that trades away the single-secret simplicity; revisit if value at stake
  grows.
- **Moving the OpenRouter key / API token to the keychain** — lower-stakes
  revocable API keys; the irreversible wallet seed is the priority. Same path
  applies later if desired.
