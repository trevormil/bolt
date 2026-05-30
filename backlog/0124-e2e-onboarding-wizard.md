---
id: 124
title: "e2e: Onboarding wizard — first-run SetupFlow (no-wallet test-server variant)"
status: closed
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/104"]
priority: high
type: testing
source: audit-2026-05-29
created: 2026-05-29
updated: 2026-05-29
refs: ["0106-test-coverage-backfill.md", "0019-install-onboarding-wizard.md", "0086-telegram-visible-by-default-onboarding.md"]
---

## Description
Split from #0106 §4. Every user touches the onboarding wizard exactly once;
today's test-server pre-seeds a wallet so the SetupFlow is invisible to
e2e. A manual smoke-test on 2026-05-29 surfaced an adjacent class of bugs
(stale dist + PWA cache hiding rebuilds) that an automated onboarding spec
would have flagged.

## Acceptance criteria
- `test-server-no-wallet.ts`: variant of the test-server seam that returns
  `hasWallet:false / hasLlmKey:false / personaCount:0` and routes
  setup-completion calls to in-memory state (no real keychain write).
- `e2e/onboarding.spec.ts`: drive the wizard end-to-end — paste OpenRouter
  key → generate seed → create first persona → daemon-ready. Assert each
  step's UI affordance + the `/api/setup-status` response after each step.
- Negative branches: bad OpenRouter key (validation error visible), skip
  Telegram step (path still completes), back-button on each step.

## Notes
Heaviest of the bunch; the wizard has the most steps. Consider splitting
into a happy-path test + a negative-path test in one file rather than
collapsing into one walk.
