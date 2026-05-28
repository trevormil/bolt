import type { TraceSpan } from "@vellum/trace";
import type { ToolInvoker, ToolSpec } from "@vellum/agent";
import { createLogger } from "@vellum/shared";
import type { Engine } from "./engine.ts";
import { balanceTools, spendTools, vaultTools } from "./agent-tools.ts";
import { combineTools, filesystemTools } from "./fs-tools.ts";
import { execTools } from "./exec-tools.ts";
import { mcpTools } from "./mcp-tools.ts";
import { McpServers } from "./mcp-setting.ts";
import { evaluateBudget } from "./budget-setting.ts";

const log = createLogger("chat");

export interface ChatInput {
  conversationId: string;
  personaId: string;
  message: string;
  trace?: TraceSpan;
  // Read-only run (#24 / T-13): omit the value-moving vault tools, so an
  // unattended run can observe + reply but cannot create or withdraw from
  // vaults. Filesystem stays capability-gated either way (default-deny).
  // Interactive chats default to full tools.
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
  // Vault tools + free-form spend (#65) + capability-gated filesystem tools
  // (#35) + command execution (#52). All share the persona's compartment and
  // enforce grants via engine.authorizer. In a read-only run (T-13) the
  // value-moving vault tools (create/withdraw/pay), the free-form send_usdc
  // tool, the mutating fs_write tool, AND command execution are all withheld
  // entirely — an unattended read-only run can observe disk/state but cannot
  // modify the host or move value. fs_read/fs_list stay so it can still inspect.
  // The read-only balance tool (#51) is exposed in BOTH runs — it moves no
  // value, and the agent must know its funds before it acts.
  const sets: { tools: ToolSpec[]; invoke: ToolInvoker }[] = readOnly
    ? [
        balanceTools(engine, personaId),
        filesystemTools(engine, personaId, { readOnly: true }),
      ]
    : [
        balanceTools(engine, personaId),
        spendTools(engine, personaId),
        vaultTools(engine, personaId),
        filesystemTools(engine, personaId),
        execTools(engine, personaId),
      ];
  // MCP servers (#46): merge the persona's configured external tools, reusing
  // the daemon's pooled connections. Withheld from read-only runs for the same
  // reason vault tools are (T-13) — an unattended read-only run must not reach
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
