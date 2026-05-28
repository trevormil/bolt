import { describe, expect, test } from "bun:test";
import { parseAccountResponse } from "./index.ts";

describe("parseAccountResponse", () => {
  test("accepts a registered account with number 0 (zero-based, valid)", () => {
    const info = parseAccountResponse(true, {
      account: { account_number: "0", sequence: "3" },
    });
    expect(info).not.toBeNull();
    expect(info!.accountNumber).toBe(0);
    expect(info!.sequence).toBe(3);
  });

  test("parses a normal account", () => {
    const info = parseAccountResponse(true, {
      account: { account_number: "1287", sequence: "9" },
    });
    expect(info).toEqual({ accountNumber: 1287, sequence: 9 });
  });

  test("returns null when the account object is missing (unregistered)", () => {
    expect(parseAccountResponse(true, {})).toBeNull();
  });

  test("returns null on a non-OK response (404)", () => {
    expect(
      parseAccountResponse(false, { account: { account_number: "5" } }),
    ).toBeNull();
  });

  test("defaults a missing sequence to 0", () => {
    const info = parseAccountResponse(true, {
      account: { account_number: "42" },
    });
    expect(info).toEqual({ accountNumber: 42, sequence: 0 });
  });
});
