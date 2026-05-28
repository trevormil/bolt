import type { ToolInvoker, ToolSpec } from "@vellum/agent";
import type { Engine } from "./engine.ts";

// Agent-settable scheduled tasks (#36). Creating a task is capability-gated
// (#37 "schedule"); the task itself runs later via engine.chat (so any FS/spend
// the scheduled run does still hits its own gates). Scoped to ONE persona — an
// agent can only schedule/list/cancel its own tasks.
export function scheduleTools(
  engine: Engine,
  personaId: string,
): { tools: ToolSpec[]; invoke: ToolInvoker } {
  const tools: ToolSpec[] = [
    {
      name: "create_task",
      description:
        "Schedule a recurring task: a prompt re-run on an interval (in minutes). Requires the 'schedule' capability.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "What to do each run" },
          everyMinutes: { type: "number", description: "Interval in minutes" },
        },
        required: ["prompt", "everyMinutes"],
      },
    },
    {
      name: "list_tasks",
      description: "List this persona's scheduled tasks.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "cancel_task",
      description: "Cancel (delete) a scheduled task by its id prefix.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  ];

  const invoke: ToolInvoker = async (name, args) => {
    if (name === "create_task") {
      const prompt = String(args.prompt ?? "").trim();
      const everyMinutes = Number(args.everyMinutes);
      if (!prompt || !(everyMinutes > 0))
        return "Need a prompt and everyMinutes > 0.";
      const ok = await engine.authorizer.authorize(personaId, {
        capability: "schedule",
        summary: `schedule every ${everyMinutes}m: ${prompt.slice(0, 60)}`,
      });
      if (!ok) return "Denied: no permission to schedule tasks.";
      const t = engine.tasks.create({
        personaId,
        prompt,
        intervalMs: Math.round(everyMinutes * 60_000),
      });
      return `Scheduled task ${t.id.slice(0, 8)} · every ${everyMinutes}m.`;
    }
    if (name === "list_tasks") {
      const ts = engine.tasks.list(personaId);
      return ts.length
        ? ts
            .map(
              (t) =>
                `${t.id.slice(0, 8)} ${t.enabled ? "" : "(paused) "}every ${Math.round(t.intervalMs / 60_000)}m: ${t.prompt.slice(0, 60)}`,
            )
            .join("\n")
        : "No scheduled tasks.";
    }
    if (name === "cancel_task") {
      const idPrefix = String(args.id ?? "");
      const t = engine.tasks
        .list(personaId)
        .find((x) => x.id.startsWith(idPrefix));
      if (!t) return `No task matching: ${idPrefix}`;
      engine.tasks.delete(t.id);
      return `Cancelled task ${t.id.slice(0, 8)}.`;
    }
    return `unknown tool: ${name}`;
  };

  return { tools, invoke };
}
