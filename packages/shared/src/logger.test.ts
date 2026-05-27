import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createLogger } from "./logger.ts";

// LOG_LEVEL defaults to "info" (no env set in tests), so debug is suppressed.

afterEach(() => {
  spyOn(console, "log").mockRestore();
  spyOn(console, "error").mockRestore();
});

describe("createLogger", () => {
  test("info() emits a line with scope and message", () => {
    const log = spyOn(console, "log").mockImplementation(() => {});
    createLogger("agent").info("scaffold ready");
    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0]?.[0] as string;
    expect(line).toContain("[agent]");
    expect(line).toContain("scaffold ready");
    expect(line).toContain("INFO");
  });

  test("debug() is suppressed at the default info threshold", () => {
    const log = spyOn(console, "log").mockImplementation(() => {});
    createLogger("agent").debug("noisy");
    expect(log).not.toHaveBeenCalled();
  });

  test("error() routes to console.error", () => {
    const err = spyOn(console, "error").mockImplementation(() => {});
    createLogger("agent").error("boom");
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0]?.[0] as string).toContain("ERROR");
  });

  test("passes meta through when provided", () => {
    const log = spyOn(console, "log").mockImplementation(() => {});
    createLogger("agent").info("with meta", { a: 1 });
    expect(log.mock.calls[0]?.[1]).toEqual({ a: 1 });
  });
});
