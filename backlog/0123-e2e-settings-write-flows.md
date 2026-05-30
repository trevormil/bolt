---
id: 123
title: "e2e: Settings WRITE flows — rotate key, set-Telegram, reveal-seed"
status: closed
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/103"]
priority: high
type: testing
source: audit-2026-05-29
created: 2026-05-29
updated: 2026-05-29
refs: ["0106-test-coverage-backfill.md", "0096-agent-key-at-rest-keychain.md"]
---

## Description
Split from #0106 §4. `e2e/settings.spec.ts` only asserts panel headings
render. The actual write actions — rotate OpenRouter key, set Telegram
token, reveal seed (the keychain dance from ADR-0007) — go through the SPA
but are unwalked.

## Acceptance criteria
- `e2e/settings-write.spec.ts`:
  - **Rotate OpenRouter key**: paste new key → save → `hasLlmKey` flips +
    the new value is used on the next chat round.
  - **Set Telegram token**: paste token → save → `telegramConfigured`
    flips; (mock) bot becomes addressable.
  - **Reveal seed**: click-to-reveal → seed shown (matches the keychain
    read seam); confirm hide-on-blur or auto-clear timer.
- The seed-reveal spec MUST NOT log the seed value (assert `toBeVisible`
  on the selector but never `console.log(text)`).

## Notes
The keychain read via `security` may need a CI-friendly stub; the
existing env-first resolver is the simplest seam. Don't take a hard
dependency on `security` in CI.
