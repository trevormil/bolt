// Client-side Keplr wallet for the human principal (0027). The human signs from
// their OWN browser wallet (coin type 118, standard Cosmos) — distinct from the
// agent's server-derived hot keys. Pattern copied from the Meridian app
// (apps/web/lib/chain/keplr.ts + broadcast.ts), trimmed to Keplr-only (no EVM).
//
// The heavy `bitbadges` SDK (+ cosmjs, ~900 KB) is imported DYNAMICALLY inside
// signAndBroadcast (#32) so it's split into its own chunk and only fetched when
// the human actually signs a tx — not on first paint. Everything else in this
// module is plain fetch with no SDK dependency.

interface KeplrWindow {
  experimentalSuggestChain: (info: unknown) => Promise<void>;
  enable: (chainId: string) => Promise<void>;
  getKey: (chainId: string) => Promise<{ name: string; bech32Address: string }>;
}
declare global {
  interface Window {
    keplr?: KeplrWindow;
  }
}

export interface ChainConfig {
  chainId: string;
  rpc: string;
  lcd: string;
  denom: string;
}

let _config: ChainConfig | null = null;
export async function loadConfig(): Promise<ChainConfig> {
  if (_config) return _config;
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error("failed to load chain config");
  _config = (await res.json()) as ChainConfig;
  return _config;
}

export function hasKeplr(): boolean {
  return typeof window !== "undefined" && !!window.keplr;
}

function chainInfo(cfg: ChainConfig) {
  return {
    chainId: cfg.chainId,
    chainName: "BitBadges",
    rpc: cfg.rpc,
    rest: cfg.lcd,
    bip44: { coinType: 118 },
    bech32Config: {
      bech32PrefixAccAddr: "bb",
      bech32PrefixAccPub: "bbpub",
      bech32PrefixValAddr: "bbvaloper",
      bech32PrefixValPub: "bbvaloperpub",
      bech32PrefixConsAddr: "bbvalcons",
      bech32PrefixConsPub: "bbvalconspub",
    },
    // USDC is the asset Vellum uses; ubadge is the (zero-priced, devnet) fee/stake
    // currency Keplr requires to be declared.
    currencies: [
      { coinDenom: "USDC", coinMinimalDenom: cfg.denom, coinDecimals: 6 },
      { coinDenom: "BADGE", coinMinimalDenom: "ubadge", coinDecimals: 9 },
    ],
    feeCurrencies: [
      {
        coinDenom: "BADGE",
        coinMinimalDenom: "ubadge",
        coinDecimals: 9,
        gasPriceStep: { low: 0, average: 0, high: 0 },
      },
    ],
    stakeCurrency: {
      coinDenom: "BADGE",
      coinMinimalDenom: "ubadge",
      coinDecimals: 9,
    },
  };
}

export interface ConnectedWallet {
  address: string;
  name: string;
}

export async function connectKeplr(): Promise<ConnectedWallet> {
  if (!window.keplr) throw new Error("Keplr extension not detected");
  const cfg = await loadConfig();
  try {
    await window.keplr.experimentalSuggestChain(chainInfo(cfg));
  } catch {
    // Some Keplr setups already have the chain registered — ignore.
  }
  await window.keplr.enable(cfg.chainId);
  const key = await window.keplr.getKey(cfg.chainId);
  return { address: key.bech32Address, name: key.name };
}

/** The connected human's USDC balance (base µUSDC), queried from the LCD. */
export async function humanUsdcBalance(address: string): Promise<string> {
  const cfg = await loadConfig();
  const res = await fetch(
    `${cfg.lcd}/cosmos/bank/v1beta1/balances/${address}`,
  ).catch(() => null);
  if (!res?.ok) return "0";
  const json = (await res.json()) as {
    balances?: { denom: string; amount: string }[];
  };
  return json.balances?.find((b) => b.denom === cfg.denom)?.amount ?? "0";
}

// ── msg builders (inlined so the browser bundle stays free of server env) ──

export interface MsgJson {
  typeUrl: string;
  value: unknown;
}

/** A third-party multisig sign-off (#45 slice 3): a signer casts a yes-vote on
 *  a vault's withdrawal proposal. Each MsgCastVote IS a signature toward quorum;
 *  the withdrawal executes once cast yes-weight ≥ the vault's quorumThreshold. */
export function castVoteMsg(input: {
  voter: string; // the signer's connected wallet (creator)
  collectionId: string;
  approvalId: string;
  proposalId: string;
  yesWeight?: number; // this signer's weight (default 1)
}): MsgJson {
  return {
    typeUrl: "/tokenization.MsgCastVote",
    value: {
      creator: input.voter,
      collectionId: input.collectionId,
      approvalLevel: "collection",
      approverAddress: "",
      approvalId: input.approvalId,
      proposalId: input.proposalId,
      yesWeight: String(input.yesWeight ?? 1),
    },
  };
}

export function bankSendMsg(
  from: string,
  to: string,
  amountMicro: string,
  denom: string,
): MsgJson {
  return {
    typeUrl: "/cosmos.bank.v1beta1.MsgSend",
    value: {
      fromAddress: from,
      toAddress: to,
      amount: [{ denom, amount: amountMicro }],
    },
  };
}

