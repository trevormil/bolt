---
title: Install Vellum from scratch (local-first, sub-minute)
last-verified: 2026-05-28
---

# Install Vellum from scratch

Zero → a running local agent in one command. Nothing is hosted; the only
outbound call Vellum ever makes is to OpenRouter (the LLM). macOS is the
supported platform for the background-daemon step today — cross-platform
autostart is a later extension.

## One command

```bash
bun run setup
```

That runs `scripts/quickstart.sh`, which:

1. Checks `bun` is present (install from https://bun.sh if not).
2. `bun install` across the workspace.
3. Launches the interactive wizard (`vellum init`).

## What the wizard asks

1. **OpenRouter API key** — powers the agent's LLM. You can leave it blank and
   add `OPENROUTER_API_KEY` to `.env` later; everything else works, the agent
   just can't think until a key is set.
2. **Agent signer wallet** — all per-persona wallets derive from one master
   mnemonic. Generate a fresh 24-word phrase (printed once — **back it up**) or
   import an existing one. (The phrase is validated by deriving its address.)
3. **First persona** — a name; it gets its own `bb1` wallet + default
   capabilities (#37) on creation.
4. **Network exposure** — default **no** (loopback only). Saying yes generates a
   `VELLUM_API_TOKEN`, which is required to bind beyond `127.0.0.1`.
5. **Background daemon** — optionally installs the macOS launchd unit so Vellum
   runs at login (`scripts/install-daemon.sh`).

Secrets are written to `./.env` (owner-only `0600`, the file Bun auto-loads at
startup). State lives in `~/.vellum` (`$VELLUM_HOME`/`$XDG_DATA_HOME` honored).
Re-running the wizard is idempotent: `.env` keys are merged in place and an
existing persona is reused.

## After setup

If you installed the daemon, it's already serving at http://127.0.0.1:8787.
Otherwise:

```bash
vellum                # terminal REPL
bun run daemon        # web + schedulers; open http://127.0.0.1:8787
```

## Why secrets are terminal-only

The web onboarding screen creates personas and shows a setup banner, but it does
**not** collect the OpenRouter key or the agent mnemonic over HTTP — those are
written only by the terminal wizard. Round-tripping a signing mnemonic through a
browser form to write a server-side dotfile is an unnecessary exposure for a
local-first app, so the web half points you here for secrets and drives the rest
of setup (persona creation) directly. `GET /api/setup-status` reports what's
configured (booleans only — never the secret values) so the UI can guide you.

## Verify

```bash
vellum personas                      # the persona you created, with its bb1 address
curl -s localhost:8787/api/setup-status | jq   # {hasLlmKey, hasWallet, personaCount, …}
```
