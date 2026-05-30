import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createEngine } from "@vellum/engine";
import { TEST_BB1, type TxChain } from "@vellum/tx";
import { env } from "@vellum/shared";
import { buildBot, BOT_COMMANDS } from "./bot.ts";

const TEST_MNEMONIC =
  "test test test test test test test test test test test junk";

// A bech32-checksummed bb1 recipient — /spend validates the full checksum
// (#65 + #103).
const VALID = TEST_BB1.DEST;

// Offline tx chain so /spend's pre-check + (if allowed) broadcast never hit the
// network. Funded so the only thing that can stop a spend is the capability gate.
const fakeTxChain: TxChain = {
  getBalances: async () => [{ denom: env.VELLUM_DENOM, amount: "10000000" }],
  signAndBroadcast: async () => "SPENDHASH",
  confirmTx: async () => ({ height: 5, code: 0 }),
};

function fakeBot(opts: Parameters<typeof buildBot>[2] = {}) {
  const engine = createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic: TEST_MNEMONIC,
    txChain: fakeTxChain,
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

// A "/cmd args" update with the bot_command entity grammy needs to route it to
// bot.command(...) and populate ctx.match with the argument text.
function commandUpdate(chatId: number, cmd: string, args = "") {
  const text = args ? `/${cmd} ${args}` : `/${cmd}`;
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: chatId, type: "private" },
      from: { id: chatId, is_bot: false, first_name: "u", username: "u" },
      text,
      entities: [{ type: "bot_command", offset: 0, length: cmd.length + 1 }],
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

// Reachability (#49): the new command surface must be wired into the REAL bot
// (buildBot), not just unit-callable. These drive grammy's handleUpdate so a
// regression that forgot to register a command would fail here.
describe("command surface is wired into the bot (#49)", () => {
  test("/help lists the command surface", async () => {
    const { bot, sent } = fakeBot();
    await bot.handleUpdate(commandUpdate(1, "help"));
    expect(sent.join("\n")).toContain("/switch");
    expect(sent.join("\n")).toContain("/spend");
  });

  test("/new then /personas reflect the per-chat selection", async () => {
    const { bot, engine, sent } = fakeBot();
    await bot.handleUpdate(commandUpdate(1, "new", "Atlas"));
    expect(engine.store.getPersona("atlas")).not.toBeNull();
    await bot.handleUpdate(commandUpdate(1, "personas"));
    expect(sent.join("\n")).toMatch(/▶ atlas/);
  });

  test("/switch is wired and changes the chat's persona", async () => {
    const { bot, engine, sent } = fakeBot();
    await bot.handleUpdate(commandUpdate(1, "new", "Atlas"));
    await bot.handleUpdate(commandUpdate(1, "new", "Nova")); // chat now on nova
    await bot.handleUpdate(commandUpdate(1, "switch", "atlas"));
    expect(sent.some((t) => t.includes('driving "atlas"'))).toBe(true);
  });

  test("/spend is wired to the gated TxManager chokepoint — an allowed spend submits", async () => {
    const { bot, sent } = fakeBot();
    // /new bootstraps a persona with the #37 default grants (spend = allow).
    await bot.handleUpdate(commandUpdate(1, "new", "Atlas"));
    await bot.handleUpdate(commandUpdate(1, "spend", `${VALID} 1.00`));
    expect(sent.some((t) => t.includes("submitted"))).toBe(true);
  });

  test("/spend respects a revoked spend capability — gate denies, no tx", async () => {
    const { bot, engine, sent } = fakeBot();
    await bot.handleUpdate(commandUpdate(1, "new", "Atlas"));
    engine.capabilities.revoke("atlas", "spend", null); // pull the default grant
    await bot.handleUpdate(commandUpdate(1, "spend", `${VALID} 1.00`));
    expect(sent.some((t) => t.includes("Denied"))).toBe(true);
    expect(
      engine.ledger
        .list({ personaId: "atlas" })
        .some((e) => e.kind === "spend"),
    ).toBe(false);
  });
});

// The setMyCommands menu (#74) is registered from BOT_COMMANDS. If a command is
// added to the bot but not here (or vice-versa) the menu silently drifts from
// the real surface — guard the data + Telegram's own validity rules.
describe("command menu data (#74)", () => {
  test("covers every command the bot registers", () => {
    const names = BOT_COMMANDS.map((c) => c.command);
    // Mirror of the bot.command(...) registrations in buildBot.
    for (const c of [
      "start",
      "help",
      "personas",
      "switch",
      "new",
      "balance",
      "ledger",
      "vaults",
      "spend",
    ])
      expect(names).toContain(c);
    expect(new Set(names).size).toBe(names.length); // no dupes
  });

  test("each entry satisfies Telegram's setMyCommands constraints", () => {
    for (const { command, description } of BOT_COMMANDS) {
      // Telegram: command is 1-32 chars of lowercase letters/digits/underscore.
      expect(command).toMatch(/^[a-z0-9_]{1,32}$/);
      // description is 1-256 chars; we keep them short for the inline menu.
      expect(description.length).toBeGreaterThanOrEqual(1);
      expect(description.length).toBeLessThanOrEqual(256);
    }
  });
});
