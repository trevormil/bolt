---
id: 59
title: "Always auto-generate agent wallets — drop import"
status: in-progress
priority: medium
type: ux
source: review
created: 2026-05-28
updated: 2026-05-28
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/52"]
refs: ["0019-install-onboarding-wizard.md", "0057-export-agent-seed-phrase.md"]
---

## Description
Trevor's call (2026-05-28): agent wallets should ALWAYS be generated fresh —
drop the import-a-mnemonic option entirely. The agent's key is internal
(generated server-side, exported only via Settings → #57); importing an existing
phrase is an unneeded footgun in the onboarding.

## Acceptance criteria
- SetupFlow: remove the Generate/Import selector + the import textarea +
  `walletMode`/`importMnemonic` state. The wallet step just states a fresh
  wallet will be generated (no choice).
- `POST /api/setup`: always `generateWallet()`; drop the `mnemonic` request
  field + the import-validation branch (and its 400 path).
- `api.setup()`: drop the `mnemonic` param.
- Tests: drop the import + invalid-mnemonic cases; keep generate, the
  loopback/first-run/cross-site/exposed gates.
- Export (#57) is unaffected — recovery is still available in Settings.

## Notes
Folded into !52 (onboarding follow-ups). Simplifies the trust surface: the
phrase never enters the app from the user side at all now.
