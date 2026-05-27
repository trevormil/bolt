import { describe, expect, mock, test } from "bun:test";
import { onStart, onText, onCallback, type BotCtx } from "./handlers.ts";

function mockCtx(over: Partial<BotCtx> = {}): BotCtx & {
  reply: ReturnType<typeof mock>;
  answerCallbackQuery: ReturnType<typeof mock>;
} {
  return {
    reply: mock(async () => ({})),
    answerCallbackQuery: mock(async () => ({})),
    ...over,
  } as never;
}

describe("telegram handlers", () => {
  test("onText echoes the incoming message", async () => {
    const ctx = mockCtx({ message: { text: "hello" } });
    await onText(ctx);
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(ctx.reply.mock.calls[0]?.[0] as string).toContain("echo: hello");
  });

  test("onStart replies with an inline keyboard (callback + url buttons)", async () => {
    const ctx = mockCtx();
    await onStart(ctx);
    const opts = ctx.reply.mock.calls[0]?.[1] as { reply_markup?: unknown };
    expect(opts?.reply_markup).toBeDefined();
    // grammY InlineKeyboard serializes to { inline_keyboard: [[...]] }
    const markup = opts.reply_markup as { inline_keyboard: unknown[][] };
    expect(Array.isArray(markup.inline_keyboard)).toBe(true);
    expect(markup.inline_keyboard.flat().length).toBeGreaterThanOrEqual(3);
  });

  test("onCallback answers the query and confirms the round-trip", async () => {
    const ctx = mockCtx({ callbackQuery: { data: "approve" } });
    await onCallback(ctx);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(ctx.answerCallbackQuery.mock.calls[0]?.[0]).toBe("Approved");
    expect(ctx.reply.mock.calls[0]?.[0] as string).toContain("approve");
  });
});
