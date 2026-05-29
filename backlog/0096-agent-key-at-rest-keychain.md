---
id: 96
title: "Agent signer key at rest — move master mnemonic out of plaintext .env into the OS keychain"
status: in-progress
prs: []
priority: high
type: security
source: security-eval
created: 2026-05-29
updated: 2026-05-29
refs: ["0019-install-wizard.md"]
---

## Description
Security eval of agent private-key storage. Today the **single master mnemonic**
(`AGENT_SIGNER_MNEMONIC`) — from which every persona wallet is HD-derived — sits
**plaintext in the repo `.env`** (`chmod 0600`, gitignored). The DB stores only
addresses + HD indices, never a key; nothing leaks into git, logs, prompts, or
API responses (the injection guard at `persona/injection.ts` even blocks
seed-extraction prompts, and `/api/setup-status` exposes only a `hasWallet`
boolean). So the design is sound — the one narrow weakness is that the root seed
is cleartext on disk: any process/user that can read `.env`, the process env
(`/proc/<pid>/environ`), a memory dump, or a stray backup gets *every* persona's
key at once.

These are intentionally **hot wallets** — always programmatically accessible to
the agent, no human in the loop. Human-password / interactive unlock is the wrong
tool (it kills the autonomy that's the point). Humans hold their own 2FA-gated
wallets; the agent wallet is treated like an exchange operational hot wallet.
Chosen direction = **Option A**: move the seed out of plaintext into the OS
secret store, staying fully non-interactive.

## Scope (Option A)
- Resolver in `@vellum/shared` (`getAgentMnemonic`): **env-first**
  (`.env` / CI / tests / explicit override) → **OS secret store** (macOS Keychain
  via the `security` CLI) → throw. Cached per process. A pluggable `SecretBackend`
  so a headless backend (sops+age / Vault) slots in later without touching callers.
- `PersonaWallets` resolves the seed **lazily** through that resolver (keeping the
  existing `opts.mnemonic` test seam) instead of capturing `env.AGENT_SIGNER_MNEMONIC`
  eagerly. Other readers (`/api/setup-status` `hasWallet`, the chain devnet CLI)
  route through the resolver too, so they stay correct after the seed leaves `.env`.
- Install wizard writes the seed to the keychain, not `.env`.
- `vellum keys migrate` moves an existing `.env` seed into the keychain and scrubs
  the line; `vellum keys status` reports the backend + presence (never the seed).
- ADR (hot-wallet threat model, why not human-gating, deferred options B/C/E,
  "escrow the float" operational discipline) + a rotation runbook (there is no
  rotation path today).

## Out of scope (deferred, noted in the ADR)
- Headless server backend (sops+age / Vault transit) — vellum has no Dockerfile /
  k8s / deploy today (runs local-only on macOS; Meridian is just the chain
  endpoint), so macOS Keychain *is* the current prod environment. Build the server
  backend when vellum actually deploys headless.
- Remote signer service (Option C), HSM / enclave / MPC (Option E).
- Per-persona key isolation (Option D — blast-radius lever, not worth it at this
  scale yet).
- Moving the OpenRouter key / API token to the keychain — lower-stakes revocable
  API keys; the irreversible wallet seed is the priority. Same path applies later.

## Acceptance criteria
- Master seed no longer required in plaintext `.env` to run; resolves from the
  keychain on macOS. `.env` still works (env-first) for dev/CI/tests — backward
  compatible.
- `vellum keys migrate` + `vellum keys status` exist and are tested (pure logic,
  no real keychain in the suite).
- `bun test` green; `tsc` clean; prettier.
- ADR + rotation runbook committed.

## Notes
The strongest loss-limiter is already on-chain (vault amount caps + multisig
unlock): a fully-stolen hot key can still only move funds within a daily cap, with
real value escrowed behind the human multisig. Keep the bare agent wallet holding
only operational float — that bounds blast radius independent of where the seed
is stored.
