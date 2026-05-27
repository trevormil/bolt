import { Bot } from "grammy";
import { createLogger } from "@vellum/shared";
import { onStart, onText, onCallback } from "./handlers.ts";

const log = createLogger("telegram");
const who = (ctx: { from?: { username?: string; id?: number } }) =>
  ctx.from?.username ?? String(ctx.from?.id ?? "?");

/** Build a grammY bot with the scaffold handlers wired up. */
export function buildBot(token: string): Bot {
  const bot = new Bot(token);
  bot.command("start", (ctx) => {
    log.info(`/start from @${who(ctx)}`);
    return onStart(ctx);
  });
  bot.on("callback_query:data", (ctx) => {
    log.info(`callback "${ctx.callbackQuery.data}" from @${who(ctx)}`);
    return onCallback(ctx);
  });
  bot.on("message:text", (ctx) => {
    // Never log raw message bodies — they can contain secrets / payment context.
    // Metadata only (sender + length).
    log.info(
      `message:text from @${who(ctx)} (${ctx.message.text.length} chars)`,
    );
    return onText(ctx);
  });
  return bot;
}
