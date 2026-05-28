---
title: Install Bolt from scratch (local-first, sub-minute)
last-verified: 2026-05-28
---

# Install Bolt from scratch

Zero → a running local agent in one command. Nothing is hosted; the only
outbound call Bolt ever makes is to OpenRouter (the LLM). macOS is the supported
platform for the browser auto-open + background-daemon steps today —
cross-platform autostart is a later extension.

## One command

```bash
bun run setup
```

That runs `scripts/quickstart.sh`, which:

1. Checks `bun` is present (install from https://bun.sh if not).
2. `bun install` across the workspace.
3. Builds the web dashboard (`@vellum/web`).
4. Starts the loopback server and **opens your browser** to the guided setup.

Headless / no-browser environment? `bun run setup --cli` runs the interactive
terminal wizard instead (same outcome, no server/browser needed).

## What the web setup asks

1. **OpenRouter API key** — powers the agent's LLM. **Required + validated**: a
   sample health check runs before setup proceeds, so an invalid key is rejected
   up front (#60). Get one at openrouter.ai/keys; change it later in Settings.
2. **First persona** — a name (role/voice optional); it gets its own `bb1`
   wallet + default capabilities (#37) on creation.

The **agent wallet is generated automatically** (#59 — no import). The master
mnemonic is the agent's key: it's created server-side, never shown during setup,
and never leaves the machine. Back it up anytime from **Settings → Wallet
recovery → Export seed phrase**.

Secrets are written to `./.env` (owner-only `0600`, the file Bun auto-loads at
startup). State lives in `~/.vellum` (`$VELLUM_HOME`/`$XDG_DATA_HOME` honored).
Re-running setup is idempotent: `.env` keys merge in place and an existing wallet
is never overwritten (setup is first-run-only).

## How secrets are handled (loopback-only)

The web setup DOES collect the OpenRouter key and generate the wallet — but only
over loopback. `POST /api/setup` is **not** a public route: it stays behind the
Host/Origin cross-site guard, refuses anything but `127.0.0.1`, and is first-run
only (it won't overwrite a configured wallet). The mnemonic is generated on the
server and is **never returned to the browser**. `GET /api/setup-status` reports
what's configured (booleans/counts only — never secret values, never local
paths) so the UI knows whether to show the setup flow.

## After setup

The daemon serves the web/PWA UI at http://127.0.0.1:8787. To run it in the
background at login (macOS):

```bash
bun run daemon:install     # launchd unit; auto-restarts, starts at login
```

Foreground options:

```bash
vellum                # terminal REPL
bun run daemon        # web + (Telegram if configured); open http://127.0.0.1:8787
```

Recurring prompts are scheduled via OS cron — see
[schedule-with-cron.md](./schedule-with-cron.md). (Bolt no longer ships an
in-app scheduler.)

## Verify

```bash
vellum personas                      # the persona you created, with its bb1 address
curl -s localhost:8787/api/setup-status | jq   # {hasLlmKey, hasWallet, personaCount, …}
```
