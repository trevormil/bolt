import type { TraceSpan } from "@vellum/trace";
import type { Engine } from "./engine.ts";
import { vaultTools } from "./agent-tools.ts";
import { llmBudget } from "./budgets.ts";

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

  const budget = llmBudget(engine.ledger, personaId);
  if (!budget.ok) {
    return {
      reply: `Daily LLM budget of $${budget.capUsd.toFixed(2)} reached (spent $${budget.spentUsd.toFixed(4)}). It resets on a rolling 24h window.`,
      costUsd: 0,
      tokens: 0,
      budgetExceeded: true,
    };
  }

  engine.orchestrator.resolve(conversationId, `/switch ${personaId}`);
  const { tools, invoke } = vaultTools(engine, personaId);
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
