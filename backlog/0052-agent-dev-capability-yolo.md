---
id: 52
title: "Agent dev capability: command execution + YOLO filesystem/exec by default"
status: in-progress
priority: high
type: feature
source: planning
created: 2026-05-28
updated: 2026-05-28
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/56"]
refs: ["0035-filesystem-tools.md", "0037-capability-permission-model.md", "0024-security-hardening-premainnet.md", "0019-install-onboarding-wizard.md"]
---

## Description
Vellum can't act as a coding/dev agent yet. The only local-system tools are
`fs_read` / `fs_list` / `fs_write`, gated on `fs.read` / `fs.write` capabilities
that `grantDefaultCapabilities` does NOT grant (it grants only `spend`,
`vault.create`, `vault.withdraw`, `schedule`). So out of the box the agent can't
touch the filesystem at all, and there is **no command-execution tool** — it
cannot launch commands, build, or run code. The OpenClaw / Claude-Code-style dev
capability is entirely absent.

Direction (Trevor): default to **YOLO mode** — full filesystem + command
execution in a workspace — disclosed clearly at setup, as the default (likely the
only) mode. Keep the capability model (#37) as the enforcement *mechanism*; YOLO
is a permissive default *policy*, not the removal of enforcement. Crucially, the
**money guardrails stay rule-bound regardless** — a YOLO dev agent still cannot
move funds beyond vault gating / the spend gate.

## Acceptance criteria
- **Command-execution tool**: a `run_command` (shell/exec) agent tool — run a
  command in the workspace, capture stdout/stderr/exit, feed the result back to
  the model. Gated by a new `exec` capability (#37). Bounded: output truncation +
  a per-command timeout so a runaway build can't hang the loop.
- **Workspace concept**: a configurable agent working directory (default e.g.
  `~/.vellum/workspace` or a path chosen at setup) that fs + exec operate in.
- **YOLO default + disclosure**: the install wizard (#19) clearly discloses "this
  agent can read/write files and run commands in <workspace> — full access" and,
  on consent, grants `fs.read` + `fs.write` (workspace root) + `exec` by default.
  Informed consent, not silent.
- **Trust boundaries preserved**: fs/exec withheld from read-only/proactive runs
  (T-13) unless armed; every op ledgered + on the timeline; MONEY stays separate
  (vault gating + spend gate unchanged). Consider a small denylist / confirm for
  catastrophic ops (`rm -rf /`, etc.) even in YOLO.
- **Optional sandbox (future)**: document the path to running exec in a
  container/sandbox vs. the host; YOLO = host by default.
- Tests: exec denied without the grant; output truncation + timeout; workspace
  scoping (can't escape the root via `..`/symlinks — extends the #35 symlink
  guard); read-only run has no exec/write.

## Notes
Highest-risk LOCAL capability (arbitrary code execution). Disclose loudly, scope
to a workspace, keep money rule-bound. The capability model already supports a new
`exec` grant + scoping; this ticket is the tool + the default-policy shift + the
setup disclosure. Pairs with #51 (money autonomy) to make Vellum a genuinely
capable assistant, with the trust boundary firmly on the money side.
