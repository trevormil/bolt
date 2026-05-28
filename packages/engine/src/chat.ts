import type { TraceSpan } from "@vellum/trace";
import type { Engine } from "./engine.ts";
import { vaultTools } from "./agent-tools.ts";
import { combineTools, filesystemTools } from "./fs-tools.ts";
import { scheduleTools } from "./schedule-tools.ts";
import { evaluateBudget } from "./budget-setting.ts";

export interface ChatInput {
  conversationId: string;
  personaId: string;
  message: string;
  trace?: TraceSpan;
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
  const { conversationId, personaId, message, trace } = input;

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
  const { tools, invoke } = combineTools(
    vaultTools(engine, personaId),
    filesystemTools(engine, personaId),
    scheduleTools(engine, personaId),
  );
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

  return { reply: res.reply, costUsd, tokens, budgetExceeded: false };
}
