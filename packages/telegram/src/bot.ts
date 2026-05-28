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
  // Called with each AUTHORIZED interacting chat id (metadata only) so the
  // caller can register it as a proactive check-in recipient (0018).
  onSeen?: (chatId: number) => void;
  // Principal allowlist (#28): return false to refuse a chat. Vellum is a
  // personal single-owner agent — without this gate, anyone who finds the bot
  // could drive the shared `assistant` persona (spend, read balance + ledger).
  // Default allow (back-compat for unit tests + a no-config local run).
  authorizeChat?: (chatId: number) => boolean;
}

const DENY_MSG =
  "Bolt is a personal agent bound to one owner — it can't take commands from this chat.";

export function buildBot(
  token: string,
  engine: Engine,
  opts: BotOptions = {},
): Bot {
  const bot = new Bot(token);
  const seen = (ctx: { chat?: { id: number } }) => {
    if (ctx.chat?.id !== undefined) opts.onSeen?.(ctx.chat.id);
  };
  // Single gate every command + message passes through. Fails closed for a
  // missing chat id; records the (authorized) chat as a recipient.
  const guarded =
    (label: string, handler: (ctx: BotHandlerCtx) => unknown) =>
    (ctx: BotHandlerCtx) => {
      const id = ctx.chat?.id;
      if (opts.authorizeChat && (id === undefined || !opts.authorizeChat(id))) {
        log.warn(`refused ${label} from chat ${id ?? "?"} (not the principal)`);
        return ctx.reply(DENY_MSG);
      }
      log.info(`${label} from @${who(ctx)}`);
      seen(ctx);
      return handler(ctx);
    };
  bot.command(
    "start",
    guarded("/start", (ctx) => onStart(ctx, engine)),
  );
  bot.command(
    "balance",
    guarded("/balance", (ctx) => onBalance(ctx, engine)),
  );
  bot.command(
    "ledger",
    guarded("/ledger", (ctx) => onLedger(ctx, engine)),
  );
  bot.on(
    "message:text",
    guarded("message:text", (ctx) => onText(ctx, engine)),
  );
  return bot;
}

// Structural subset of grammY's Context the gate + handlers rely on.
type BotHandlerCtx = {
  chat?: { id: number };
  from?: { username?: string; id?: number };
  message?: { text?: string };
  reply(text: string, opts?: unknown): Promise<unknown>;
};
