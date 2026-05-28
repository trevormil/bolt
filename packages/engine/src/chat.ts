import type { TraceSpan } from "@vellum/trace";
import type { ToolInvoker, ToolSpec } from "@vellum/agent";
import { createLogger } from "@vellum/shared";
import type { Engine } from "./engine.ts";
import { vaultTools } from "./agent-tools.ts";
import { combineTools, filesystemTools } from "./fs-tools.ts";
import { scheduleTools } from "./schedule-tools.ts";
import { mcpTools } from "./mcp-tools.ts";
import { McpServers } from "./mcp-setting.ts";
import { evaluateBudget } from "./budget-setting.ts";

const log = createLogger("chat");

export interface ChatInput {
  conversationId: string;
  personaId: string;
  message: string;
  trace?: TraceSpan;
  // Read-only run (#24 / T-13): omit the value-moving vault tools, so a
  // proactive/scheduled run can observe + reply but cannot create or withdraw
  // from vaults unless explicitly armed. Filesystem stays capability-gated
  // either way (default-deny). Interactive chats default to full tools.
  readOnly?: boolean;
}
export interface ChatResult {
  reply: string;
  costUsd: number;
  tokens: number;
  budgetExceeded: boolean;
}

/**
 * The one chat flow every surface (web, Telegram) shares: enforce the per-persona
 * LLM budget BEFORE spending, deterministically bind the conversation to the
 * persona, dispatch through the bounded agent loop with the persona's vault tools,
 * record cost to the ledger, and accrue persona-scoped memory.
 */
export async function chat(
  engine: Engine,
  input: ChatInput,
): Promise<ChatResult> {
  const { conversationId, personaId, message, trace, readOnly } = input;
  const t0 = Date.now();
  // chat_in (#42): one event per user turn. Metadata ONLY — never the raw body
  // (that lives in persona memory). The timeline records that a turn happened +
  // its size, not its content.
  engine.events.emit({
    personaId,
    kind: "chat_in",
    summary: "message received",
    meta: { conversationId, chars: message.length },
  });

  const budget = evaluateBudget(engine, personaId);
  if (!budget.ok && budget.breached) {
    const w = budget.windows[budget.breached]!;
    const which =
      budget.breached.charAt(0).toUpperCase() + budget.breached.slice(1);
    return {
      reply: `${which} LLM budget of $${w.capUsd.toFixed(2)} reached (spent $${w.spentUsd.toFixed(4)}). It resets on a rolling window.`,
      costUsd: 0,
      tokens: 0,
      budgetExceeded: true,
    };
  }

  engine.orchestrator.resolve(conversationId, `/switch ${personaId}`);
  // Vault tools + capability-gated filesystem tools (#35). Both share the
  // persona's compartment; the FS tools enforce grants via engine.authorizer.
  // In a read-only run (T-13) the value-moving vault tools are withheld entirely
  // — the agent simply has no create/withdraw tool to call.
  const sets: { tools: ToolSpec[]; invoke: ToolInvoker }[] = readOnly
    ? [
        filesystemTools(engine, personaId),
        scheduleTools(engine, personaId, { readOnly: true }),
      ]
    : [
        vaultTools(engine, personaId),
        filesystemTools(engine, personaId),
        scheduleTools(engine, personaId),
      ];
  // MCP servers (#46): merge the persona's configured external tools, reusing
  // the daemon's pooled connections. Withheld from read-only runs for the same
  // reason vault tools are (T-13) — an unarmed proactive run must not reach
  // external tools that could move value. Each server's tools stay gated on the
  // "mcp" capability scoped to the server name (#37); a server that's down is
  // simply absent from `ensure`, so chat degrades gracefully.
  if (!readOnly) {
    const servers = McpServers.get(engine.settings, personaId).value;
    for (const { name, client } of await engine.mcp.ensure(servers)) {
      // Tool discovery can fail even on a connected server (e.g. a protocol/
      // version mismatch). Skip that server's tools rather than failing the
      // whole turn — same graceful-degradation contract as a connect failure.
      try {
        sets.push(await mcpTools(engine, personaId, client, name));
      } catch (e) {
        log.warn(`mcp server "${name}" tool discovery failed, skipping: ${e}`);
      }
    }
  }
  const { tools, invoke } = combineTools(...sets);
  const res = await engine.orchestrator.handle(conversationId, message, {
    trace,
    tools,
    invoke,
  });
  const costUsd = res.meters.reduce((n, m) => n + m.costUsd, 0);
  const tokens = res.meters.reduce((n, m) => n + m.totalTokens, 0);
  engine.ledger.recordAgentRun(
    personaId,
    `chat · ${message.slice(0, 60)}`,
    res.meters,
  );
  // Accrue persona-scoped memory so recall improves over the conversation.
  await engine.store.remember(personaId, `User said: ${message}`, {
    source: "chat",
  });

  // chat_out (#42): one event per agent turn with wall latency + LLM cost
  // rolled up across however many steps the agent loop took. Metadata only —
  // the reply text is never written to the timeline.
  engine.events.emit({
    personaId,
    kind: "chat_out",
    summary: "reply sent",
    latencyMs: Date.now() - t0,
    costUsd,
    tokens,
    ok: true,
    meta: { conversationId, steps: res.meters.length, chars: res.reply.length },
  });

  return { reply: res.reply, costUsd, tokens, budgetExceeded: false };
}
