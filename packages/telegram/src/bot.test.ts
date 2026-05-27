import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createEngine } from "@vellum/engine";
import { buildBot } from "./bot.ts";

const TEST_MNEMONIC =
  "test test test test test test test test test test test junk";

function fakeBot() {
  const engine = createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic: TEST_MNEMONIC,
    runLoop: async () => ({
      text: "ok",
      meters: [
        {
          model: "m",
          tier: "cheap",
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 1,
          costUsd: 0,
          ms: 0,
        },
      ],
    }),
    getBalances: async () => [],
  });
  const bot = buildBot("123456:FAKE_TOKEN_FOR_TESTS", engine);
  // Avoid getMe() on handleUpdate; no-op the API so ctx.reply never hits network.
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
  let logs: string[];
  const origLog = console.log;
  const origErr = console.error;
  beforeEach(() => {
    logs = [];
    console.log = (...a: unknown[]) => logs.push(a.join(" "));
    console.error = (...a: unknown[]) => logs.push(a.join(" "));
  });
  afterEach(() => {
    console.log = origLog;
    console.error = origErr;
  });

  test("never logs raw user message text (metadata only)", async () => {
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
    expect(logs.some((l) => l.includes(SECRET))).toBe(false);
    expect(logs.some((l) => l.includes("message:text"))).toBe(true);
  });
});
