import {
  chat,
  grantDefaultCapabilities,
  CapabilityDeniedError,
  type Engine,
} from "@vellum/engine";
import { env } from "@vellum/shared";
import type { Sessions } from "./sessions.ts";

// Handlers take a structural subset of grammY's Context so they're unit-testable
// with a plain mock (and still satisfied by the real Context at runtime).
export interface BotCtx {
  chat?: { id: number };
  message?: { text?: string };
  reply(text: string, opts?: unknown): Promise<unknown>;
}

// The persona created on first contact (TOFU default). A chat starts pinned to
// this one and can /switch to any other compartment — multi-persona over one bot.
const DEFAULT_PERSONA_ID = "assistant";

const usdc = (micro: string) => (Number(micro) / 1e6).toFixed(2);

// Slugify a free-text persona name to an id (matches the CLI's slug rule so
// /new on Telegram and `vellum new` produce the same ids).
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "persona"
  );
}

// Create a persona + its wallet + the #37 baseline grants. Shared by the TOFU
// default and /new so both go through the SAME capability bootstrap.
async function createPersona(
  engine: Engine,
  id: string,
  name: string,
): Promise<void> {
  engine.store.createPersona(id, name, {
    name,
    role: "personal assistant",
    voice: "warm, concise, plain-English",
  });
  await engine.wallets.ensureWallet(id);
  grantDefaultCapabilities(engine.capabilities, id); // #37 baseline
}

// Resolve the persona this chat is driving: its /switch selection if any and the
// persona still exists, else the first existing persona, else create the TOFU
// default. Persisting the resolved choice keeps the selection stable per chat.
async function resolvePersona(
  ctx: BotCtx,
  engine: Engine,
  session: Sessions,
): Promise<string> {
  const chatId = ctx.chat?.id;
  if (chatId !== undefined) {
    const active = session.activePersona(chatId);
    if (active && engine.store.getPersona(active)) return active;
  }
  // No (valid) selection: prefer an existing persona, else bootstrap the default.
  const existing = engine.store.listPersonas()[0]?.id;
  const personaId = existing ?? DEFAULT_PERSONA_ID;
  if (!engine.store.getPersona(personaId))
    await createPersona(engine, personaId, "Bolt");
  if (chatId !== undefined) session.setActivePersona(chatId, personaId);
  return personaId;
}

export async function onStart(
  ctx: BotCtx,
  engine: Engine,
  session: Sessions,
): Promise<void> {
  const personaId = await resolvePersona(ctx, engine, session);
  await ctx.reply(
    `Bolt online — your payment-first agent (driving "${personaId}"). Ask me anything in plain English; I can create USDC vaults and manage funds within rules. Try /help.`,
  );
}

const HELP = [
  "Bolt commands:",
  "/personas — list compartments",
  "/switch <id> — drive a different persona",
  "/new <name> — create a persona (+ wallet)",
  "/vaults — list this persona's vaults",
  "/balance — USDC balance",
  "/spend <bb1…> <usdc> — pay from the wallet (capability-gated)",
  "/ledger — recent proof-of-action",
  "/help — this list",
  "",
  "Anything else is a message to the agent.",
].join("\n");

export async function onHelp(ctx: BotCtx): Promise<void> {
  await ctx.reply(HELP);
}

export async function onText(
  ctx: BotCtx,
  engine: Engine,
  session: Sessions,
): Promise<void> {
  const text = ctx.message?.text ?? "";
  if (!text.trim()) return;
  const personaId = await resolvePersona(ctx, engine, session);
  const r = await chat(engine, {
    // Scope the conversation to chat AND persona so a /switch starts a clean
    // thread (one chat's memory never bleeds across compartments).
    conversationId: `tg:${ctx.chat?.id ?? "?"}:${personaId}`,
    personaId,
    message: text,
  });
  // Plain-English reply + a light cost receipt (proof-of-action), unless refused.
  const footer = r.budgetExceeded
    ? ""
    : `\n\n· $${r.costUsd.toFixed(4)} · ${r.tokens} tok`;
  await ctx.reply(r.reply + footer);
}

export async function onBalance(
  ctx: BotCtx,
  engine: Engine,
  session: Sessions,
): Promise<void> {
  const personaId = await resolvePersona(ctx, engine, session);
  const balances = await engine.wallets.balanceFor(personaId);
  const amount =
    balances.find((b) => b.denom === env.VELLUM_DENOM)?.amount ?? "0";
  await ctx.reply(`💰 ${personaId}: ${usdc(amount)} USDC`);
}

