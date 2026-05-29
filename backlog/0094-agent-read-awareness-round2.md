---
id: 94
title: "Agent read-awareness round 2 — request_status tool + per-period remaining-allowance"
status: closed
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/79", "https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/82"]
priority: medium
type: feature
source: audit
created: 2026-05-29
updated: 2026-05-29
refs: ["0088-agent-capability-audit.md", "0083-multisig-vote-progress-ux.md", "0067-agent-request-tools.md"]
---

## Description
#88 added `recent_activity` + `vault_details`, closing most of the agent's
read-awareness gap. Two acceptance items remain so it doesn't act blind:

1. **`request_status` read tool (independent — doable now).** The `request_*`
   tools mint pay/deposit/vote links but the agent can't check whether a request
   was fulfilled. Add a capability-gated tool that reports the status of this
   persona's payment/deposit/vote requests (pending / funded / signed-off) so the
   agent can follow up.
2. **Per-period remaining allowance (BLOCKED on #83's chain read).**
   `vault_details` reports the static cap only; the agent can't see how much it
   may still withdraw this period. Computing this needs the on-chain
   approval/challenge **usage-tracker** read — the SAME missing `@vellum/chain`
   query that #83 (multisig vote tally) needs. Do NOT start this half until that
   chain-read spike lands; then surface "X of Y USDC left this period" in
   `vault_details`.

## Acceptance criteria
- `request_status` agent tool: lists/looks-up this persona's request states,
  capability-gated (#37), read-only, tested. (Reads `payment-requests.ts` /
  `deposit-requests.ts` stores + vault sign-off state.)
- Once #83's chain-read helper exists: `vault_details` (or a dedicated tool)
  reports remaining per-period allowance, tested.
- Document the final read-tool inventory.

## Notes
Split-able: ship `request_status` now; gate the remaining-allowance half on #83.
Lower urgency since #85/#89 now reject over-cap attempts cleanly, but it's the
"act → perceive" completion of #88. Keep additions minimal + gated (§2).

## Update (2026-05-29) — both halves shipped
- `request_status` (outstanding payment/deposit requests) → MR !79.
- Remaining-allowance in `vault_details` (gated on #83's chain-read) → MR !82,
  **live-verified** on the Meridian devnet: vault 236, 5 USDC/day cap, withdrew
  2, `getApprovalTracker(initiatedBy, agent)` returned `amount:"2000000"` exactly
  → "3.00 of 5 USDC left." Both MRs unmerged (human-merge only) so this stays
  in-progress until the deep review + merge.
