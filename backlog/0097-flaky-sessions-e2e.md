---
id: 97
title: "Flaky e2e: chat sessions rename/delete spec (strict-mode locator + timing)"
status: in-progress
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/85"]
priority: low
type: testing
source: observed
created: 2026-05-29
refs: ["0072-chat-sessions.md"]
---

## Description
`e2e/sessions.spec.ts` ("create, auto-title, switch, rename, and delete
sessions") fails intermittently — the failing line moves between runs (seen at
the dblclick rename and at the earlier visibility wait), which points at a timing
race plus a brittle locator.

Confirmed **pre-existing** and unrelated to the unified-observability work (#95):
it fails on the base branch too, with and without that MR's test-server seed.

Two issues to fix together:
1. **Strict-mode violation.** `rail.getByRole("button", { name: /Plan my taxes
   e2e/ })` matches BOTH the session button and the delete button (whose
   accessible name is "Delete chat: Plan my taxes e2e"). When the row is hovered
   (delete button enters the a11y tree) the locator resolves to 2 elements and
   throws. Disambiguate the session button from the delete button.
2. **Auto-title timing.** A naive `^`-anchored regex broke the visibility wait,
   suggesting the auto-title isn't a clean prefix when first asserted — the spec
   likely needs to wait for the settled title before interacting.

## Acceptance criteria
- `e2e/sessions.spec.ts` passes deterministically across repeated runs
  (`bun run test:e2e e2e/sessions.spec.ts` green ≥5×).
- The session-button locators no longer collide with the delete button.

## Notes
LOW priority — a test-only flake, no product impact. Don't paper over it with a
blanket retry; fix the locator + the title-settle wait so the gate is honest.

## Update (2026-05-29) — issue 1 fixed (MR !85); issue 2 (timing) remains
**Issue 1 (strict-mode locator) — FIXED.** Switched the session-button locators
to exact-name matching (`{ name: "Plan my taxes e2e", exact: true }`). The delete
button's accessible name is "Delete chat: …" so it no longer collides. Confirmed:
the error changed from "resolved to 2 elements" to a plain not-found, and warm
runs are green 4/4 repeatedly.

**Issue 2 (auto-title render race) — REMAINS, ~1/6 on COLD first runs.** The
auto-titled session button occasionally doesn't appear within the 10s wait —
`send()` fires `refreshSessions()` fire-and-forget after the reply
(`Chat.tsx:151`), so a cold-run lag between the reply and the rail re-fetch can
leave the rail on "New chat". CI's `retries: 1` absorbs it today. The clean fix is
product-side: optimistically set the active session's title from the first message
(server auto-title = first line ≤50, which the client already has) so the rail
updates instantly without depending on the refresh round-trip. Then the e2e is
deterministic with no retry reliance. Sequenced as a follow-on (not done in slice
1 to keep it test-only).
