import { describe, expect, test } from "bun:test";
import { isPositiveMicroAmount, isBb1Address } from "./tx.ts";

// Property/fuzz hardening for the money-safety validators (#90). These guard
// every spend, so we don't just spot-check examples — we assert the validator
// agrees with an INDEPENDENT semantic oracle over an adversarial input space.
// The oracle is BigInt-canonical (NOT a copy of the regex), so a divergence is a
// real bug: a µUSDC amount is valid iff it parses to a positive integer that
// renders back to itself (rules out leading zeros, signs, decimals, hex, sci
// notation, whitespace, unicode digits, empty).
function isCleanPositiveInt(s: string): boolean {
  try {
    const n = BigInt(s); // JS BigInt accepts "+5", "0x10", " 5 ", "" → caught below
    return n > 0n && String(n) === s;
  } catch {
    return false;
  }
}

describe("isPositiveMicroAmount — property/fuzz (money safety)", () => {
  test("agrees with the BigInt-canonical oracle on an adversarial corpus", () => {
    const corpus = [
      "1",
      "1000000",
      "9".repeat(40), // huge µamounts are fine (no overflow in the validator)
      "0",
      "00",
      "007",
      "01",
      "-1",
      "+1",
      "1.0",
      "0.5",
      "1e6",
      "1E6",
      "0x10",
      "0b10",
      "1_000",
      " 1",
      "1 ",
      "1\n",
      "",
      " ",
      "abc",
      "1n",
      "４２", // full-width digits
      "٥", // arabic-indic digit
      "Infinity",
      "NaN",
    ];
    for (const s of corpus) {
      expect({ s, ok: isPositiveMicroAmount(s) }).toEqual({
        s,
        ok: isCleanPositiveInt(s),
      });
    }
  });

  test("agrees with the oracle on randomized near-boundary inputs", () => {
    const digits = "0123456789";
    const noise = ["", "0", "+", "-", ".", "e", "x", " ", "\t", "n", "４"];
    for (let i = 0; i < 2000; i++) {
      const len = 1 + Math.floor(Math.random() * 12);
      let s = "";
      for (let j = 0; j < len; j++)
        s += digits[Math.floor(Math.random() * digits.length)];
      // Occasionally perturb with a tricky prefix/suffix to probe the boundary.
      if (Math.random() < 0.5)
        s = noise[Math.floor(Math.random() * noise.length)]! + s;
      if (Math.random() < 0.3)
        s += noise[Math.floor(Math.random() * noise.length)]!;
      expect({ s, ok: isPositiveMicroAmount(s) }).toEqual({
        s,
        ok: isCleanPositiveInt(s),
      });
    }
  });
});

describe("isBb1Address — boundary cases", () => {
  const body38 = "a".repeat(38); // the minimum body length the regex allows
  test("accepts a well-formed bb1 address at/above the min length", () => {
    expect(isBb1Address("bb1" + body38)).toBe(true);
    expect(isBb1Address("bb1" + "a".repeat(60))).toBe(true);
  });
  test("rejects malformed addresses", () => {
    for (const bad of [
      "bb1" + "a".repeat(37), // one char too short
      "bb1", // empty body
      "BB1" + body38, // wrong-case prefix
      "cosmos1" + body38, // wrong prefix
      "bb1" + "A".repeat(38), // uppercase body (bech32 is lowercase)
      "bb1" + "a".repeat(37) + "!", // illegal char
      " bb1" + body38, // leading space
      "bb1" + body38 + " ", // trailing space
      "",
    ]) {
      expect({ bad, ok: isBb1Address(bad) }).toEqual({ bad, ok: false });
    }
  });
});
