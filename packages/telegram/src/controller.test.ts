import { describe, expect, test } from "bun:test";
import type { Engine } from "@vellum/engine";
import { TelegramController, type StoppableBot } from "./controller.ts";

// The controller only ever touches engine through the injected attachFn, so a
// bare cast is enough — these tests never build a real engine or bot.
const ENGINE = {} as Engine;

// A fake bot recording stop() calls + an attachFn that hands out a fresh one per
// attach so we can assert the single-poller invariant (#74): a new attach must
// stop the previous bot before starting, or two long-pollers fight over the same
// getUpdates offset (Telegram answers 409).
function makeAttach() {
  const bots: { token: string; stopped: number }[] = [];
  const attachFn = (_engine: Engine, token: string): StoppableBot => {
    const rec = { token, stopped: 0 };
    bots.push(rec);
    return {
      stop: async () => {
        rec.stopped += 1;
      },
    };
  };
  return { bots, attachFn };
}

describe("TelegramController (#74 hot-attach)", () => {
  test("attach starts a bot; isRunning reflects it", async () => {
    const { bots, attachFn } = makeAttach();
    const c = new TelegramController(ENGINE, attachFn);
    expect(c.isRunning()).toBe(false);
    await c.attach("tok-1");
    expect(c.isRunning()).toBe(true);
    expect(bots).toHaveLength(1);
    expect(bots[0]!.token).toBe("tok-1");
  });

  test("re-attach stops the prior bot before starting a new one", async () => {
    const { bots, attachFn } = makeAttach();
    const c = new TelegramController(ENGINE, attachFn);
    await c.attach("tok-1");
    await c.attach("tok-2");
    expect(bots).toHaveLength(2);
    expect(bots[0]!.stopped).toBe(1); // first poller was stopped
    expect(bots[1]!.stopped).toBe(0); // second is live
    expect(c.isRunning()).toBe(true);
  });

  test("detach stops the live bot and is a no-op when already detached", async () => {
    const { bots, attachFn } = makeAttach();
    const c = new TelegramController(ENGINE, attachFn);
    await c.attach("tok-1");
    await c.detach();
    expect(bots[0]!.stopped).toBe(1);
    expect(c.isRunning()).toBe(false);
    await c.detach(); // idempotent — nothing to stop, no throw
    expect(bots[0]!.stopped).toBe(1);
  });

  test("interleaved attach/detach serialize — never leaves two live bots", async () => {
    const { bots, attachFn } = makeAttach();
    const c = new TelegramController(ENGINE, attachFn);
    // Fire without awaiting between calls; the internal queue must serialize them.
    await Promise.all([c.attach("a"), c.attach("b"), c.detach()]);
    const live = bots.filter((b) => b.stopped === 0);
    // After a trailing detach, no bot should be left running.
    expect(live).toHaveLength(0);
    expect(c.isRunning()).toBe(false);
  });
});
