---
id: 97
title: "Flaky e2e: chat sessions rename/delete spec (strict-mode locator + timing)"
status: open
prs: []
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
