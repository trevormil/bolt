---
id: 4
title: YOLO command execution is host-wide (not sandboxed), by disclosed default
status: accepted
date: 2026-05-28
---

## Context

#52 gives the agent a `run_command` tool — the OpenClaw / Claude-Code dev
capability. The product intent (Trevor, explicit + repeated) is **YOLO by
default**: out of the box the agent can read/write files and run commands so it
can build, test, and code, like a local dev agent.

The first cut granted `exec` "scoped to the workspace," but that was a **false
confinement claim** (!56 review, HIGH): `run_command` only sets the process
`cwd`; a `sh -c` command can `cd /`, read absolute paths (`~/.vellum`), hit the
network, and mutate host files. A workspace-scoped grant implied a sandbox the
implementation never had.

Two honest options: (a) actually sandbox exec (container/chroot), or (b) keep
host-wide exec but make the grant + disclosure honest. The spec defers real
isolation to "future sandbox," and YOLO-by-default is the deliberate product
posture — so (b) now, (a) later.

## Decision

`exec` is an **unscoped (host-wide)** capability, granted by default as part of
the YOLO policy, gated by the #37 capability model (default-deny without the
grant) and disclosed as **"full local access — runs any command on this machine,
not sandboxed"** at setup (CLI wizard + web onboarding). The command's `cwd`
starts in the workspace, but that is a convenience, not a boundary.

Asymmetry, by design:
- **`fs.read` / `fs.write`** stay **workspace-scoped** — genuinely confined (the
  target must resolve under the workspace root; the #35 symlink/`..` guard holds).
- **`exec`** is **host-wide** — honestly unscoped, because the shell isn't
  confined. We do NOT pretend otherwise.

Guardrails that remain (blast-radius reduction, not a security boundary):
per-command timeout (SIGKILL), byte-capped output, a catastrophic-op denylist
(`rm -rf /` and `/*`, fork bombs, `mkfs`, `dd` to a block device, shutdown), and
secret-env redaction (the child can't read the mnemonic/keys). Read-only runs
(T-13) withhold exec + fs-write entirely.

**Money is never affected by YOLO.** exec is local code execution; it cannot move
funds — vault gating (#45) + the spend gate (#37) are the money boundary and are
unchanged.

## Consequences

- A YOLO agent can do anything the user can on the host. This is informed consent
  (the setup disclosure is explicit), matching the OpenClaw/Claude-Code model.
- The capability model is the only enforcement: revoke `exec` (and `fs.*`)
  per-persona to lock an agent down; an un-provisioned/raw engine is default-deny.
- **Superseded when** a real sandbox lands: exec should run in a
  container/namespace/chroot so host-wide access becomes opt-in over a confined
  default. That is the follow-up isolation work — this ADR documents the interim
  host-by-default posture, not the end state.