const FULL_RANGE = [{ start: "1", end: "18446744073709551615" }];

/**
 * Human funds vault escrow (0016): the human signs (creator) + provides USDC,
 * but the minted 1:1 vault tokens go to the PERSONA AGENT wallet — because the
 * agent is the one who later withdraws within the vault's rules (vaults.ts burns
 * from the agent). Minting to the human would strand the escrow: a funded vault
 * could never be withdrawn (the agent would hold zero vault tokens to burn).
 * (#45 / !37 HIGH.) The deposit approval permits any initiator, so a
 * human-signed transfer that mints to the agent is valid.
 */
export function vaultDepositMsg(input: {
  human: string; // signer / tx creator (the human's Keplr wallet)
  agentAddress: string; // recipient of the minted vault tokens (the persona)
  collectionId: string;
  backingAddress: string;
  amountMicro: string;
}): MsgJson {
  return {
    typeUrl: "/tokenization.MsgTransferTokens",
    value: {
      creator: input.human,
      collectionId: input.collectionId,
      transfers: [
        {
          from: input.backingAddress,
          toAddresses: [input.agentAddress],
          balances: [
            {
              amount: input.amountMicro,
              tokenIds: [{ start: "1", end: "1" }],
              ownershipTimes: FULL_RANGE,
            },
          ],
          prioritizedApprovals: [
            {
              approvalId: "vault-deposit",
              approvalLevel: "collection",
              approverAddress: "",
              version: "0",
            },
          ],
          onlyCheckPrioritizedCollectionApprovals: true,
        },
      ],
    },
  };
}

// ── sign + broadcast (mirrors @vellum/chain/sdk.ts, with the Keplr adapter) ──

interface AccountInfo {
  accountNumber: number;
  sequence: number;
}
async function fetchAccount(
  lcd: string,
  address: string,
): Promise<AccountInfo | null> {
  const res = await fetch(`${lcd}/cosmos/auth/v1beta1/accounts/${address}`);
  if (!res.ok) return null;
  const json = (await res.json()) as {
    account?: { account_number?: string; sequence?: string };
  };
  const acct = json.account;
  if (!acct || acct.account_number == null) return null;
  return {
    accountNumber: Number(acct.account_number),
    sequence: Number(acct.sequence ?? 0),
  };
}

/** Sign `msgs` with the connected Keplr wallet and broadcast to the LCD; resolves
 *  with the tx hash once it's committed in a block (truth from chain). */
export async function signAndBroadcast(
  msgs: MsgJson[],
  memo = "vellum",
): Promise<string> {
  const cfg = await loadConfig();
  // Lazy-load the chain SDK only when signing (#32 — keeps it out of first paint).
  const {
    GenericCosmosAdapter,
    createTransactionPayload,
    createTxBroadcastBody,
    encodeMsgsFromJson,
  } = await import("bitbadges");
  const adapter = await GenericCosmosAdapter.fromKeplr(cfg.chainId);
  const address = adapter.address;
  const publicKey = await adapter.getPublicKey();
  const account = await fetchAccount(cfg.lcd, address);
  if (!account) {
    throw new Error(
      `your wallet ${address.slice(0, 12)}… is unregistered on-chain — fund it (any coin) first`,
    );
  }
  const txContext = {
    testnet: false,
    sender: { address, ...account, publicKey },
    fee: { amount: "0", denom: "ubadge", gas: "3000000" },
    memo,
  };
  const proto = encodeMsgsFromJson(msgs as never);
  const payload = createTransactionPayload(txContext as never, proto);
  const sig = await adapter.signDirect(payload as never, account.accountNumber);
  const broadcastBody = createTxBroadcastBody(
    txContext as never,
    proto,
    (sig as { signature: string }).signature,
  );
  const body =
    typeof broadcastBody === "string"
      ? JSON.parse(broadcastBody)
      : broadcastBody;
  const res = await fetch(`${cfg.lcd}/cosmos/tx/v1beta1/txs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    tx_response?: { code?: number; txhash?: string; raw_log?: string };
  };
  const tr = json.tx_response;
  if (!tr?.txhash)
    throw new Error(
      `broadcast returned no hash: ${JSON.stringify(json).slice(0, 200)}`,
    );
  if (tr.code && tr.code !== 0)
    throw new Error(`broadcast rejected (code ${tr.code}): ${tr.raw_log}`);
  await confirmTx(cfg.lcd, tr.txhash);
  return tr.txhash;
}

async function confirmTx(
  lcd: string,
  hash: string,
  timeoutMs = 20_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await fetch(`${lcd}/cosmos/tx/v1beta1/txs/${hash}`).catch(
      () => null,
    );
    if (r?.ok) {
      const j = (await r.json()) as {
        tx_response?: { code?: number; raw_log?: string };
      };
      const tx = j.tx_response;
      if (tx && tx.code !== undefined) {
        if (tx.code !== 0)
          throw new Error(`tx reverted on chain: ${tx.raw_log ?? ""}`);
        return;
      }
    }
    await new Promise((res) => setTimeout(res, 400));
  }
  throw new Error(
    `tx ${hash.slice(0, 10)}… not committed within ${timeoutMs / 1000}s`,
  );
}
