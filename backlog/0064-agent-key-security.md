---
id: 64
title: "Explore agent private-key security — no plaintext at rest (encryption vs. second-factor signing)"
status: closed
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/83"]
priority: high
type: security
source: trevor
created: 2026-05-28
updated: 2026-05-28
refs: ["0052-agent-dev-capability-yolo.md", "0051-agent-money-autonomy.md", "0019-install-onboarding-wizard.md"]
---

## Description
Bolt's persona wallets are the agent's signing keys for **real money moves**
(MsgSend, vault withdraw/pay). Today the mnemonic is stored **in plaintext at
rest** in `VELLUM_HOME` and is readable by anyone/anything on the host —
including the agent's own YOLO `run_command` tool (#52), which can `cat` the
seed and exfiltrate it. That's the right call for *frictionless autonomy* but
the wrong call for *key safety*. We want both: keep the UX seamless (the daemon
must sign autonomously, including AFK / via Telegram — no human-in-the-loop
unlock per transaction) **without** leaving the key in plaintext.

This ticket is an **exploration/spike** — produce an ADR that compares the
options and recommends a direction. No implementation yet.

## Current state (the thing we don't love)
- Mnemonic generated at onboarding (#19), persisted plaintext in `VELLUM_HOME`.
- Surfaced via `/api/agent/mnemonic` (loopback + authed) and a Settings export.
- `redactedEnv()` keeps the seed out of `run_command`'s env, but exec is
  host-wide (ADR-0004) so the on-disk file is still readable by the agent.
- Net: full-trust YOLO means a prompt-injected or misbehaving agent can drain
  every persona. Acceptable on devnet; unacceptable as a production posture.

## Options to evaluate (at minimum)
1. **Encryption at rest**
   - OS keychain (macOS Keychain / libsecret) holds the data key; daemon
     decrypts into memory on start. Good UX, but a host-local process (or the
     agent's exec) can still ask the daemon / read decrypted memory.
   - Passphrase-derived key (argon2/scrypt) unlocked once at daemon start.
     Breaks unattended restart unless the passphrase is cached → re-opens the
     plaintext problem in a different shape.
   - `age` / `sops` envelope encryption — same restart/unlock tension.
2. **Second-factor on the *spend*, not the *key*** (likely the real answer)
   - Keep signing autonomous for reads/cheap ops; require an out-of-band
     approval (Telegram inline button, TOTP, push) for moves above a threshold
     or to new recipients. Pairs naturally with the existing capability gates
     (`spend`, `vault.withdraw`) and the Telegram entrypoint (#49).
   - Tiered: small/known-recipient = autonomous; large/novel = 2FA. UX stays
     seamless for the 95% case; the dangerous case gets a human gate.
3. **Remote / isolated signer**
   - Move signing into a separate process/enclave the exec tool can't read
     (different uid, seccomp, or a tiny signer daemon over a socket). The agent
     asks the signer to sign; it never sees raw key material. Closest to "agent
     can move money but can't steal the key."
   - MPC / threshold (e.g., 2-of-2 with one share on a phone) — strongest, most
     complex; probably overkill for bootcamp scope but worth noting as the
     end-state.

## Acceptance criteria
- An **ADR** (`docs/decisions/NNNN-agent-key-security.md`) that:
  - States the threat model explicitly (host compromise, prompt-injected
    agent, YOLO exec read, lost laptop) and which threats each option mitigates.
  - Compares the options above on **UX impact** (does it break autonomous /
    AFK / Telegram signing?), **security gain**, and **implementation cost**.
  - Lands a **recommendation** + a phased path (what to ship first vs. later).
  - Resolves the core tension: autonomous signing vs. no-plaintext — name the
    acceptable residual risk.
- A follow-up **implementation ticket** filed for the recommended direction
  (scope only; build is out of scope here).

## Notes
- Frame around the #52 YOLO posture, not against it: the goal is to keep the
  agent powerful while making the *key itself* unstealable, even by the agent.
- The capability engine + `txManager.spend` chokepoint already give us a clean
  place to slot a 2FA / threshold gate — lean on it rather than inventing a
  parallel control.
- Don't over-engineer for devnet; do design the end-state so we're not painted
  into a corner when this handles mainnet USDC.

## Resolution (2026-05-29) — ADR-0007, implemented as #96 (MR !83)
Spike done. Chose **Option A**: move the master seed out of plaintext into the OS
keychain (macOS `security`), env-first fallback, fully non-interactive (hot
wallet — no per-tx human unlock). Decision + threat model: `docs/decisions/0007`;
rotation: `docs/runbooks/rotate-agent-mnemonic.md`; implementation: #96 / MR !83.

**Residual vector → handed to #90's security-eval battery:** the keychain stops
plaintext-file / backup / grep exfil, but a host-wide `run_command` (#52) can
still query the unlocked keychain (`security find-generic-password …`) or read
process memory. ADR-0007's stance: the seed is necessarily in-process for a hot
signer, so the *primary* loss-limiter is on-chain (vault caps + multisig,
ADR-0005) — keep only float on the bare wallet. The eval battery should assert
these limiters hold (seed-exfil + run_command-key-read are bounded by the caps),
rather than pretend the key is unreadable.
