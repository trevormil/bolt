import type { Page } from "@playwright/test";

// Keplr mock harness (#90). The vault / wallet / multisig-vote flows are gated on
// a connected Keplr wallet — the human is the vault manager + the tx signer — so
// offline e2e can't drive them without a fake `window.keplr`. Call BEFORE
// `page.goto`. Two tiers:
//   • CONNECT (experimentalSuggestChain/enable/getKey) — VERIFIED: unlocks the
//     address-gated flows (e.g. vault create, where the connected wallet is just
//     the manager and the create itself is server-side). vaults.spec exercises it.
//   • SIGN+BROADCAST (getOfflineSigner + the LCD account/broadcast/tx-query stubs
//     below) — scaffolded for signed-flow specs (human send, escrow fund, vote),
//     but NOT yet covered by a passing test: the LCD route interception isn't
//     catching the cross-origin calls (signAndBroadcast still hits the real LCD →
//     "unregistered"). The `getKey` pubKey/address/algo fields are required by the
//     SDK's fromKeplr (omitting them throws a buffer error). See #90 for the
//     remaining work to land the first signed-flow spec.

// A syntactically valid bb1 address — the app validates with /^bb1[0-9a-z]{38,}$/
// (regex only, no bech32 checksum), so a fixed fake passes the manager/signer
// guards. Distinct from the seeded "atlas" agent wallet.
export const MOCK_HUMAN_ADDRESS = "bb1humanmocke2e0000000000000000000000000000";

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
    (window as unknown as { keplr: unknown }).keplr = {
      experimentalSuggestChain: async () => {},
      enable: async () => {},
      getKey: async () => key,
      getOfflineSigner: () => signer,
      getOfflineSignerOnlyAmino: () => signer,
      getOfflineSignerAuto: async () => signer,
    };
  }, address);

  // Stub every LCD call the wallet path makes so nothing hits the real devnet:
  //  - balances → empty (the connected-wallet USDC readout shows 0)
  //  - account  → registered (else signAndBroadcast aborts "unregistered")
  //  - broadcast (POST .../txs) → committed success
  //  - tx query  (GET .../txs/<hash>) → committed (confirmTx poll)
  const json = (route: import("@playwright/test").Route, value: unknown) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(value),
    });
  await page.route("**/cosmos/bank/v1beta1/balances/**", (route) =>
    json(route, { balances: [] }),
  );
  await page.route("**/cosmos/auth/v1beta1/accounts/**", (route) =>
    json(route, {
      account: {
        "@type": "/cosmos.auth.v1beta1.BaseAccount",
        address: MOCK_HUMAN_ADDRESS,
        account_number: "1",
        sequence: "0",
      },
    }),
  );
  // Broadcast (POST .../txs) → committed; tx query (GET .../txs/<hash>) → confirmTx.
  await page.route("**/cosmos/tx/v1beta1/txs", (route) =>
    json(route, {
      tx_response: { code: 0, txhash: "E2EHUMANTX", raw_log: "" },
    }),
  );
  await page.route("**/cosmos/tx/v1beta1/txs/*", (route) =>
    json(route, {
      tx_response: { code: 0, txhash: "E2EHUMANTX", height: "1", raw_log: "" },
    }),
  );
}
