import { describe, expect, test } from "bun:test";
import { addressOf, generateWallet, walletFromMnemonic } from "./client.ts";

// Network-free: HD derivation is deterministic. (Live broadcast/confirm against
// the Meridian devnet is validated manually via the CLI — see the MR; it needs
// funds + network so it isn't a CI test.)

const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("chain client (offline)", () => {
  test("derives a stable bb1 address from a mnemonic", async () => {
    const a = await addressOf(MNEMONIC);
    const b = await addressOf(MNEMONIC);
    expect(a).toBe(b);
    expect(a).toMatch(/^bb1[0-9a-z]{38,}$/);
  });

  test("different mnemonics derive different addresses", async () => {
    const g1 = await generateWallet();
    const g2 = await generateWallet();
    expect(g1.address).not.toBe(g2.address);
    expect(g1.address).toMatch(/^bb1/);
  });

  test("generateWallet returns a 24-word mnemonic", async () => {
    const { mnemonic } = await generateWallet();
    expect(mnemonic.trim().split(/\s+/)).toHaveLength(24);
  });

  test("walletFromMnemonic exposes the bb-prefixed account", async () => {
    const [account] = await (await walletFromMnemonic(MNEMONIC)).getAccounts();
    expect(account?.address).toMatch(/^bb1/);
  });
});
