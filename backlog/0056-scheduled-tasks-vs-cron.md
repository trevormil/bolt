---
id: 56
title: "Reconsider in-app scheduled tasks vs. OS cron (likely remove)"
status: closed
priority: low
type: dx
source: review
created: 2026-05-28
updated: 2026-05-28
refs: ["0036-agent-scheduled-tasks.md", "0018-proactive-checkins.md"]
---

## Description
Trevor's call (2026-05-28): not sure the in-app scheduler earns its keep — the OS
already has cron. Today Bolt ships its own `TaskScheduler` (#36) + a Settings
"Scheduled tasks" section + proactive check-ins (#18), all running inside the
daemon. It is NOT a view into OS cron — it's a parallel scheduler.

Decide: **remove** the in-app scheduler + the Settings tasks UI and lean on OS
cron (`* * * * * cd <repo> && vellum chat <persona> "<prompt>"`), OR keep it.

## Acceptance criteria (if removing)
- Drop the Settings "Scheduled tasks" section + the `TaskScheduler` wiring in the
  daemon; keep `vellum chat` callable from cron.
- Decide the fate of proactive check-ins (#18) — same question.
- A short runbook: "schedule Bolt with cron" (the one-liner + the armed/read-only
  consideration — a cron job is effectively always 'armed', so document the spend
  exposure).
- If KEEPING: justify it over cron (e.g. armed/read-only gating, per-task ledger,
  GUI) and leave as-is.

## Notes
Leaning remove (simpler; OS cron is the right primitive). The capability/armed
gating (T-13) is the one thing cron loses — weigh that before deleting.

## Closure (2026-05-28)
Removed. Deleted the `TaskScheduler` (#36) + `CheckInScheduler` (#18) loops, the
whole `@vellum/scheduler` package, the engine's `TaskStore` + agent schedule
tools (`scheduleTools`), the web task routes + Settings "Scheduled tasks" UI, and
the daemon/telegram scheduler wiring. Bolt now leans on OS cron — documented in
`docs/runbooks/schedule-with-cron.md` (the `bun run vellum chat <persona>
"<prompt>"` one-liner). Accepted tradeoff: a cron job is effectively always
"armed" (can move money), so the read-only-default gating the in-app scheduler
provided is gone — the runbook calls this out.
