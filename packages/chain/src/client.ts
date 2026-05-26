import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import {
  SigningStargateClient,
  StargateClient,
  type Coin,
  type DeliverTxResponse,
} from "@cosmjs/stargate";
import { env, createLogger } from "@vellum/shared";

// BitBadges is a Cosmos SDK chain → standard cosmjs works for x/bank + queries.
// Tokenization-module messages (vaults, approvals) layer on via the bitbadges
// SDK / bb CLI in later tickets. This module is the signing/broadcast/confirm
// foundation, validated against the Meridian devnet.

const PREFIX = "bb";
const DEFAULT_FEE = {
  amount: [{ denom: "ubadge", amount: "20000" }],
  gas: "200000",
};
const log = createLogger("chain");

export type { Coin };

/** Derive a secp256k1 HD wallet (bb-prefixed) from a mnemonic. */
export function walletFromMnemonic(
  mnemonic: string,
): Promise<DirectSecp256k1HdWallet> {
  return DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: PREFIX });
}

/** Resolve the `bb1...` address for a mnemonic. */
export async function addressOf(mnemonic: string): Promise<string> {
  const [account] = await (await walletFromMnemonic(mnemonic)).getAccounts();
  if (!account) throw new Error("wallet produced no account");
  return account.address;
}

/** Generate a fresh 24-word wallet (devnet signer bootstrap). */
export async function generateWallet(): Promise<{
  mnemonic: string;
  address: string;
}> {
  const wallet = await DirectSecp256k1HdWallet.generate(24, { prefix: PREFIX });
  const [account] = await wallet.getAccounts();
  if (!account) throw new Error("generated wallet produced no account");
  return { mnemonic: wallet.mnemonic, address: account.address };
}

/** All balances for an address (read-only, via RPC). */
export async function getBalances(address: string): Promise<readonly Coin[]> {
  const client = await StargateClient.connect(env.BITBADGES_RPC);
  try {
    return await client.getAllBalances(address);
  } finally {
    client.disconnect();
  }
}

/** Send native coins; resolves once the tx is included in a block. */
export async function sendCoins(
  mnemonic: string,
  recipient: string,
  amount: string,
  denom = "ubadge",
): Promise<DeliverTxResponse> {
  const wallet = await walletFromMnemonic(mnemonic);
  const [account] = await wallet.getAccounts();
  if (!account) throw new Error("signer wallet produced no account");
  const client = await SigningStargateClient.connectWithSigner(
    env.BITBADGES_RPC,
    wallet,
  );
  try {
    log.info(`send ${amount}${denom} → ${recipient} from ${account.address}`);
    return await client.sendTokens(
      account.address,
      recipient,
      [{ denom, amount }],
      DEFAULT_FEE,
      "vellum chain validation",
    );
  } finally {
    client.disconnect();
  }
}

/**
 * Confirm a tx by polling the LCD until it is committed (or timeout).
 * Returns the confirmed height — the seed of the chain-state reconciliation
 * invariant (ticket 0023): truth comes from the chain, not the broadcast return.
 */
export async function confirmTx(
  hash: string,
  timeoutMs = 20_000,
): Promise<{ height: number; code: number }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(
      `${env.BITBADGES_LCD}/cosmos/tx/v1beta1/txs/${hash}`,
    );
    if (res.ok) {
      const body = (await res.json()) as {
        tx_response?: { code?: number; height?: string; raw_log?: string };
      };
      const tx = body.tx_response;
      if (tx && tx.code !== undefined) {
        if (tx.code !== 0)
          throw new Error(`tx ${hash.slice(0, 10)} reverted: ${tx.raw_log}`);
        return { height: Number(tx.height ?? 0), code: tx.code };
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `tx ${hash.slice(0, 10)} not committed within ${timeoutMs / 1000}s`,
  );
}