export async function onLedger(
  ctx: BotCtx,
  engine: Engine,
  session: Sessions,
): Promise<void> {
  const personaId = await resolvePersona(ctx, engine, session);
  const s = engine.ledger.summary(personaId);
  const recent = engine.ledger
    .list({ personaId, limit: 5 })
    .map((e) => `• ${e.kind} — ${e.summary}`)
    .join("\n");
  await ctx.reply(
    `📒 Ledger (${personaId}) — ${s.entries} actions · $${s.totalCostUsd.toFixed(4)} LLM spend · ${s.totalTokens} tok\n${recent || "(nothing yet)"}`,
  );
}

export async function onPersonas(
  ctx: BotCtx,
  engine: Engine,
  session: Sessions,
): Promise<void> {
  const active = await resolvePersona(ctx, engine, session);
  const ps = engine.store.listPersonas();
  const lines = ps
    .map((p) => `${p.id === active ? "▶" : "•"} ${p.id} — ${p.name}`)
    .join("\n");
  await ctx.reply(`Personas:\n${lines}\n\n/switch <id> to change.`);
}

// /switch <id> — pin this chat to a different persona (per-chat, persisted).
export async function onSwitch(
  ctx: BotCtx,
  engine: Engine,
  session: Sessions,
  arg: string,
): Promise<void> {
  const id = arg.trim();
  const chatId = ctx.chat?.id;
  if (!id) {
    await ctx.reply("Usage: /switch <persona-id>  (see /personas)");
    return;
  }
  if (!engine.store.getPersona(id)) {
    await ctx.reply(`Unknown persona: ${id}. See /personas.`);
    return;
  }
  if (chatId !== undefined) session.setActivePersona(chatId, id);
  await ctx.reply(`▶ Now driving "${id}".`);
}

// /new <name> — create a persona (+ wallet + #37 grants) and switch to it. Same
// bootstrap as the CLI; not a money path.
export async function onNew(
  ctx: BotCtx,
  engine: Engine,
  session: Sessions,
  arg: string,
): Promise<void> {
  const name = arg.trim();
  if (!name) {
    await ctx.reply("Usage: /new <name>");
    return;
  }
  const id = slug(name);
  if (engine.store.getPersona(id)) {
    await ctx.reply(`Persona already exists: ${id}.`);
    return;
  }
  await createPersona(engine, id, name);
  const chatId = ctx.chat?.id;
  if (chatId !== undefined) session.setActivePersona(chatId, id);
  await ctx.reply(`Created + switched to "${id}".`);
}

export async function onVaults(
  ctx: BotCtx,
  engine: Engine,
  session: Sessions,
): Promise<void> {
  const personaId = await resolvePersona(ctx, engine, session);
  const vs = engine.vaults.list(personaId);
  if (!vs.length) {
    await ctx.reply(
      `No vaults for "${personaId}" yet. Ask me to create one (e.g. "make a $50 Groceries vault").`,
    );
    return;
  }
  const lines = vs
    .map((v) => `• ${v.symbol} — ${v.name} (collection ${v.collectionId})`)
    .join("\n");
  await ctx.reply(`Vaults (${personaId}):\n${lines}`);
}

// /spend <bb1…> <usdc> — free-form wallet pay. Routes through the SAME TxManager
// chokepoint as the web /api/.../spend route, so it is capability-gated (#37) and
// ledgered identically — no new ungated money path. amount is USDC (human), the
// chokepoint takes base-unit µUSDC. A denied spend returns a clean message
// (CapabilityDeniedError), never a silent send.
export async function onSpend(
  ctx: BotCtx,
  engine: Engine,
  session: Sessions,
  arg: string,
): Promise<void> {
  const parts = arg.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    await ctx.reply(
      "Usage: /spend <bb1-address> <usdc-amount>\nPays from the active persona's wallet, within its spend capability.",
    );
    return;
  }
  const [to, amountStr] = parts;
  if (!to!.startsWith("bb1")) {
    await ctx.reply("Recipient must be a bb1… address.");
    return;
  }
  const n = Number(amountStr);
  if (!Number.isFinite(n) || n <= 0) {
    await ctx.reply("Amount must be a positive number of USDC.");
    return;
  }
  const micro = Math.round(n * 1e6);
  if (micro <= 0) {
    await ctx.reply("Amount must be a positive number of USDC.");
    return;
  }
  const personaId = await resolvePersona(ctx, engine, session);
  try {
    const pending = await engine.txManager.spend({
      personaId,
      to: to!,
      amount: String(micro),
    });
    await ctx.reply(
      `Spend of ${n.toFixed(2)} USDC → ${to} submitted (tx ${(pending.hash ?? pending.id).slice(0, 10)}); confirming on-chain.`,
    );
  } catch (e) {
    if (e instanceof CapabilityDeniedError) {
      await ctx.reply(`Denied: ${e.action.summary}.`);
      return;
    }
    throw e;
  }
}
