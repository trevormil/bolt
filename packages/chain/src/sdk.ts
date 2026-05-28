import {
  GenericCosmosAdapter,
  createTransactionPayload,
  createTxBroadcastBody,
  encodeMsgsFromJson,
} from "bitbadges";
import {
  Bip39,
  EnglishMnemonic,
  Slip10,
  Slip10Curve,
  stringToPath,
} from "@cosmjs/crypto";
import { toHex } from "@cosmjs/encoding";
import { env, createLogger } from "@vellum/shared";

// Unified BitBadges signing via the SDK (the tested path Meridian uses) — ONE
// identity + ONE signer for bank sends, vaults, and payment requests. BitBadges
// addresses are eth-style, so cosmjs key derivation does NOT match the chain's;
// the SDK adapter is authoritative. Read-only queries (balances, confirm) stay
// on the LCD/RPC (address-only, derivation-agnostic) in client.ts.

const log = createLogger("chain");

// Per-persona key: SLIP-0010 secp256k1 at the SDK's eth path m/44'/60'/0'/0/index.
// idx0 matches GenericCosmosAdapter.fromMnemonic; each index is a distinct,
// reproducible bb1 wallet from one master mnemonic.
export async function deriveAdapter(
  mnemonic: string,
  index: number,
): Promise<GenericCosmosAdapter> {
  const seed = await Bip39.mnemonicToSeed(new EnglishMnemonic(mnemonic));
  const { privkey } = Slip10.derivePath(
    Slip10Curve.Secp256k1,
    seed,
    stringToPath(`m/44'/60'/0'/0/${index}`),
  );
  return GenericCosmosAdapter.fromPrivateKey(
    toHex(privkey),
    env.BITBADGES_CHAIN_ID,
  );
}

// A tokenization/cosmos message as friendly JSON ({ typeUrl, value }). The
// builders (buildVault, buildPaymentRequest) emit this shape; value.creator must
// be set to the signer before signing.
export type MsgJson = { typeUrl: string; value: Record<string, unknown> };

export function bankSendMsg(
  fromAddress: string,
  toAddress: string,
  amount: string,
  denom = env.VELLUM_DENOM,
): MsgJson {
  return {
    typeUrl: "/cosmos.bank.v1beta1.MsgSend",
    value: { fromAddress, toAddress, amount: [{ denom, amount }] },
  };
}

interface AccountInfo {
  accountNumber: number;
  sequence: number;
}
interface AccountResponse {
  account?: { account_number?: string; sequence?: string };
}

/**
 * Parse a cosmos auth/accounts response into AccountInfo, or null when the
 * account isn't registered on-chain. The distinction matters: account numbers
 * are zero-based, so a registered first account legitimately has number 0 —
 * "not found" must be signalled by the missing account object (or a non-OK
 * response), never by treating 0 as a sentinel. Pure for unit testing.
 */
export function parseAccountResponse(
  ok: boolean,
  json: AccountResponse,
): AccountInfo | null {
  if (!ok) return null; // 404 etc. — account does not exist
  const acct = json.account;
  if (!acct || acct.account_number == null) return null; // no account on-chain
  return {
    accountNumber: Number(acct.account_number),
    sequence: Number(acct.sequence ?? 0),
  };
}

async function fetchAccount(address: string): Promise<AccountInfo | null> {
  const res = await fetch(
    `${env.BITBADGES_LCD}/cosmos/auth/v1beta1/accounts/${address}`,
    { signal: AbortSignal.timeout(15_000) },
  );
  return parseAccountResponse(res.ok, (await res.json()) as AccountResponse);
}

/**
 * Sign `msgs` with the adapter and broadcast WITHOUT waiting — returns the tx
 * hash so the caller (TxManager) can persist PENDING then confirm out of band.
 * Broadcasts straight to the cosmos LCD (the devnet's BitBadges /api/v0 isn't
 * public). The account must be registered on-chain (any coin receipt registers
 * it). Zero-fee devnet.
 */
export async function signAndBroadcast(
  adapter: GenericCosmosAdapter,
  msgs: MsgJson[],
  opts: { memo?: string; gas?: string } = {},
): Promise<string> {
  const address = adapter.address;
  const publicKey = await adapter.getPublicKey();
  const account = await fetchAccount(address);
  if (!account) {
    throw new Error(
      `account ${address} is unregistered on-chain — fund it (any coin) first`,
    );
  }
  const { accountNumber, sequence } = account;
  const txContext = {
    testnet: false,
    sender: { address, accountNumber, sequence, publicKey },
    fee: { amount: "0", denom: "ubadge", gas: opts.gas ?? "3000000" },
    memo: opts.memo ?? "vellum",
  };
  const proto = encodeMsgsFromJson(msgs as never);
  const payload = createTransactionPayload(txContext as never, proto);
  const sig = await adapter.signDirect(payload as never, accountNumber);
  const broadcastBody = createTxBroadcastBody(
    txContext as never,
    proto,
    (sig as { signature: string }).signature,
  );
  const body =
    typeof broadcastBody === "string"
      ? JSON.parse(broadcastBody)
      : broadcastBody;
  const res = await fetch(`${env.BITBADGES_LCD}/cosmos/tx/v1beta1/txs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json()) as {
    tx_response?: { code?: number; txhash?: string; raw_log?: string };
  };
  const tr = json.tx_response;
  if (!tr?.txhash)
    throw new Error(
      `broadcast returned no hash: ${JSON.stringify(json).slice(0, 200)}`,
    );
  // code != 0 here = a CheckTx (pre-inclusion) rejection — fail fast.
  if (tr.code && tr.code !== 0) {
    throw new Error(`broadcast rejected (code ${tr.code}): ${tr.raw_log}`);
  }
  log.info(
    `broadcast ${msgs.map((m) => m.typeUrl.split(".").pop()).join(",")} · ${tr.txhash.slice(0, 10)}`,
  );
  return tr.txhash;
}
