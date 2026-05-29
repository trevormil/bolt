import { Bot } from "grammy";
import type { Engine } from "@vellum/engine";
import { createLogger } from "@vellum/shared";
import {
  onBalance,
  onHelp,
  onLedger,
  onNew,
  onPersonas,
  onSpend,
  onStart,
  onSwitch,
  onText,
  onVaults,
} from "./handlers.ts";
import { Sessions } from "./sessions.ts";

const log = createLogger("telegram");
const who = (ctx: { from?: { username?: string; id?: number } }) =>
  ctx.from?.username ?? String(ctx.from?.id ?? "?");

/**
 * The bot's command surface, in one place (#74). Registered with Telegram via
 * setMyCommands on attach so the commands appear in the client's "/" menu —
 * OpenClaw-style discoverability. This list is the single source of truth for
 * BOTH the grammy command routes registered below and the menu, so they can't
 * drift. Descriptions ≤ ~50 chars (Telegram's limit) and parenthetical-arg-free
 * since the menu shows them inline.
 */
export const BOT_COMMANDS: { command: string; description: string }[] = [
  { command: "start", description: "Connect & claim this bot as owner" },
  { command: "help", description: "What Bolt can do here" },
  { command: "personas", description: "List your personas" },
  { command: "switch", description: "Switch active persona (name)" },
  { command: "new", description: "Start a fresh conversation" },
  { command: "balance", description: "Wallet balance" },
  { command: "ledger", description: "Recent transactions" },
  { command: "vaults", description: "List vaults" },
  { command: "spend", description: "Send USDC — amount address" },
];

/**
 * Build the grammY bot wired to the engine — Telegram as a real remote-control
 * surface (the reframed thesis: the bot polls OUT, so "from anywhere" needs no
 * daemon exposure). Text routes through the shared chat flow (persona + memory +
 * vault tools + budget gate); commands give CLI/web parity. Per-chat persona
 * (/switch) lets one operator drive multiple compartments. EVERY money path
 * (/spend, the agent's vault tools) goes through the engine capability
 * chokepoint (#37) + ledger — there is no ungated send here.
 * Metadata-only logging — never raw message text.
 */
export interface BotOptions {
  // Called with each AUTHORIZED interacting chat id (metadata only) so the
  // caller can record it for the principal allowlist (#28).
  onSeen?: (chatId: number) => void;
  // Principal allowlist (#28): return false to refuse a chat. Vellum is a
  // personal single-owner agent — without this gate, anyone who finds the bot
  // could drive the shared `assistant` persona (spend, read balance + ledger).
  // Default allow (back-compat for unit tests + a no-config local run).
  authorizeChat?: (chatId: number) => boolean;
  // Per-chat active-persona store (#49). Injectable for tests; attach.ts wires
  // the persistent one backed by ~/.vellum. Defaults to an in-memory store.
  sessions?: Sessions;
}

const DENY_MSG =
  "Bolt is a personal agent bound to one owner — it can't take commands from this chat.";

export function buildBot(
  token: string,
  engine: Engine,
  opts: BotOptions = {},
): Bot {
  const bot = new Bot(token);
  const sessions = opts.sessions ?? new Sessions();
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
      // Catch-all (#89): a handler that throws must never become a silent no-op
      // (grammY's default would swallow it). Reply with a generic failure so the
      // user always gets *something* back, and log the cause. Handlers still
      // catch their own known errors (CapabilityDenied/TxRejected) for a precise
      // message; this is only the backstop for the unexpected.
      return Promise.resolve(handler(ctx)).catch(async (e: unknown) => {
        log.warn(`${label} failed: ${e instanceof Error ? e.message : e}`);
        await ctx.reply(
          "Sorry — something went wrong handling that. Please try again.",
        );
      });
    };
  // The text after a /command (grammy puts it on ctx.match). Used by commands
  // that take an argument (/switch, /new, /spend). Never logged.
  const arg = (ctx: BotHandlerCtx) =>
    typeof ctx.match === "string" ? ctx.match : "";
  bot.command(
    "start",
    guarded("/start", (ctx) => onStart(ctx, engine, sessions)),
  );
  bot.command(
    "help",
    guarded("/help", (ctx) => onHelp(ctx)),
  );
  bot.command(
    "balance",
    guarded("/balance", (ctx) => onBalance(ctx, engine, sessions)),
  );
  bot.command(
    "ledger",
    guarded("/ledger", (ctx) => onLedger(ctx, engine, sessions)),
  );
  bot.command(
    "personas",
    guarded("/personas", (ctx) => onPersonas(ctx, engine, sessions)),
  );
  bot.command(
    "switch",
    guarded("/switch", (ctx) => onSwitch(ctx, engine, sessions, arg(ctx))),
  );
  bot.command(
    "new",
    guarded("/new", (ctx) => onNew(ctx, engine, sessions, arg(ctx))),
  );
  bot.command(
    "vaults",
    guarded("/vaults", (ctx) => onVaults(ctx, engine, sessions)),
  );
  bot.command(
    "spend",
    guarded("/spend", (ctx) => onSpend(ctx, engine, sessions, arg(ctx))),
  );
  bot.on(
    "message:text",
    guarded("message:text", (ctx) => onText(ctx, engine, sessions)),
  );
  return bot;
}

// Structural subset of grammY's Context the gate + handlers rely on.
type BotHandlerCtx = {
  chat?: { id: number };
  from?: { username?: string; id?: number };
  message?: { text?: string };
  match?: string | RegExpMatchArray;
  reply(text: string, opts?: unknown): Promise<unknown>;
};
