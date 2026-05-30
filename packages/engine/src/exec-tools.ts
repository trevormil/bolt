import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { env, ensureWorkspaceDir } from "@vellum/shared";
import type { ToolInvoker, ToolSpec } from "@vellum/agent";
import type { Engine } from "./engine.ts";

// Command-execution tool (#52) — the highest-risk LOCAL capability (arbitrary
// code execution). It is the YOLO dev capability: the agent runs shell commands
// IN its workspace, like Claude Code / OpenClaw. Every guard the ticket calls
// for is enforced here:
//   - capability-gated on a NEW `exec` grant (default-deny via the #37 model).
//     The grant is UNSCOPED (host-wide) — NOT a false workspace scope: a `sh -c`
//     command's cwd STARTS in the workspace but can `cd` / touch absolute paths,
//     so exec is full host access, not sandboxed (!56). Setup discloses this as
//     "full local access" — the informed opt-in. Real isolation = future sandbox.
//   - a per-command timeout kills the process so a runaway build can't hang the
//     loop; output is byte-capped during the read so a flood can't blow up memory.
//   - a denylist refuses catastrophic host ops (rm -rf / and /*, fork bombs, …) —
//     a guardrail, NOT a security boundary (exec is arbitrary code by design).
//   - MONEY: host-wide exec is NOT money-rule-bound — a shell can read the signing
//     key from disk + move funds. The vault/spend gates bind the agent's structured
//     tools only. YOLO exec = full trust (disclosed at setup); ADR-0004.

// Catastrophic-op denylist (#52). NOT a security boundary — exec is arbitrary
// code execution by design, so this can't be exhaustive. It's a guardrail that
// refuses the handful of obviously-catastrophic host-wide commands an LLM might
// emit by mistake (wiping the disk, fork bombs, repartitioning), keeping the
// blast radius near the workspace. Real isolation is the future sandbox path
// (ticket Notes / ADR).
// A "command position" prefix: start of string, or after a shell separator
// (; && || | & ( newline) optionally followed by `sudo`. Anchors the
// host-control patterns to an actual invocation, so `grep reboot log.txt` or a
// path that merely CONTAINS the word isn't refused.
const CMD = String.raw`(?:^|[;&|(\n])\s*(?:sudo\s+)?`;
const CATASTROPHIC: { pattern: RegExp; why: string }[] = [
  // rm with a recursive/force flag targeting `/` or `/*` (the filesystem root /
  // its top-level glob — `rm -rf /*` is just as catastrophic as `rm -rf /`).
  {
    pattern: /\brm\s+(?:-[a-z]*\s+)*-[a-z]*[rf][a-z]*\b[^\n]*\s\/(\s|$|\*)/,
    why: "recursive delete of the filesystem root",
  },
  // rm with a recursive/force flag targeting ~ or $HOME.
  {
    pattern:
      /\brm\s+(?:-[a-z]*\s+)*-[a-z]*[rf][a-z]*\b[^\n]*\s(~|\$HOME)(\s|\/|$)/,
    why: "recursive delete of the home directory",
  },
  {
    pattern: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    why: "fork bomb",
  },
  {
    pattern: new RegExp(`${CMD}mkfs(\\.\\w+)?\\b`),
    why: "filesystem reformat",
  },
  {
    pattern: new RegExp(`${CMD}dd\\b[^\\n]*\\bof=/dev/(sd|nvme|disk|hd)`),
    why: "raw write to a block device",
  },
  {
    pattern: />\s*\/dev\/(sd|nvme|disk|hd)\w*/,
    why: "redirect over a block device",
  },
  {
    pattern: new RegExp(`${CMD}(shutdown|reboot|halt|poweroff)\\b`),
    why: "host power state change",
  },
  // Keychain-read denylist (#102 §3 / ADR-0007 residual). `redactedEnv()` strips
  // secret env vars from the child, but the macOS keychain is queried by OS-user
  // identity, not env. A prompt-injected agent running `security find-generic-
  // password -s vellum-agent-signer -a AGENT_SIGNER_MNEMONIC -w` can exfil the
  // seed even after ADR-0007. Refuse the `security` CLI's secret-read
  // subcommands at the boundary. Real isolation is the ADR-0004 sandbox.
  {
    pattern: new RegExp(
      `${CMD}security\\s+(?:-[A-Za-z]+\\s+)*` +
        `(?:find-generic-password|find-internet-password|export|dump-keychain)\\b`,
    ),
    why: "OS keychain secret read",
  },
  // Vellum data-dir read (#102 §3). The local data home holds the engine SQLite
  // (no seed in this DB, but vault metadata + persona memory) and the workspace
  // dir. Reading them isn't catastrophic per se but it's a common exfil pattern
  // an LLM injection lands on after the keychain denylist closes. Refuse `cat`
  // / `head` / `tail` / `less` / `more` / `xxd` / `od` against `~/.vellum/`.
  {
    pattern: new RegExp(
      `${CMD}(?:cat|head|tail|less|more|xxd|od|hexdump|strings)\\s+[^\\n]*` +
        `(?:~|\\$HOME)/\\.vellum(?:\\b|/)`,
    ),
    why: "read of the vellum data home",
  },
];

