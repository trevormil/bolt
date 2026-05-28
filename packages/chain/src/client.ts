import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import {
  SigningStargateClient,
  StargateClient,
  assertIsDeliverTxSuccess,
  type Coin,
  type DeliverTxResponse,
} from "@cosmjs/stargate";
import { env, createLogger } from "@vellum/shared";

// Accepted advisory: `bun audit` reports a LOW `elliptic <=6.6.1` (GHSA-848j-6mx2-7j84)
// via @cosmjs/crypto. 6.6.1 is the latest release — no patched version exists yet —
// and this is a devnet-only path, so it's accepted until cosmjs ships a fixed dep.
//
// BitBadges is a Cosmos SDK chain → standard cosmjs works for x/bank + queries.
// Tokenization-module messages (vaults, approvals) layer on via the bitbadges
// SDK / bb CLI in later tickets. This module is the signing/broadcast/confirm
// foundation, validated against the Meridian devnet.

const PREFIX = "bb";
// Devnet accepts zero-fee txs (min-gas-prices = 0), so no fee coins are attached.
const DEFAULT_FEE = { amount: [] as Coin[], gas: "200000" };
const log = createLogger("chain");

export type { Coin };

/**
 * Retry an idempotent operation with exponential backoff + FULL jitter (#24
 * F-05). Full jitter (sleep ∈ [0, base·2^n]) avoids the thundering-herd of a
 * fixed/decorrelated backoff when many callers retry at once. Only ever wrap
 * idempotent work (reads, connects) — NEVER a broadcast, which could double-send.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { tries?: number; baseMs?: number; label?: string } = {},
): Promise<T> {
  const tries = opts.tries ?? 3;
  const baseMs = opts.baseMs ?? 200;
  let lastErr: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt === tries - 1) break;
      const ceil = baseMs * 2 ** attempt;
      const wait = Math.floor(Math.random() * ceil); // full jitter
      if (opts.label)
        log.warn(
          `${opts.label} attempt ${attempt + 1} failed, retrying in ${wait}ms`,
        );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

/** The RPC endpoints to try, in order: primary then optional fallbacks (F-05). */
function rpcEndpoints(): string[] {
  const fallbacks = env.BITBADGES_RPC_FALLBACKS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [env.BITBADGES_RPC, ...fallbacks];
}

/**
 * Thrown by confirmTx ONLY when the chain definitively rejected the tx (nonzero
 * code). Distinct from timeout/network errors (plain Error) so callers can treat
 * a not-yet-observed tx as still-pending/reconcilable rather than failed (0023).
 */
export class TxRevertedError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
    this.name = "TxRevertedError";
  }
}

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

/** All balances for an address (read-only, via RPC). Resilient (#24 F-05):
 *  retries each endpoint with jittered backoff, then falls over to the next
 *  configured fallback endpoint before giving up. */
export async function getBalances(address: string): Promise<readonly Coin[]> {
  const endpoints = rpcEndpoints();
  let lastErr: unknown;
  for (const rpc of endpoints) {
    try {
      return await withRetry(
        async () => {
          const client = await StargateClient.connect(rpc);
          try {
            return await client.getAllBalances(address);
          } finally {
            client.disconnect();
          }
        },
        { label: `getBalances(${rpc})` },
      );
    } catch (e) {
      lastErr = e;
      if (endpoints.length > 1) log.warn(`rpc ${rpc} exhausted, trying next`);
    }
  }
  throw lastErr;
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
    const result = await client.sendTokens(
      account.address,
      recipient,
      [{ denom, amount }],
      DEFAULT_FEE,
      "vellum chain validation",
    );
    // sendTokens resolves on block inclusion even when code != 0 — throw so a
    // failed tx never reaches caller code (or the ledger) as a success.
    assertIsDeliverTxSuccess(result);
    return result;
  } finally {
    client.disconnect();
  }
}

/**
 * Claim devnet USDC from the Meridian faucet (10 USDC/request) to a bb1 address.
 * Dev convenience for funding persona wallets — devnet only.
 */
export async function claimFaucet(
  address: string,
): Promise<{ txHash?: string; amount?: string; denom?: string }> {
  const res = await fetch(`${env.VELLUM_FAUCET_URL}/api/v0/faucet/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(
      `faucet ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  return (await res.json()) as {
    txHash?: string;
    amount?: string;
    denom?: string;
  };
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
    // Bound each request so a stalled LCD connection can't blow past timeoutMs.
    const remaining = timeoutMs - (Date.now() - start);
    let res: Response;
    try {
      res = await fetch(`${env.BITBADGES_LCD}/cosmos/tx/v1beta1/txs/${hash}`, {
        signal: AbortSignal.timeout(Math.min(remaining, 5_000)),
      });
    } catch (e) {
      // Abort/network error → keep polling within the overall budget.
      if (e instanceof Error && e.message.startsWith("tx ")) throw e;
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    if (res.ok) {
      const body = (await res.json()) as {
        tx_response?: { code?: number; height?: string; raw_log?: string };
      };
      const tx = body.tx_response;
      if (tx && tx.code !== undefined) {
        if (tx.code !== 0)
          throw new TxRevertedError(
            `tx ${hash.slice(0, 10)} reverted: ${tx.raw_log}`,
            tx.code,
          );
        return { height: Number(tx.height ?? 0), code: tx.code };
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `tx ${hash.slice(0, 10)} not committed within ${timeoutMs / 1000}s`,
  );
}
