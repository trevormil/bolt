# Bolt

A payment-first personal AI agent. Local-first. Compartmentalized by persona. Money is a first-class primitive — every agent wallet has hard caps, every spend goes through a single capability chokepoint, every action lands in an on-chain proof-of-action ledger.

> Built from scratch to rival OpenClaw — the Vellum hiring-partner brief. **TypeScript / Bun monorepo, no fork.** What's interesting under the hood: a `TxManager.spend` chokepoint that gates every outgoing tx; multisig-gated vaults that compile to on-chain BitBadges approvals; per-persona memory walls enforced in SQL; an OS-keychain-backed signer (ADR-0007); an eval suite that runs in CI.

[Install in <1 min](#install) · [Architecture](./ARCHITECTURE.md) · [ADRs](./docs/decisions/) · [Demo](./docs/demo.md) · [Audit](./backlog/0099-tx-state-machine-hardening.md)

---

## What it does

- **Talk to it.** Telegram or a local web app. One agent, three surfaces (CLI / Web / TG), all driving one engine.
- **It moves money.** Send USDC, request payments, create vaults with cap/period or M-of-N multisig gates. The agent does the BitBadges machinery; you approve via a plain-English Keplr page.
- **Walls between personas.** Each persona has its own wallet, memory, budget, and capability grants. Zero cross-leakage — BM25 + dense recall both filter by `persona_id` in SQL; tests prove the wall holds.
- **Every action is legible.** The Activity feed merges operational events with proof-of-action settlement; budget burn-down is one chart.

## What's interesting under the hood

- **One capability chokepoint for every spend.** `TxManager.spend` is the only path to chain for value transfers. The gating compiler ([ADR-0003](./docs/decisions/0003-vault-gating-revamp.md)) maps a UI policy (cap/period, time window, M-of-N multisig) into a BitBadges `votingChallenge` + `perInitiatedByAddressApprovalAmount`.
- **Vaults are real on-chain collections.** Each vault is a 1:1 USDC-backed BitBadges collection. Multisig sign-off is a **one-time unlock**, not per-transaction consent ([ADR-0005](./docs/decisions/0005-multisig-unlock-model.md)). Vote tallies read directly from chain ABCI via a self-contained protobuf codec (fuzz-tested, 500 cases round-trip).
- **The seed never sits on disk.** macOS Keychain via the `security` CLI; env-first resolver keeps CI green; `vellum keys migrate` walks an existing `.env` seed into the keychain ([ADR-0007](./docs/decisions/0007-agent-key-storage.md)).
- **Eval suite gates CI.** Security battery (seed-exfil refusal, prompt-injection resistance, cross-persona isolation), multisig vault create, budget-bounded turns. Deterministic oracles primary; LLM-judge fallback for open-ended refusals.
- **502 unit + 7 Playwright e2e + manual evals — all green.** Plus a property/fuzz layer on the money-safety primitives (`isPositiveMicroAmount` vs a BigInt-canonical oracle, ~2,000 inputs).

## Install

Sub-minute install per the PRD. Requires [`bun`](https://bun.sh):

```bash
bun run setup
```

The wizard:
1. Sets up `~/.vellum/` (the local data home).
2. Asks for your OpenRouter API key + (optional) Telegram bot token.
3. Generates an agent wallet → stores the seed in the OS keychain (not `.env`).
4. Creates your first persona.
5. Starts the daemon at `http://127.0.0.1:8787`.

Then chat with it in the web app, the terminal (`vellum`), or your Telegram bot.

[Full install runbook](./docs/runbooks/install-from-scratch.md) · [MCP servers](./docs/runbooks/mcp-connect.md) · [Telegram setup](./docs/runbooks/telegram-setup.md) · [Key rotation](./docs/runbooks/rotate-agent-mnemonic.md)

## Layout

| Path | What |
|------|------|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | E2E system design — orchestrator, surfaces, payment layer, trust posture |
| [`docs/decisions/`](./docs/decisions/) | 7 ADRs — the load-bearing decisions |
| [`docs/runbooks/`](./docs/runbooks/) | Install, MCP, Telegram, key rotation, Meridian devnet |
| [`docs/demo.md`](./docs/demo.md) | E2E live demo against the Meridian devnet |
| [`backlog/`](./backlog/) | 115 tickets (92 closed, 18 open audit items, 5 iceboxed) |
| [`packages/`](./packages/) | 21 workspace packages — engine, web, telegram, cli, daemon + 16 libs ([map](./docs/packages.md)) |
| [`research/`](./research/) | The competitive scan + chosen differentiators |
| [`scripts/demo.ts`](./scripts/demo.ts) | Live devnet demo (real engine + chain, no mocks) |

## Stack

TypeScript on **Bun** · React + Tailwind (Vite, code-split PWA) · **Hono** server + SQLite (WAL) · **BitBadges** L1 (Cosmos SDK) · **OpenRouter** (LLM routing, per-persona model override) · **Playwright** e2e · **zod** validation · **Langfuse** observability (optional) · prettier + tsc strict mode

CI: format + typecheck + 502 unit tests + 7 Playwright e2e specs blocking on every push. Manual `evals` stage (real-LLM, budget-gated).

## Submission notes (for the reviewer)

- **Built from scratch.** No fork of OpenClaw or any other assistant. The competitive scan is in [`research/`](./research/).
- **Where to start reading:** [ARCHITECTURE.md §1–2](./ARCHITECTURE.md) for the thesis, then [ADR-0003](./docs/decisions/0003-vault-gating-revamp.md) (vault gating) and [ADR-0007](./docs/decisions/0007-agent-key-storage.md) (key storage) for the depth.
- **Engineering judgment:** the [post-merge audit](./backlog/0099-tx-state-machine-hardening.md) — 5 parallel review agents found 107 issues; synthesized into 18 prioritized tickets (3 critical, 6 high, 5 medium, 4 low). Critical issues are real but not in the demo path; the tickets capture exactly what we know.
- **Live demo:** [`docs/demo.md`](./docs/demo.md) — the recurring-payment-with-vault scenario, 5–7 minutes, real chain.

---

Built by Trevor Miller for the Vellum hiring-partner brief.
