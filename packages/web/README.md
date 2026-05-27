# @vellum/web

Companion web app — a thin Hono API over the engine packages (persona memory,
per-persona wallets, deterministic routing, cost/trust ledger) plus a Vite + React
SPA styled with `@vellum/ui` (Dusk theme).

## Run it

Needs the repo-root `.env` (OPENROUTER_API_KEY for chat, AGENT_SIGNER_MNEMONIC for
wallet derivation). Run from the **repo root** so `.env` loads.

**One-shot (build SPA + serve API+static on one port):**

```bash
cd packages/web && bun run build && cd ../..
bun packages/web/src/server.ts          # http://localhost:8787
```

**Iterating (two processes, hot reload):**

```bash
bun packages/web/src/server.ts          # API on :8787
cd packages/web && bun run dev:web      # SPA on :5173, proxies /api → :8787
```

`VELLUM_DB_PATH` (default `./vellum.db`) and `WEB_PORT` (default `8787`) are env-tunable.

## What works today

- **Onboarding** — create a persona; its bb1 wallet is provisioned on creation.
- **Chat** — talk to a persona; deterministic routing → bounded agent loop → reply,
  with per-message $/token cost. Each turn is recorded to the ledger.
- **Wallet panel** — the persona's bb1 address (copy) + live devnet balance; fund by
  sending `ubadge` to the address.
- **Ledger** — per-persona proof-of-action: spend/tokens totals + every action.

## Deferred (later tickets)

- Vault list/create + manager-signed rule changes (0016 — needs 0012/0013).
- PaymentRequest funding + streamlined sign page (0014 part of 0017).
- Telegram-account linking in onboarding (0015 — bot already works standalone).
