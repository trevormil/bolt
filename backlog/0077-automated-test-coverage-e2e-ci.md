---
id: 77
title: "Comprehensive automated test coverage — Playwright e2e for all features + green CI gate"
status: closed
priority: high
type: testing
source: trevor
created: 2026-05-28
updated: 2026-05-28
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/69"]
refs: ["0076-agent-eval-suite.md", "0053-frontend-design-revamp.md"]
---

## Description
Make testing a **fully automated, comprehensive system** and a standing
discipline going forward. Today there's strong unit/integration coverage
(`bun test`, ~415 cases across the packages) but **no end-to-end coverage of the
web UI flows**, and no CI gate running automatically on push.

Add e2e and wire automation so every feature is guarded and regressions are
caught without manual clicking.

## Acceptance criteria
- **Playwright e2e** covering the user-facing flows (use the loopback daemon +
  the devnet/offline seams where possible; mock the chain/LLM where a live call
  is impractical):
  - First-run onboarding (key → wallet → first persona), incl. the OpenRouter +
    Telegram validation steps.
  - Persona create/switch; chat round-trip.
  - Wallet: fund / request / **send**; faucet.
  - Vaults: create with each gating dimension (cap/period, time window, multisig),
    deposit-request + vote links, withdraw.
  - Settings: OpenRouter rotate, **Telegram set/rotate/disable**, seed export.
- **CI gate** that runs unit (`bun test`) + typecheck + the e2e suite on every
  push/MR (via the labs GitLab laptop runner #53 / tag `laptop-eval`, since there
  are no shared runners) and blocks on red.
- **Standing practice:** new features ship with e2e in the same stretch (thin
  pyramid — heavy units, targeted e2e); backfill existing gaps over time.

## Notes
Trevor: "harden everything test-wise … fully automated system … tons of test
cases for improving as we go — a key part moving forward." Formalizes the
playwright-test-everything practice into an enforced, automated gate. Pairs with
#76 (agent-behavior evals) — together they cover behavior + UI + regression.
