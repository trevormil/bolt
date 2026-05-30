---
id: 111
title: "SPA component structure: split Vaults.tsx (827 lines), Settings.tsx (590), Chat.tsx markdown decls"
status: icebox
priority: medium
type: refactor
source: audit-2026-05-29
created: 2026-05-29
refs: []
---

## Description
Two large React components dominate the SPA. Splitting maps to real UX concerns
(manager vs agent flows, independent settings panels) and reduces cognitive
load on every future change.

### 1. `Vaults.tsx` (827 lines / 5 sub-components in one file)
- Where: `packages/web/src/app/Vaults.tsx:15, 378, 387, 395, 409, 420`.
- `VaultsView` + `VaultRow` (which itself owns the withdraw form + sign-off
  panel) + `Label` + date helpers in one file. 25 hook calls; the gating form
  has 30+ derived values inline.
- Split into:
  - `Vaults/index.tsx` — list + tab
  - `Vaults/CreateForm.tsx` — name/symbol + delegated GatingEditor
  - `Vaults/GatingEditor.tsx` — policy form + preview (~250 lines)
  - `Vaults/VaultRow.tsx` — escrow + withdraw + sign-off
  - `Vaults/ManagerActions.tsx` — drain / revoke
  - `Vaults/format.ts` — date helpers

### 2. `Settings.tsx` (590 lines / 9 sibling section components)
- Where: `packages/web/src/app/Settings.tsx:22, 91, 177, 303, 399, 463`.
- Six independent panels (`LlmKey`, `Telegram`, `PersonaInstructions`,
  `Recovery`, `Model`, `Budget`), each ~80-150 lines, all inline. Each uses
  the same `configured/busy/saved/error+timeout` state machine.
- Split each panel into `Settings/<Name>Section.tsx`. Extract the shared
  state into a `useSaveAction({ save, after })` hook (six near-duplicates
  collapse to one).

### 3. `Chat.tsx` markdown component map
- Where: `packages/web/src/app/Chat.tsx:1-50` — the `components: { a, code, ul, …,
  p }` map at the top of the file is ~50 lines before the actual Chat
  component starts.
- Extract to `Chat/markdown.tsx` (or `Chat/components.tsx`) for readability.

## Acceptance criteria
- Each component file ≤ 400 lines.
- `useSaveAction` hook covers the configured/busy/saved/error pattern; six
  Settings sections use it.
- Visual + behavioral parity with current SPA (existing e2e + activity specs
  stay green).
- No new abstraction layers — just folder structure + one shared hook.

## Notes
Architecture #8 + #9, maintainability #14 + #15. Pure mechanical refactor;
zero behavior change.


## Status (2026-05-30) — iceboxed
Audit-cut for the hiring-partner submission frame. Pure organizational
refactor / cleanliness work with **no behavior change**; reviewer reads
the code linearly, not the file tree. Real wins for the codebase
long-term, but the submission frame says ship #99–#104 (real demo-path
bugs) and defer this. Revisit post-submission.
