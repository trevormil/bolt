import { Bot } from "grammy";
import type { Engine } from "@vellum/engine";
import { createLogger } from "@vellum/shared";
import { onBalance, onLedger, onStart, onText } from "./handlers.ts";

const log = createLogger("telegram");
const who = (ctx: { from?: { username?: string; id?: number } }) =>
  ctx.from?.username ?? String(ctx.from?.id ?? "?");

/**
 * Build the grammY bot wired to the engine — Telegram as a real agent surface
 * (the thesis's primary channel). Text routes through the shared chat flow
 * (persona + memory + vault tools + budget gate); /balance and /ledger surface
 * the wallet + proof-of-action. Metadata-only logging — never raw message text.
 */
export interface BotOptions {
  // Called with each interacting chat id (metadata only) so the caller can
  // register it as a proactive check-in recipient (0018).
  onSeen?: (chatId: number) => void;
}

export function buildBot(
  token: string,
  engine: Engine,
  opts: BotOptions = {},
): Bot {
  const bot = new Bot(token);
  const seen = (ctx: { chat?: { id: number } }) => {
    if (ctx.chat?.id !== undefined) opts.onSeen?.(ctx.chat.id);
  };
  bot.command("start", (ctx) => {
    log.info(`/start from @${who(ctx)}`);
    seen(ctx);
    return onStart(ctx, engine);
  });
  bot.command("balance", (ctx) => {
    log.info(`/balance from @${who(ctx)}`);
    seen(ctx);
    return onBalance(ctx, engine);
  });
  bot.command("ledger", (ctx) => {
    log.info(`/ledger from @${who(ctx)}`);
    seen(ctx);
    return onLedger(ctx, engine);
  });
  bot.on("message:text", (ctx) => {
    log.info(
      `message:text from @${who(ctx)} (${ctx.message.text.length} chars)`,
    );
    seen(ctx);
    return onText(ctx, engine);
  });
  return bot;
}
