---
title: Rotate the agent master seed
last-verified: 2026-05-29
---

# Rotate the agent master seed

When to do this: the master seed (`AGENT_SIGNER_MNEMONIC`) may be compromised, or
you want periodic rotation. The seed is the root of **every** persona wallet
(HD-derived), so treat a suspected leak as compromising all agent wallets at once
(ADR-0007).

## The hard truth first

There is no in-place "swap the seed" — the seed *is* the key material. A new seed
derives **new addresses** for every persona at the same HD indices. So rotation is
necessarily: **drain funds from the old addresses → install the new seed →
re-provision wallets at the new addresses → fund them.** Plan for the old and new
addresses to coexist briefly during the drain.

The `signerFor` mismatch guard (`@vellum/wallet`) enforces this: after the seed
changes, every stored `wallets` row still holds the *old* address, so signing
fails loudly until you re-provision — it will not silently sign with the wrong
key.

## Steps

1. **Stop the daemon** so nothing signs mid-rotation.
   ```bash
   scripts/install-daemon.sh uninstall   # stop + remove the autostart unit
   # (or just Ctrl-C if you're running `bun run daemon` in the foreground)
   ```

2. **Confirm where the current seed lives.**
   ```bash
   vellum keys status   # → "OS secret store (macos-keychain)" or "plaintext env"
   ```

3. **Drain the old wallets first** (do this BEFORE replacing the seed — you still
   need the old key to sign the drain). For each persona, move the bare balance to
   a safe address you control. Vault-escrowed funds are held under collections
   managed by your human multisig (ADR-0005) — unwind those through the normal
   vault withdrawal/multisig flow, not this rotation.
   ```bash
   vellum balance <persona>                          # see what's there
   # send the float out via the app / a signed transfer while the OLD seed is live
   ```

4. **Generate + install the new seed** into the keychain. Either:
   - Put the new phrase in `.env` as `AGENT_SIGNER_MNEMONIC=...`, then
     `vellum keys migrate` (stores it in the keychain and scrubs the .env line), or
   - Write it directly:
     ```bash
     security add-generic-password -s vellum-agent-signer -a AGENT_SIGNER_MNEMONIC -w "<new 24 words>" -U
     ```
   Back up the new phrase somewhere safe before continuing.

5. **Re-provision wallets at the new addresses.** The stored rows are stale (old
   addresses), so clear them and let the daemon re-derive on next use. The wallet
   table lives in the Vellum DB (`VELLUM_DB_PATH`, default `~/.vellum/vellum.db`):
   ```bash
   sqlite3 "$HOME/.vellum/vellum.db" 'DELETE FROM wallets;'
   ```
   Persona ids and everything else are untouched; only the bb1 addresses change
   (re-derived from the new seed at the same indices on next `ensureWallet`).

6. **Restart the daemon** and verify.
   ```bash
   scripts/install-daemon.sh install     # or `bun run daemon` in the foreground
   vellum keys status                    # confirms the keychain holds the seed
   vellum balance <persona>              # new address; expect 0 until funded
   ```

7. **Fund the new addresses** (faucet on devnet, or a real transfer) and resume.

## Notes

- Verified on macOS 2026-05-29: keychain set/get/delete via the `security` CLI and
  `vellum keys migrate`/`status` round-trip correctly. The fund-drain (step 3) and
  vault unwinds are environment-specific and are the operator's responsibility —
  they are not automated here.
- On a headless deploy there is no macOS keychain; the seed backend would be
  sops+age / Vault (deferred — ADR-0007). Until then, server rotation uses the
  same drain → re-provision shape with the seed in the server's secret mechanism.
