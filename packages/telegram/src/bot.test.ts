import { describe, expect, mock, test } from "bun:test";

// Capture everything the bot logs.
const logged: string[] = [];
mock.module("@vellum/shared", () => ({
  createLogger: () => ({
    info: (m: string) => logged.push(m),
    debug: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

const { buildBot } = await import("./bot.ts");

function fakeBot() {
  const bot = buildBot("123456:FAKE_TOKEN_FOR_TESTS");
  // Avoid getMe() on handleUpdate, and no-op the API so ctx.reply never hits the network.
  bot.botInfo = {
    id: 1,
    is_bot: true,
    first_name: "test",
    username: "test_bot",
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
  } as never;
  bot.api.config.use((async () => ({ ok: true, result: true })) as never);
  return bot;
}

describe("buildBot logging boundary", () => {
  test("never logs raw user message text", async () => {
    logged.length = 0;
    const SECRET = "my recovery phrase is correct horse battery staple";
    await fakeBot().handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        date: 0,
        chat: { id: 9, type: "private" },
        from: { id: 9, is_bot: false, first_name: "u", username: "u" },
        text: SECRET,
      },
    } as never);
    expect(logged.some((l) => l.includes(SECRET))).toBe(false);
    // …but it still records the event (metadata only).
    expect(logged.some((l) => l.includes("message:text"))).toBe(true);
  });
});