function catastrophicReason(command: string): string | null {
  for (const { pattern, why } of CATASTROPHIC)
    if (pattern.test(command)) return why;
  return null;
}

// Read a stream to a string but STOP after maxBytes, then destroy it — so a
// flooding command (`yes`, `cat /dev/zero`) can't balloon daemon memory before
// the timeout kills it. Destroying our read end SIGPIPEs the writer (the child),
// so a flood self-terminates promptly. Appends a truncation marker when it caps.
async function readCapped(stream: Readable, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  let capped = false;
  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(chunk);
      total += chunk.length;
      if (total >= maxBytes) {
        capped = true;
        break;
      }
    }
  } finally {
    stream.destroy();
  }
  const text = Buffer.concat(chunks).subarray(0, maxBytes).toString("utf8");
  return capped ? `${text}\n…(truncated at ${maxBytes} bytes)` : text;
}

// Run `command` under the system shell with cwd pinned to the workspace. We want
// shell semantics (pipes, &&) like a dev terminal, so we invoke `sh -c`. Spawned
// `detached` so the shell becomes its OWN process-group LEADER (pgid === pid):
// the timeout then kills the WHOLE group (`-pid`), not just the shell, so a
// command that backgrounds children can't leave them orphaned after we return
// (!65 review). Reads are byte-capped so a flood can't blow up memory either.
async function runInWorkspace(
  command: string,
  cwd: string,
  timeoutMs: number,
  maxOutput: number,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}> {
  const proc = spawn("sh", ["-c", command], {
    cwd,
    // Inherit env but never the agent's secrets/keys — strip them so a spawned
    // command can't exfiltrate the mnemonic / API keys via the environment.
    env: redactedEnv(),
    detached: true, // new process group so we can signal the whole tree
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Kill the entire process group (negative pid). `detached` makes pid the group
  // leader, so `-pid` reaches every descendant. Fall back to the lone process if
  // the group is already gone (ESRCH), and swallow — the child has exited.
  const killTree = (signal: NodeJS.Signals) => {
    if (proc.pid === undefined) return;
    try {
      process.kill(-proc.pid, signal);
    } catch {
      try {
        proc.kill(signal);
      } catch {
        /* already exited */
      }
    }
  };

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    killTree("SIGKILL"); // hard kill the tree — SIGTERM may be ignored
  }, timeoutMs);

  // The exit code, from `close` (fires after stdio EOF). A signalled kill reports
  // code=null → surface a non-zero code so callers see it didn't exit cleanly.
  const exited = new Promise<number>((resolve) => {
    proc.on("close", (code, signal) => resolve(code ?? (signal ? 137 : -1)));
    proc.on("error", () => resolve(-1)); // spawn failure (e.g. sh missing)
  });

  try {
    const [stdout, stderr] = await Promise.all([
      readCapped(proc.stdout!, maxOutput),
      readCapped(proc.stderr!, maxOutput),
    ]);
    // Reads finished but the child (or a descendant it backgrounded) may still
    // be alive — e.g. a flood we capped. Reap the whole tree so nothing orphans.
    if (proc.exitCode === null && proc.signalCode === null) killTree("SIGKILL");
    const exitCode = await exited;
    return { stdout, stderr, exitCode, timedOut };
  } finally {
    clearTimeout(timer);
  }
}

