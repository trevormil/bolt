# Package map

**Status:** evergreen (edit-in-place) · **Updated:** 2026-05-29

The 21 workspace packages under [`packages/`](../packages/), grouped by role.
Descriptions are derived from each package's `src/index.ts` header — when a
package's public surface changes, update both. The dependency direction is
one-way: **surfaces → `@vellum/engine` → libraries**; surfaces stay thin and
share one local core + `~/.vellum` state.

See [`ARCHITECTURE.md`](../ARCHITECTURE.md) for how these fit together at runtime.

## Surfaces (thin clients over the engine)

| Package | Role |
|---------|------|
| `@vellum/cli` | Local-first terminal surface — the `vellum` binary (#34). |
| `@vellum/web` | Vite SPA + Hono API served from localhost, installable as a PWA. Onboarding, vault/budget UIs, the Activity feed, and the Keplr sign/pay pages. |
| `@vellum/telegram` | Long-polling Telegram client (grammY) driving the engine; no inbound hosting. |
| `@vellum/daemon` | The unified local background daemon (#31): one engine hosting the web API + Telegram bot. |

## Core runtime

| Package | Role |
|---------|------|
| `@vellum/engine` | Wires personas + memory, wallets, routing, ledger, tx lifecycle, vaults, and budgets into one object every surface drives. |
| `@vellum/orchestrator` | Deterministic message → persona routing + bounded dispatch to the persona's agent loop (no LLM-inferred routing — see ARCHITECTURE §4). |
| `@vellum/agent` | The thin tool-using agent loop + MCP client. |
| `@vellum/persona` | The compartment core: personas with hard-walled memory + hybrid (BM25 + dense) retrieval, a thin global layer, and SOUL identity. |
| `@vellum/capabilities` | The local capability/permission model (#37): per-persona, default-deny, scoped grants + a single fail-closed `Authorizer` every gated action (filesystem, cron, MCP, spend) passes through. |
| `@vellum/settings` | Per-persona settings framework (#40) — generic global/persona settings. |
| `@vellum/llm` | OpenRouter client: completion, tool calls, cost-tier routing, key verification. |

## Payment & chain

| Package | Role |
|---------|------|
| `@vellum/chain` | Low-level BitBadges chain access: key/address derivation, balances, broadcast, and ABCI reads. |
| `@vellum/wallet` | One `bb1` wallet per persona, HD-derived from a single master mnemonic; the DB holds only addresses + indices, never keys. |
| `@vellum/tx` | Chain-state reconciliation + tx lifecycle — the non-negotiable invariant (ARCHITECTURE §13 / ticket 0023). |
| `@vellum/tokenization` | Agent-side BitBadges tokenization (vaults, payment requests) via the `bitbadges` SDK; the agent does the tx lifting, the human is manager + funds escrow. |
| `@vellum/ledger` | The append-only cost + trust ledger — proof-of-action (authority + tx hash). |

## Cross-cutting / infrastructure

| Package | Role |
|---------|------|
| `@vellum/observability` | Local, per-persona product event store (#42): the complete operational record (chat, fs, capability, tool, error, latency, cost) feeding the Activity feed. |
| `@vellum/trace` | Env-gated Langfuse tracing (no-op by default) — dev/ops observability. |
| `@vellum/evals` | Budget-aware eval harness (0022): golden cases with deterministic oracles + LLM-as-judge fallback. |
| `@vellum/ui` | The design system — theme-agnostic components + a Tailwind preset; Dusk (dark) is the default theme. |
| `@vellum/shared` | Cross-cutting primitives: zod-parsed env, the logger, and `~/.vellum` data-dir helpers. |

> The three telemetry packages do **different** jobs — don't conflate them:
> `@vellum/trace` (Langfuse, dev/ops), `@vellum/observability` (product event
> store, user-facing), `@vellum/ledger` (on-chain settlement). See ARCHITECTURE §11.
