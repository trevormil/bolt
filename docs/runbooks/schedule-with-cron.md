---
title: "Schedule Bolt with OS cron"
last-verified: 2026-05-28
---

# Schedule Bolt with OS cron

Bolt no longer ships an in-app scheduler (the #18 check-in + #36 scheduled-task
subsystem was removed in #56). Recurring prompts are now driven by the operating
system's `cron` instead. A cron entry simply re-runs the one-shot CLI chat
command on a schedule, against the same `~/.vellum` database the daemon and web
UI share.

## The command cron runs

The CLI's one-shot chat subcommand is:

```
bun run vellum chat <persona-id> "<prompt>"
```

`bun run vellum` resolves to `bun packages/cli/src/cli.ts` (see the root
`package.json`), so the cron entry must `cd` into the repo first (that's where
`.env` is loaded and where the `vellum` script is defined). For example, to run a
daily vault summary for the `atlas` persona every morning at 9am:

```cron
0 9 * * * cd /path/to/vellum-project && bun run vellum chat atlas "Summarize my vault balances"
```

To run something every minute (useful while testing the wiring):

```cron
* * * * * cd /path/to/vellum-project && bun run vellum chat atlas "<prompt>"
```

Edit your crontab with `crontab -e`. Use an absolute path to the repo, and make
sure `bun` is on `cron`'s `PATH` (cron runs with a minimal environment — set
`PATH=` at the top of the crontab, or call bun by its absolute path, e.g.
`~/.bun/bin/bun`).

Output goes to stdout; redirect it to a log file if you want a record:

```cron
0 9 * * * cd /path/to/vellum-project && bun run vellum chat atlas "Daily digest" >> ~/.vellum/cron.log 2>&1
```

## Security tradeoff: a cron job is always "armed"

The removed in-app scheduler defaulted scheduled runs to **read-only** — they
could observe and reply, but could not move money unless the task was explicitly
*armed* (#24 / T-13). A cron job has no such gate: it runs the full interactive
chat flow, with the persona's vault tools available. In effect, **every cron
prompt is "armed"** — it can create vaults, withdraw within the on-chain rules,
and otherwise spend, bounded only by the persona's capability grants (#37) and
the on-chain vault gating.

So only schedule prompts you would trust to run unattended and that you are
comfortable having money-moving authority. For a purely informational job (a
summary, a balance check), the prompt itself should not ask the agent to spend —
but unlike the old scheduler there is no read-only enforcement backing that up.
If you need a hard guarantee that a scheduled prompt cannot move funds, lock down
the persona's capabilities (revoke `spend` / `vault.withdraw`) before scheduling
it.
