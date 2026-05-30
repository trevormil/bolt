import { describe, expect, test } from "bun:test";
import { TEST_BB1 } from "@vellum/tx";
import {
  parseVaultGating,
  validateGatingTemporal,
  validateGatingForPersona,
} from "./gating-schema.ts";

describe("parseVaultGating (#103 §2)", () => {
  test("undefined / empty / no-content shapes return undefined (no policy)", () => {
    expect(parseVaultGating(undefined)).toBeUndefined();
    expect(parseVaultGating(null)).toBeUndefined();
    expect(parseVaultGating({})).toBeUndefined();
    expect(parseVaultGating({ time: {} })).toBeUndefined();
    expect(parseVaultGating({ amount: undefined, time: {} })).toBeUndefined();
  });

  test("accepts a valid amount + time + multisig", () => {
    const g = parseVaultGating({
      amount: { limitUsd: 25, period: "weekly" },
      time: { unlockAt: 1_700_000_000_000 },
      multisig: {
        signers: [{ address: TEST_BB1.TO1 }, { address: TEST_BB1.TO2 }],
        threshold: 2,
      },
    });
    expect(g).toBeDefined();
    expect((g as { amount: unknown }).amount).toEqual({
      limitUsd: 25,
      period: "weekly",
    });
  });

  test("rejects non-object input", () => {
    expect(parseVaultGating("not an object")).toEqual({
      error: "gating must be an object",
    });
  });

  test("rejects invalid amount (zero / negative / wrong period)", () => {
    expect(
      parseVaultGating({ amount: { limitUsd: 0, period: "weekly" } }),
    ).toMatchObject({ error: expect.stringMatching(/limitUsd/) });
    expect(
      parseVaultGating({ amount: { limitUsd: -5, period: "weekly" } }),
    ).toMatchObject({ error: expect.stringMatching(/limitUsd/) });
    expect(
      parseVaultGating({ amount: { limitUsd: 5, period: "hourly" } }),
    ).toMatchObject({ error: expect.any(String) });
  });

  test("rejects time window that ends at or before it starts", () => {
    expect(
      parseVaultGating({ time: { unlockAt: 200, expiresAt: 200 } }),
    ).toMatchObject({
      error: expect.stringMatching(/expiresAt.*after.*unlockAt/i),
    });
    expect(
      parseVaultGating({ time: { unlockAt: 300, expiresAt: 200 } }),
    ).toMatchObject({ error: expect.any(String) });
  });

  test("rejects unreachable multisig quorum", () => {
    expect(
      parseVaultGating({
        multisig: {
          signers: [{ address: TEST_BB1.TO1 }, { address: TEST_BB1.TO2 }],
          threshold: 3,
        },
      }),
    ).toMatchObject({ error: expect.stringMatching(/unreachable/i) });
  });

  test("rejects non-bb1 signer", () => {
    expect(
      parseVaultGating({
        multisig: { signers: [{ address: "0xbad" }], threshold: 1 },
      }),
    ).toMatchObject({ error: expect.stringMatching(/bb1/) });
  });

  test("rejects empty signer set", () => {
    expect(
      parseVaultGating({ multisig: { signers: [], threshold: 1 } }),
    ).toMatchObject({ error: expect.stringMatching(/at least one signer/i) });
  });

  test("#103 §3: rejects duplicate signers (silent quorum downgrade closed)", () => {
    expect(
      parseVaultGating({
        multisig: {
          signers: [{ address: TEST_BB1.TO1 }, { address: TEST_BB1.TO1 }],
          threshold: 2,
        },
      }),
    ).toMatchObject({ error: expect.stringMatching(/duplicate/i) });
  });

  test("#103 §3: rejects unknown top-level fields (strict)", () => {
    expect(
      parseVaultGating({ amount: { limitUsd: 5, period: "daily" }, weird: 1 }),
    ).toMatchObject({ error: expect.any(String) });
  });
});

describe("validateGatingTemporal (#103 §3)", () => {
  const NOW = 1_700_000_000_000;

  test("ok when no time gate", () => {
    expect(validateGatingTemporal(undefined, NOW)).toEqual({ ok: true });
    expect(
      validateGatingTemporal({ amount: { limitUsd: 5, period: "daily" } }, NOW),
    ).toEqual({ ok: true });
  });

  test("ok when unlockAt is now-ish (within grace) or future", () => {
    expect(validateGatingTemporal({ time: { unlockAt: NOW } }, NOW)).toEqual({
      ok: true,
    });
    expect(
      validateGatingTemporal({ time: { unlockAt: NOW + 60_000 } }, NOW),
    ).toEqual({ ok: true });
  });

  test("rejects unlockAt in the deep past (beyond grace)", () => {
    const r = validateGatingTemporal(
      { time: { unlockAt: NOW - 120_000 } },
      NOW,
    );
    expect(r.ok).toBe(false);
    expect(r.ok || (r as { error: string }).error).toMatch(/unlockAt.*past/);
  });

  test("rejects expiresAt at-or-before now (already-expired window)", () => {
    const r1 = validateGatingTemporal({ time: { expiresAt: NOW } }, NOW);
    const r2 = validateGatingTemporal({ time: { expiresAt: NOW - 1 } }, NOW);
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
  });
});

describe("validateGatingForPersona (#103 §3)", () => {
  test("ok when no multisig OR persona address is not in signer list", () => {
    expect(validateGatingForPersona(undefined, TEST_BB1.AGENT)).toEqual({
      ok: true,
    });
    expect(
      validateGatingForPersona(
        { multisig: { signers: [{ address: TEST_BB1.TO1 }], threshold: 1 } },
        TEST_BB1.AGENT,
      ),
    ).toEqual({ ok: true });
  });

  test("rejects when the persona's own address is a multisig signer (self-approval trap)", () => {
    const r = validateGatingForPersona(
      {
        multisig: {
          signers: [{ address: TEST_BB1.AGENT }, { address: TEST_BB1.TO1 }],
          threshold: 2,
        },
      },
      TEST_BB1.AGENT,
    );
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/self-approve/);
  });
});
