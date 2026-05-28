import { chat, grantDefaultCapabilities, type Engine } from "@vellum/engine";
import { env } from "@vellum/shared";

// Handlers take a structural subset of grammY's Context so they're unit-testable
// with a plain mock (and still satisfied by the real Context at runtime).
export interface BotCtx {
  chat?: { id: number };
  message?: { text?: string };
  reply(text: string, opts?: unknown): Promise<unknown>;
}

// Telegram is single-persona per bot for now (the principal's assistant). The
// conversationId is the chat id; /switch-style multi-persona can layer on later.
const PERSONA_ID = "assistant";

async function ensurePersona(engine: Engine): Promise<string> {
  if (!engine.store.getPersona(PERSONA_ID)) {
    engine.store.createPersona(PERSONA_ID, "Vellum", {
      name: "Vellum",
      role: "payment-first personal agent",
      voice: "warm, concise, plain-English",
    });
    await engine.wallets.ensureWallet(PERSONA_ID);
    grantDefaultCapabilities(engine.capabilities, PERSONA_ID); // #37 baseline
  }
  return PERSONA_ID;
}

const usdc = (micro: string) => (Number(micro) / 1e6).toFixed(2);

export async function onStart(ctx: BotCtx, engine: Engine): Promise<void> {
  await ensurePersona(engine);
  await ctx.reply(
    "Vellum online — your payment-first agent. Ask me anything in plain English; I can create USDC vaults and manage funds within rules. Try /balance or /ledger.",
  );
}

export async function onText(ctx: BotCtx, engine: Engine): Promise<void> {
  const text = ctx.message?.text ?? "";
  if (!text.trim()) return;
  const personaId = await ensurePersona(engine);
  const r = await chat(engine, {
    conversationId: `tg:${ctx.chat?.id ?? "?"}`,
    personaId,
    message: text,
  });
  // Plain-English reply + a light cost receipt (proof-of-action), unless refused.
  const footer = r.budgetExceeded
    ? ""
    : `\n\n· $${r.costUsd.toFixed(4)} · ${r.tokens} tok`;
  await ctx.reply(r.reply + footer);
}

export async function onBalance(ctx: BotCtx, engine: Engine): Promise<void> {
  const personaId = await ensurePersona(engine);
  const balances = await engine.wallets.balanceFor(personaId);
  const amount =
    balances.find((b) => b.denom === env.VELLUM_DENOM)?.amount ?? "0";
  await ctx.reply(`💰 Balance: ${usdc(amount)} USDC`);
}

export async function onLedger(ctx: BotCtx, engine: Engine): Promise<void> {
  const personaId = await ensurePersona(engine);
  const s = engine.ledger.summary(personaId);
  const recent = engine.ledger
    .list({ personaId, limit: 5 })
    .map((e) => `• ${e.kind} — ${e.summary}`)
    .join("\n");
  await ctx.reply(
    `📒 Ledger — ${s.entries} actions · $${s.totalCostUsd.toFixed(4)} LLM spend · ${s.totalTokens} tok\n${recent || "(nothing yet)"}`,
  );
}
