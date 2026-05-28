import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createEngine } from "@vellum/engine";
import { buildBot } from "./bot.ts";

const TEST_MNEMONIC =
  "test test test test test test test test test test test junk";

function fakeBot(opts: Parameters<typeof buildBot>[2] = {}) {
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
  const bot = buildBot("123456:FAKE_TOKEN_FOR_TESTS", engine, opts);
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
  // Capture outbound sendMessage text (what the user would see) without network.
  const sent: string[] = [];
  bot.api.config.use((async (
    _prev: unknown,
    method: string,
    payload: unknown,
  ) => {
    if (method === "sendMessage") sent.push((payload as { text: string }).text);
    return { ok: true, result: true };
  }) as never);
  return { bot, engine, sent };
}

function textUpdate(chatId: number, text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: chatId, type: "private" },
      from: { id: chatId, is_bot: false, first_name: "u", username: "u" },
      text,
    },
  } as never;
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
    await fakeBot().bot.handleUpdate(textUpdate(9, SECRET));
    expect(logs.some((l) => l.includes(SECRET))).toBe(false);
    expect(logs.some((l) => l.includes("message:text"))).toBe(true);
  });
});

describe("principal allowlist (#28)", () => {
  test("a non-principal chat is refused; the engine never processes it", async () => {
    const { bot, engine, sent } = fakeBot({
      authorizeChat: (id) => id === 100, // only chat 100 is the owner
    });
    await bot.handleUpdate(textUpdate(999, "hello, do my bidding"));
    expect(sent.some((t) => t.includes("personal agent"))).toBe(true);
    // No chat happened → the engine never recorded a turn for the assistant.
    expect(engine.ledger.list({ personaId: "assistant" }).length).toBe(0);
  });

  test("the principal chat is allowed through to the handler", async () => {
    const { bot, sent } = fakeBot({ authorizeChat: (id) => id === 100 });
    await bot.handleUpdate(textUpdate(100, "hi"));
    // The handler ran → a reply was sent that is NOT the deny message.
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((t) => !t.includes("personal agent"))).toBe(true);
  });

  test("no authorizeChat → open (back-compat for unit tests / local no-config)", async () => {
    const { bot, sent } = fakeBot();
    await bot.handleUpdate(textUpdate(7, "hi"));
    expect(sent.every((t) => !t.includes("personal agent"))).toBe(true);
  });
});