// Strip secret-bearing env vars from the child's environment. exec is local-host
// arbitrary code, but there's no reason a `ls` or `npm test` needs the agent's
// signer mnemonic or LLM key in its env — drop them to shrink the blast radius.
function redactedEnv(): Record<string, string> {
  const SECRET = /MNEMONIC|PRIVKEY|API_KEY|TOKEN|SECRET/i;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env))
    if (v !== undefined && !SECRET.test(k)) out[k] = v;
  return out;
}

export function execTools(
  engine: Engine,
  personaId: string,
): { tools: ToolSpec[]; invoke: ToolInvoker } {
  // The command's cwd (its STARTING directory). exec itself is host-wide, so the
  // `exec` capability is unscoped — we don't pass a target to authorize() (it
  // matches the unscoped grant). Create the dir if missing.
  const workspace = ensureWorkspaceDir();

  const tools: ToolSpec[] = [
    {
      name: "run_command",
      description:
        "Run a shell command on this machine (like a dev terminal) and get back its stdout, stderr, and exit code. Full local access — it starts in your workspace directory but can reach anywhere on the host. Use for building, testing, running scripts, git, etc. Long-running commands are killed after a timeout; output is truncated if large.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description:
              "The shell command to run, e.g. `bun test` or `git status`.",
          },
        },
        required: ["command"],
      },
    },
  ];

  // exec telemetry (#42): record the op + ok/err on the activity timeline.
  // Metadata only — the command string is operational; output is never emitted.
  const execEvent = (
    command: string,
    ok: boolean,
    meta: Record<string, unknown>,
  ) =>
    engine.events.emit({
      personaId,
      kind: "tool_call",
      summary: `exec: ${command.slice(0, 60)}`,
      ok,
      meta: { tool: "run_command", source: "exec", ...meta },
    });

  const invoke: ToolInvoker = async (name, args) => {
    if (name !== "run_command") return `unknown tool: ${name}`;
    const command = String(args.command ?? "").trim();
    if (!command) return "A command is required.";

    // Refuse catastrophic host ops BEFORE the capability check, so a denied
    // command is never even authorized/ledgered as runnable.
    const danger = catastrophicReason(command);
    if (danger) {
      execEvent(command, false, { refused: danger });
      return `Refused: that command looks like ${danger}. I won't run host-destroying commands even in YOLO mode.`;
    }

    // Gate on the `exec` capability (#37). Default-deny: without the grant the
    // agent cannot run anything. exec is UNSCOPED (host-wide) — no target — so we
    // don't imply a workspace confinement the shell doesn't actually enforce (!56).
    const ok = await engine.authorizer.authorize(personaId, {
      capability: "exec",
      summary: `run command (cwd ${workspace}): ${command.slice(0, 80)}`,
    });
    if (!ok) {
      execEvent(command, false, { denied: true });
      return `Denied: no exec permission.`;
    }

    // Defensive: the workspace could have been removed between provisioning and
    // now; recreate it so cwd is always valid.
    mkdirSync(workspace, { recursive: true });

    const { stdout, stderr, exitCode, timedOut } = await runInWorkspace(
      command,
      workspace,
      env.VELLUM_EXEC_TIMEOUT_MS,
      env.VELLUM_EXEC_MAX_OUTPUT,
    );
    execEvent(command, !timedOut && exitCode === 0, {
      exitCode,
      timedOut,
    });

    const parts = [
      timedOut
        ? `timed out after ${env.VELLUM_EXEC_TIMEOUT_MS}ms (killed); exit ${exitCode}`
        : `exit ${exitCode}`,
      `stdout:\n${stdout || "(empty)"}`,
      `stderr:\n${stderr || "(empty)"}`,
    ];
    return parts.join("\n\n");
  };

  return { tools, invoke };
}
