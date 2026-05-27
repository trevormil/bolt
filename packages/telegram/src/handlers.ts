import { InlineKeyboard } from "grammy";

// Handlers take a structural subset of grammY's Context so they're unit-testable
// with a plain mock (and still satisfied by the real Context at runtime).
export interface BotCtx {
  message?: { text?: string };
  callbackQuery?: { data?: string };
  reply(text: string, opts?: unknown): Promise<unknown>;
  answerCallbackQuery(text?: string): Promise<unknown>;
}

const APPROVE = "approve";
const REJECT = "reject";

/** /start — greet + demonstrate inline buttons (a callback button + a URL link). */
export async function onStart(ctx: BotCtx): Promise<void> {
  const keyboard = new InlineKeyboard()
    .text("Approve (demo)", APPROVE)
    .text("Reject (demo)", REJECT)
    .row()
    .url("Open BitBadges", "https://bitbadges.io");
  await ctx.reply(
    "Vellum agent online (scaffold). Approvals will appear here as buttons; signing as links.",
    { reply_markup: keyboard },
  );
}

/** Any text message — echo for now; the agent loop replaces this in ticket 0005. */
export async function onText(ctx: BotCtx): Promise<void> {
  const text = ctx.message?.text ?? "";
  await ctx.reply(
    `echo: ${text}\n(the agent reasoning loop lands in ticket 0005)`,
  );
}

/** Inline-button callback — acknowledge + confirm the round-trip. */
export async function onCallback(ctx: BotCtx): Promise<void> {
  const data = ctx.callbackQuery?.data ?? "";
  await ctx.answerCallbackQuery(data === APPROVE ? "Approved" : "Rejected");
  await ctx.reply(
    `You tapped: ${data} (demo round-trip — real gates land with the payment tickets)`,
  );
}
