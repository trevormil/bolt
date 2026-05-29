---
id: 57
title: "Export agent seed phrase from Settings (deliberate reveal)"
status: in-progress
priority: medium
type: feature
source: review
created: 2026-05-28
updated: 2026-05-28
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/52"]
refs: ["0019-install-onboarding-wizard.md"]
---

## Description
Trevor's call (2026-05-28): the agent's master mnemonic is the **agent's** key,
not something the user should be made to write down during onboarding. The web
setup flow (#19) no longer shows the generated phrase. But the user still needs a
recovery path — so move the reveal to a **deliberate** action in Settings.

## Acceptance criteria
- Settings → a "Wallet / Recovery" section with an **Export seed phrase** action.
- Reveal is **deliberate** (confirm click, blurred-until-revealed, copy button) —
  not shown by default, never logged.
- Server route to read the mnemonic: **loopback-only + authed** (same boundary as
  `/api/setup`), returns the phrase from the running env. It is the one place the
  phrase travels to the browser; gate it as tightly as the setup route.
- The phrase is the master `AGENT_SIGNER_MNEMONIC`; show the derivation note (all
  persona wallets derive from it) so the user understands what they're backing up.
- Test the route's loopback + auth gating (cross-origin/exposed → refused).

## Notes
Pairs with #19 onboarding. The onboarding no longer displays the phrase (it's
returned `{ok:true}` only); this ticket is the recovery counterpart. Treat the
reveal route as trust-critical — same Host/Origin guard that #51 hardened.
