import type { Page } from "@playwright/test";

// Keplr mock harness (#90 / #98). The vault / wallet / multisig-vote flows are
// gated on a connected Keplr wallet — the human is the vault manager + the tx
// signer — so offline e2e can't drive them without a fake `window.keplr`. Call
// BEFORE `page.goto`. The connect tier (experimentalSuggestChain/enable/getKey)
// unlocks address-gated flows (vault create — the wallet is just the manager and
// the create is server-side). The sign tier is an OfflineDirectSigner whose
// signed bytes are broadcast to the cosmos LCD — which the test-server serves
// same-origin under /lcd/* (test-server.ts), so the human-signed flows run
// fully offline. `getKey` returns pubKey/address/algo in full because the
// bitbadges SDK's `fromKeplr` reads them and throws a buffer error otherwise.

// A *checksum-valid* bb1 address (derived from a real test mnemonic during an
// earlier devnet smoke verification, so the bech32 checksum is real). The server
// only regex-checks (`/^bb1[0-9a-z]{38,}$/`), but the bitbadges SDK on the
// client validates the full bech32 checksum in `fromKeplr` — a syntactically
// valid fake is rejected with "Account address must be a validly formatted
// BitBadges address." Distinct from the seeded "atlas" agent wallet.
export const MOCK_HUMAN_ADDRESS = "bb1gsvdpdxec8hsu57lhxg5xem7refr233zlva7x9";

export async function mockKeplr(
  page: Page,
  opts: { address?: string } = {},
): Promise<void> {
  const address = opts.address ?? MOCK_HUMAN_ADDRESS;

  await page.addInitScript((addr: string) => {
    const account = {
      address: addr,
      algo: "secp256k1",
      pubkey: new Uint8Array(33), // valid length; never verified (broadcast is stubbed)
    };
    const signer = {
      getAccounts: async () => [account],
      // OfflineDirectSigner shape: echo the signDoc + a canned signature. The LCD
      // broadcast is stubbed below, so the signature is never verified on-chain.
      signDirect: async (_signerAddress: string, signDoc: unknown) => ({
        signed: signDoc,
        signature: {
          pub_key: { type: "tendermint/PubKeySecp256k1", value: "" },
          signature: "ZmFrZS1lMmUtc2lnbmF0dXJl", // base64("fake-e2e-signature")
        },
      }),
    };
    // Full Key shape — the bitbadges SDK's fromKeplr reads pubKey/address/algo
    // (Uint8Arrays); omitting them surfaces "argument must be … Buffer …
    // Received undefined" deep in signing.
    const key = {
      name: "E2E Human",
      algo: "secp256k1",
      pubKey: new Uint8Array(33),
      address: new Uint8Array(20),
      bech32Address: addr,
      isNanoLedger: false,
      isKeystone: false,
    };
    // Real Keplr exposes signDirect AS A TOP-LEVEL window.keplr method (not just
    // via getOfflineSigner) — the bitbadges SDK's fromKeplr calls
    // `this.wallet.signDirect(chainId, signer, signDoc, opts?)`. Returns a
    // DirectSignResponse-shaped object; the LCD broadcast (test-server /lcd/*)
    // never verifies the signature.
    const cannedSig = {
      signed: null as unknown,
      signature: {
        pub_key: { type: "tendermint/PubKeySecp256k1", value: "" },
        signature: "ZmFrZS1lMmUtc2lnbmF0dXJl",
      },
    };
    (window as unknown as { keplr: unknown }).keplr = {
      experimentalSuggestChain: async () => {},
      enable: async () => {},
      getKey: async () => key,
      signDirect: async (
        _chainId: string,
        _signerAddress: string,
        signDoc: unknown,
      ) => ({ ...cannedSig, signed: signDoc }),
      getOfflineSigner: () => signer,
      getOfflineSignerOnlyAmino: () => signer,
      getOfflineSignerAuto: async () => signer,
    };
  }, address);

  // The LCD reads/broadcast are served same-origin by the test-server at /lcd/*
  // (test-server.ts) — `BITBADGES_LCD` points at `http://127.0.0.1:<port>/lcd`,
  // so this helper only needs to inject `window.keplr`; no cross-origin route
  // stubbing required.
}
