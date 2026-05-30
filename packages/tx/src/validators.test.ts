import { describe, expect, test } from "bun:test";
import { fromBech32, toBech32 } from "@cosmjs/encoding";
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

describe("isBb1Address — bech32-checksummed (#103)", () => {
  // Real bech32 bb1 addresses with valid checksums. Derived once from real
  // wallet generation during devnet smoke; the checksum is preserved here so
  // the tests don't pull in @cosmjs/crypto at unit-test time.
  const VALID_BB1 = [
    "bb1gsvdpdxec8hsu57lhxg5xem7refr233zlva7x9",
    "bb15428vq2uzwhm3taey9sr9x5vm6tk78ew6favjg",
  ];

  test("accepts real bech32-checksummed addresses", () => {
    for (const a of VALID_BB1) {
      expect(isBb1Address(a)).toBe(true);
    }
  });

  test("rejects a regex-passing-but-checksum-invalid string (the typo-squat case)", () => {
    // Mutate the last char of a valid address to break the checksum. The
    // OLD regex-only check would accept this; the new check rejects.
    const a = VALID_BB1[0]!;
    const broken = a.slice(0, -1) + (a.slice(-1) === "9" ? "8" : "9");
    expect(broken).toMatch(/^bb1[0-9a-z]{38,}$/); // still regex-valid
    expect(isBb1Address(broken)).toBe(false); // bech32 rejects
  });

  test("rejects malformed addresses (structural)", () => {
    for (const bad of [
      "bb1" + "a".repeat(37), // one char too short
      "bb1", // empty body
      "BB1" + "a".repeat(38), // wrong-case prefix
      "cosmos1" + "a".repeat(38), // wrong prefix
      "bb1" + "A".repeat(38), // uppercase body (bech32 is lowercase)
      "bb1" + "a".repeat(37) + "!", // illegal char
      " " + VALID_BB1[0]!, // leading space
      VALID_BB1[0]! + " ", // trailing space
      "",
      "bb1" + "a".repeat(120), // overlong (> 90 chars total)
    ]) {
      expect({ bad, ok: isBb1Address(bad) }).toEqual({ bad, ok: false });
    }
  });

  test("a fresh-derived 20-byte payload via cosmjs round-trips through the validator", () => {
    // toBech32(prefix, bytes) produces a checksummed string; isBb1Address must
    // accept the round-trip for any 20-byte payload (the cosmos address size).
    for (let i = 0; i < 50; i++) {
      const data = new Uint8Array(20);
      for (let j = 0; j < 20; j++) data[j] = Math.floor(Math.random() * 256);
      const addr = toBech32("bb", data);
      expect(isBb1Address(addr)).toBe(true);
      // Sanity: cosmjs accepts what we accept.
      expect(fromBech32(addr).prefix).toBe("bb");
    }
  });
});
