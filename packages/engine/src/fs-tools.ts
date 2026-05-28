import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { ToolInvoker, ToolSpec } from "@vellum/agent";
import type { Engine } from "./engine.ts";

// Resolve a path to its REAL location (following symlinks) before the capability
// check — otherwise a symlink inside a granted root could point outside it and
// escape the grant (#35 symlink finding). For a path that doesn't exist yet
// (writing a new file), realpath the deepest existing ancestor and re-append the
// remainder, so the check still sees the true target directory.
function realResolve(input: string): string {
  const abs = resolve(input);
  const tail: string[] = [];
  let cur = abs;
  while (!existsSync(cur)) {
    tail.unshift(basename(cur));
    const parent = dirname(cur);
    if (parent === cur) return abs; // hit root without an existing ancestor
    cur = parent;
  }
  try {
    const real = realpathSync(cur);
    return tail.length ? join(real, ...tail) : real;
  } catch {
    return abs;
  }
}

const MAX_READ = 20_000; // cap injected file content (chars) — context hygiene

// Local filesystem tools (#35), the OpenClaw-style capability — scoped + gated.
// Every op routes through the capability model (#37): the agent can only touch
// paths the persona has been granted (fs.read / fs.write roots), and writes /
// sensitive paths require approval. The authorizer records each decision, so the
// ledger shows exactly what the agent did on disk. Paths are resolved to an
// absolute form before the grant check so `../` can't escape a granted root.
export function filesystemTools(
  engine: Engine,
  personaId: string,
): { tools: ToolSpec[]; invoke: ToolInvoker } {
  const tools: ToolSpec[] = [
    {
      name: "fs_read",
      description:
        "Read a local text file. Only paths within your granted roots are allowed.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute file path" },
        },
        required: ["path"],
      },
    },
    {
      name: "fs_list",
      description: "List a local directory (within your granted roots).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute dir path" },
        },
        required: ["path"],
      },
    },
    {
      name: "fs_write",
      description:
        "Write (create/overwrite) a local text file. Requires write permission for the path; the human may be prompted to approve.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute file path" },
          content: { type: "string", description: "File contents" },
        },
        required: ["path", "content"],
      },
    },
  ];

  // fs_op telemetry (#42): record the op + ok/err on the activity timeline.
  // Metadata only — the path (operational), never file contents.
  const fsEvent = (op: string, path: string, ok: boolean) =>
    engine.events.emit({
      personaId,
      kind: "fs_op",
      summary: `${op} ${basename(path)}`,
      ok,
      meta: { op, path },
    });

  const invoke: ToolInvoker = async (name, args) => {
    const path = realResolve(String(args.path ?? "")); // symlink-safe
    if (!path || path === "/") return "A specific path is required.";

    if (name === "fs_read" || name === "fs_list") {
      const op = name === "fs_list" ? "list" : "read";
      const ok = await engine.authorizer.authorize(personaId, {
        capability: "fs.read",
        target: path,
        summary: `${op} ${path}`,
      });
      if (!ok) return `Denied: no read permission for ${path}.`;
      if (!existsSync(path)) {
        fsEvent(op, path, false);
        return `No such path: ${path}`;
      }
      if (name === "fs_list") {
        if (!statSync(path).isDirectory()) {
          fsEvent(op, path, false);
          return `${path} is not a directory.`;
        }
        fsEvent(op, path, true);
        return readdirSync(path).join("\n") || "(empty)";
      }
      const text = readFileSync(path, "utf8");
      fsEvent(op, path, true);
      return text.length > MAX_READ
        ? text.slice(0, MAX_READ) + `\n…(truncated, ${text.length} chars)`
        : text;
    }

    if (name === "fs_write") {
      const content = String(args.content ?? "");
      const ok = await engine.authorizer.authorize(personaId, {
        capability: "fs.write",
        target: path,
        summary: `write ${path} (${content.length} chars)`,
      });
      if (!ok) return `Denied: no write permission for ${path}.`;
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
      fsEvent("write", path, true);
      return `Wrote ${content.length} chars to ${path}.`;
    }

    return `unknown tool: ${name}`;
  };

  return { tools, invoke };
}

/** Merge tool sets into one {tools, invoke}, routing each call to its owner. */
export function combineTools(
  ...sets: { tools: ToolSpec[]; invoke: ToolInvoker }[]
): { tools: ToolSpec[]; invoke: ToolInvoker } {
  const owner = new Map<string, ToolInvoker>();
  for (const s of sets) for (const t of s.tools) owner.set(t.name, s.invoke);
  return {
    tools: sets.flatMap((s) => s.tools),
    invoke: async (name, args) =>
      (owner.get(name) ?? (async () => `unknown tool: ${name}`))(name, args),
  };
}
