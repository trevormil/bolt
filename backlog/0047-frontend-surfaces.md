---
id: 47
title: "Frontend surfaces for the overnight features (model, budgets, observability, escrow, tasks)"
status: open
priority: high
type: ux
source: post-overnight-audit
created: 2026-05-28
refs: ["0042-deep-observability-dashboard.md", "0043-per-persona-model-selection.md", "0044-per-persona-spend-budgets.md", "0045-vault-revamp-gating-multisig.md"]
---

## Description
The overnight build shipped #42/#43/#44/#45 as backend + API only — the SPA was
unchanged, so none of it is usable in the UI. This MR wires the frontend:

- **Settings tab** (per-persona): model selector (#43) + budget windows
  daily/weekly/monthly with live burn-down (#44) + scheduled-tasks manager with
  the armed/read-only toggle (#36/#24-T-13).
- **Activity tab**: the #42 observability timeline + per-window summary cards
  (events/cost/tokens/errors).
- **Escrow** displayed per vault in the Vaults tab (#45 slice 1).
- New `tasks` HTTP routes (tasks were agent-tool-only).

## Acceptance criteria
- Each overnight feature has a usable UI surface; no curl-only features.
- Matches the existing @vellum/ui design system + tab pattern.
- Tests for the new api client methods + tasks routes; build green.
