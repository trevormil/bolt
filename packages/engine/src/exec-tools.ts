import { mkdirSync } from "node:fs";
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
];

function catastrophicReason(command: string): string | null {
  for (const { pattern, why } of CATASTROPHIC)
    if (pattern.test(command)) return why;
  return null;
}

// Read a stream to a string but STOP after maxBytes, then cancel — so a flooding
// command (`yes`, `cat /dev/zero`) can't balloon daemon memory before the timeout
// kills it (the full-buffer `Response(stream).text()` would OOM first). Appends a
// truncation marker when it caps.
async function readCapped(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let capped = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      total += value.length;
      if (total >= maxBytes) {
        capped = true;
        break;
      }
    }
  } finally {
    reader.cancel().catch(() => {}); // closes our end; the child SIGPIPEs/gets killed
  }
  const text = Buffer.concat(chunks).subarray(0, maxBytes).toString("utf8");
  return capped ? `${text}\n…(truncated at ${maxBytes} bytes)` : text;
}

// Run `command` under the system shell with cwd pinned to the workspace. Bun's
// spawn with a string array would skip the shell; we want shell semantics
// (pipes, &&) like a dev terminal, so we invoke `sh -c`. The timeout races a
// kill against process exit so a hung command can't block the loop; reads are
// byte-capped so a flood can't blow up memory either.
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
  const proc = Bun.spawn(["sh", "-c", command], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    // Inherit env but never the agent's secrets/keys — strip them so a spawned
    // command can't exfiltrate the mnemonic / API keys via the environment.
    env: redactedEnv(),
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill("SIGKILL"); // hard kill — SIGTERM may be ignored by a busy build
  }, timeoutMs);

  try {
    const [stdout, stderr] = await Promise.all([
      readCapped(proc.stdout, maxOutput),
      readCapped(proc.stderr, maxOutput),
    ]);
    const exitCode = await proc.exited;
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
