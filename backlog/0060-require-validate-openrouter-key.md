---
id: 60
title: "Require + validate the OpenRouter key at onboarding; change it in Settings"
status: in-progress
priority: medium
type: feature
source: review
created: 2026-05-28
updated: 2026-05-28
refs: ["0019-install-onboarding-wizard.md", "0059-auto-generate-wallets-no-import.md"]
---

## Description
Trevor's call (2026-05-28): the OpenRouter key must NOT be optional at
onboarding — an invalid/empty key silently breaks chat. Block on it: run a
sample health check against OpenRouter and reject if it doesn't validate. Also
let the user set/change/reset the key later in Settings.

## Acceptance criteria
- `verifyOpenRouterKey(key)` in @vellum/llm — a cheap, free health check
  (`GET https://openrouter.ai/api/v1/key`, 200 = valid, 401 = invalid), with a
  timeout. Injectable so the web routes are testable without network.
- `POST /api/setup`: openRouterKey is now REQUIRED + validated. Reject empty
  (400) and invalid (400) BEFORE generating the wallet / writing `.env` — a bad
  key must leave nothing persisted.
- SetupFlow: key field is required (Continue disabled until non-empty); surface
  the server's "didn't validate" error inline.
- Settings: an "OpenRouter API key" section to set/change/reset the key, via a
  new loopback-only + authed route that validates before persisting +
  `setRuntimeEnv`.
- Tests: setup rejects empty + invalid (injected verifier), accepts valid;
  the settings key route validates; nothing persisted on a bad key.

## Notes
Trust boundary = same as `POST /api/setup` (loopback-only, behind the
Host/Origin guard). Stacked on !54.
