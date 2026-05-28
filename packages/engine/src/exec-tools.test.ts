import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateWallet } from "@vellum/chain";
import { env, setRuntimeEnv, workspaceDir } from "@vellum/shared";
import { createEngine, execTools, type Engine } from "./index.ts";

// The exec tool reads the live `env` singleton at call time; restore the bounds
// after each test that overrides them so others see the real defaults.
const DEFAULT_TIMEOUT = env.VELLUM_EXEC_TIMEOUT_MS;
const DEFAULT_MAX_OUTPUT = env.VELLUM_EXEC_MAX_OUTPUT;

let mnemonic: string;
let workspace: string;

beforeEach(async () => {
  mnemonic = (await generateWallet()).mnemonic;
  // Point the agent workspace at a throwaway dir so exec/fs operate there, not
  // in the real ~/.vellum/workspace. realpath it: the exec grant scope is the
  // canonical path workspaceDir() returns (macOS /tmp → /private/tmp).
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "vellum-exec-")));
  process.env.VELLUM_WORKSPACE = workspace;
});
afterEach(() => {
  delete process.env.VELLUM_WORKSPACE;
  setRuntimeEnv({
    VELLUM_EXEC_TIMEOUT_MS: DEFAULT_TIMEOUT,
    VELLUM_EXEC_MAX_OUTPUT: DEFAULT_MAX_OUTPUT,
  });
  rmSync(workspace, { recursive: true, force: true });
});

function eng(): Engine {
  return createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic,
    runLoop: async () => ({ text: "", meters: [] }),
  });
}

function grantExec(e: Engine, personaId = "p"): void {
  e.capabilities.grant({
    personaId,
    capability: "exec",
    scope: workspaceDir(), // identical canonical scope the tool authorizes against
    mode: "allow",
  });
}

describe("run_command exec tool (#52)", () => {
  test("denied without the exec grant (default-deny, fail-closed)", async () => {
    const e = eng();
    const out = await execTools(e, "p").invoke("run_command", {
      command: "echo hi",
    });
    expect(out).toContain("Denied");
    expect(out).not.toContain("hi");
  });

  test("runs in the workspace and returns stdout + exit code", async () => {
    const e = eng();
    grantExec(e);
    const out = await execTools(e, "p").invoke("run_command", {
      command: "echo hello && pwd",
    });
    expect(out).toContain("hello");
    expect(out).toContain("exit 0");
    expect(out).toContain(workspace); // cwd is pinned to the workspace
  });

  test("cwd is the workspace, not the process cwd", async () => {
    const e = eng();
    grantExec(e);
    // Create a marker file in the workspace; `ls` from the command must see it.
    writeFileSync(join(workspace, "marker.txt"), "x");
    const out = await execTools(e, "p").invoke("run_command", {
      command: "ls",
    });
    expect(out).toContain("marker.txt");
  });

  test("non-zero exit is reported, not thrown", async () => {
    const e = eng();
    grantExec(e);
    const out = await execTools(e, "p").invoke("run_command", {
      command: "exit 3",
    });
    expect(out).toContain("exit 3");
  });

  test("stdout is truncated past the cap", async () => {
    setRuntimeEnv({ VELLUM_EXEC_MAX_OUTPUT: 50 });
    const e = eng();
    grantExec(e);
    const out = await execTools(e, "p").invoke("run_command", {
      // 500 'a' chars — well over the 50-char cap.
      command: "for i in $(seq 1 500); do printf a; done",
    });
    expect(out).toContain("truncated");
    // The captured stdout block must not contain the full 500-char run.
    expect(out).not.toContain("a".repeat(200));
  });

  test("an infinite-output flood is byte-capped, not OOM'd or timed out", async () => {
    // `yes` floods stdout forever. The capped read must stop at the byte limit
    // and return promptly — well before the timeout — instead of buffering it all.
    setRuntimeEnv({
      VELLUM_EXEC_MAX_OUTPUT: 100,
      VELLUM_EXEC_TIMEOUT_MS: 3000,
    });
    const e = eng();
    grantExec(e);
    const t0 = Date.now();
    const out = await execTools(e, "p").invoke("run_command", {
      command: "yes",
    });
    const elapsed = Date.now() - t0;
    expect(out).toContain("truncated");
    expect(elapsed).toBeLessThan(2000); // capped fast, did NOT ride out the 3s timeout
  });

  test("a command exceeding the timeout is killed and reported", async () => {
    setRuntimeEnv({ VELLUM_EXEC_TIMEOUT_MS: 300 });
    const e = eng();
    grantExec(e);
    const t0 = Date.now();
    const out = await execTools(e, "p").invoke("run_command", {
      command: "sleep 10",
    });
    const elapsed = Date.now() - t0;
    expect(out).toContain("timed out");
    expect(elapsed).toBeLessThan(5000); // killed well before the 10s sleep
  });

  describe("catastrophic-op denylist (refused even in YOLO)", () => {
    const refused = [
      "rm -rf /",
      "rm -rf /  # cleanup",
      "sudo rm -fr /",
      ":(){ :|:& };:",
      "mkfs.ext4 /dev/sda1",
      "shutdown -h now",
      "reboot",
    ];
    for (const cmd of refused) {
      test(`refuses: ${cmd}`, async () => {
        const e = eng();
        grantExec(e); // even WITH the grant, catastrophic ops are refused
        const out = await execTools(e, "p").invoke("run_command", {
          command: cmd,
        });
        expect(out).toContain("Refused");
      });
    }

    test("a normal rm inside the workspace is NOT refused", async () => {
      const e = eng();
      grantExec(e);
      writeFileSync(join(workspace, "junk.txt"), "x");
      const out = await execTools(e, "p").invoke("run_command", {
        command: "rm -f junk.txt",
      });
      expect(out).not.toContain("Refused");
      expect(out).toContain("exit 0");
    });

    // The denylist anchors host-control commands to a command position, so a
    // command that merely MENTIONS the word (as an argument / filename) runs.
    const allowed = [
      "rm -rf ./node_modules",
      'echo "the word reboot in a string"',
      "git log --grep shutdown",
    ];
    for (const cmd of allowed) {
      test(`does not refuse a benign command containing a trigger word: ${cmd}`, async () => {
        const e = eng();
        grantExec(e);
        const out = await execTools(e, "p").invoke("run_command", {
          command: cmd,
        });
        expect(out).not.toContain("Refused");
      });
    }
  });

  test("does not leak secret env vars to the child", async () => {
    process.env.AGENT_SIGNER_MNEMONIC = "leak me not";
    try {
      const e = eng();
      grantExec(e);
      const out = await execTools(e, "p").invoke("run_command", {
        command: "echo MNEMONIC=$AGENT_SIGNER_MNEMONIC",
      });
      expect(out).not.toContain("leak me not");
    } finally {
      delete process.env.AGENT_SIGNER_MNEMONIC;
    }
  });
});
