---
title: "BitBadges Integration — Payment-First Agent on the Founder's L1"
subject: bitbadges-integration
date: 2026-05-26
status: research
note: >
  Point-in-time research (May 26, 2026). Every claim is grounded in
  docs.bitbadges.io (fetched directly; URLs cited throughout). No product
  decision is made or implied. Where the docs were silent or ambiguous, the
  gap is flagged explicitly rather than papered over.
---

# BitBadges Integration — Payment-First Agent on the Founder's L1

This document answers: **how do BitBadges' on-chain primitives map to the
vellum-project's chosen differentiators** (token budgets, agent vaults, BB-402
as the x402 variant, agentic payments, per-persona compartmentalization)?
It is grounded entirely in the public documentation at docs.bitbadges.io.

> **Verified (2026-05-26):** the three load-bearing claims were re-checked
> against the live docs — **BB-402** exists as described (token-ownership-gated
> HTTP 402 with `X-BB-Proof` + `AccessCondition`); the agent USDC-vault tutorial
> exists (titled *"E2E: AI Agent with USDC Vault"*); and the `bb` CLI agent
> workflow (`bb api` / `bb check` / `bb explain` / `bb auth`, install via
> `install.bitbadges.io`) is documented. Remaining unconfirmed items are flagged
> in §11–12.

---

## 1. What BitBadges is

### 1.1 The chain

BitBadges is an **L1 delegated proof-of-stake blockchain built with Cosmos SDK**,
achieving instant finality via Tendermint. Its distinguishing module is
**`x/tokenization`** — a native Cosmos SDK module that provides a universal
tokenization standard without requiring smart contracts. Everything that would
normally be encoded in a Solidity contract (transfer rules, access control,
compliance gates, escrow) is expressed as declarative on-chain configuration
inside the module.

Source: [Blockchain overview](https://docs.bitbadges.io/for-developers/bitbadges-blockchain/overview.md),
[x/tokenization](https://docs.bitbadges.io/token-standard/x-tokenization.md)

### 1.2 The token standard

The `x/tokenization` module introduces **collections** — each collection is an
independent token namespace with its own approval engine, permissions, and
optionally a backing mechanism. Tokens within a collection are identified by
integer IDs and time-ranged ownership windows. A single collection can behave
as an NFT collection, a fungible token, a subscription, a credit pool, a
payment receipt, or a USDC-backed smart-token vault — the same module, different
configuration.

Tokens are not ERC-20 or ERC-721; this is a proprietary standard purpose-built
for compliance and programmable transferability. It is comparable in intent to
ERC-3643 (permissioned tokens) but implemented at the Cosmos SDK module level
rather than in smart contracts.

Source: [Token standard overview](https://docs.bitbadges.io/token-standard/learn.md),
[BitBadges vs ERC-3643](https://docs.bitbadges.io/overview/bitbadges-vs-erc3643.md)

### 1.3 $BADGE — the native token

**$BADGE** (base denomination `ubadge`, 9 decimals) is the native gas and
staking token. Its three functions: gas/tx fees, proof-of-stake validator
bonding, and as an in-site currency (though the docs note the platform "will
prioritize others like USDC and more established ones" for actual commerce).
Initial circulating supply at launch was 100 million BADGE. Community pool
receives 0.1% taker fees on all transactions.

Supported IBC-bridged denominations on the chain: USDC (from Noble, 6
decimals), ATOM, OSMO, and a custom CHAOS token. USDC is the primary coin used
for backing smart tokens and payment flows.

Source: [BADGE token](https://docs.bitbadges.io/overview/badge.md),
[Supported denominations](https://docs.bitbadges.io/for-developers/bitbadges-blockchain/supported-denoms.md)

### 1.4 Address model — dual bech32 / EVM

BitBadges supports two address formats simultaneously, derived from the same
underlying key:

- **Cosmos-native**: bech32 `bb1...` prefix (standard Cosmos SDK format)
- **EVM-compatible**: `0x`-prefixed hex addresses

The same keypair resolves to both; the BitBadges SDK provides explicit
conversion:

```ts
convertToBitBadgesAddress("0x14574a6DFF2Ddf9e07828b4345d3040919AF5652")
// => "bb1z3t55m0l9h0eupuz3dp5t5cypyv674jj7mz2jw"

convertToEthAddress("bb1z3t55m0l9h0eupuz3dp5t5cypyv674jj7mz2jw")
// => "0x14574a6DFF2Ddf9e07828b4345d3040919AF5652"
```

The EVM path (HD derivation coin type 60, `m/44'/60'/0'/0/0`) and the Cosmos
path (coin type 118) produce **different `bb1` addresses from the same
mnemonic** — choosing the adapter up-front is important when generating an
agent wallet.

EVM endpoints: mainnet chain ID `50024`, RPC at `https://evm-rpc.bitbadges.io`.
Cosmos endpoints: RPC `https://rpc.bitbadges.io`, LCD `https://lcd.bitbadges.io`.
The chain supports MetaMask, ethers.js, Hardhat, and Foundry via the EVM path.

Source: [Address conversions](https://docs.bitbadges.io/for-developers/bitbadges-sdk/common-snippets/address-conversions.md),
[EVM RPC endpoints](https://docs.bitbadges.io/for-developers/bitbadges-blockchain/evm-rpc-endpoints.md)

---

## 2. Wallets and the `bb` CLI

### 2.1 Binary and installation

The canonical chain binary is **`bitbadgeschaind`**, aliased as **`bb`**. Both
install via a single one-liner:

```bash
curl -fsSL https://install.bitbadges.io | sh
```

This places `bitbadgeschaind` in `/usr/local/bin/` with the `bb` alias.
Supports Linux (x86\_64, ARM64), macOS (Intel, Apple Silicon), and Windows via
WSL/Git Bash. Verify with `bb version` (chain binary) and `bb doctor` (SDK CLI
health).

The `bb` command is actually a **two-component tool**: the chain binary handles
raw Cosmos SDK operations, and the SDK CLI (separately installable via `npm
install -g bitbadges` or `bun install -g bitbadges`) adds higher-level
development commands. The one-liner installs both.

Source: [CLI installation](https://docs.bitbadges.io/for-developers/cli/installation.md),
[CLI for AI agents](https://docs.bitbadges.io/for-developers/cli/for-ai-agents.md)

### 2.2 Key management

```bash
bb keys add agent-wallet               # generate new key (saves mnemonic)
bb keys add agent-wallet --recover     # restore from mnemonic
bb keys list                           # list all stored keys
bb keys show agent-wallet              # display key details + address
bb keys export agent-wallet            # export to armor file
bb keys import agent-wallet keyfile.armor
bb keys delete agent-wallet
```

Both `eth_secp256k1` (EVM-compatible) and `secp256k1` (standard Cosmos) key
types are supported. The default keyring backend is `test` (unencrypted, for
development). Production deployments should use `--keyring-backend file` or
`os`.

Source: [Chain commands](https://docs.bitbadges.io/for-developers/cli/chain-commands.md)

### 2.3 Sending transactions via the chain binary

The general transaction pattern:

```bash
bb tx <module> <command> [args...] \
  --from agent-wallet \
  --chain-id bitbadges-1 \
  --node https://lcd.bitbadges.io:443 \
  --gas auto \
  --gas-adjustment 1.5 \
  --fees 10000ubadge
```

Tokenization module examples:

```bash
bb tx tokenization create-collection ./col.json --from agent-wallet
bb query tokenization collection 1
bb query tokenization balance 1 bb1abc...
bb tx wait $TXHASH --mainnet          # poll until committed
```

**Note on `bb tx bank send`**: The CLI docs document `bb tx tokenization ...`
commands extensively; `bb tx bank send` for plain BADGE transfers between
addresses is not explicitly shown in the docs (it follows the standard Cosmos
SDK `bank` module syntax but this was not confirmed in a concrete example). For
programmatic agent use the `BitBadgesSigningClient` approach below is cleaner.

Source: [Chain commands](https://docs.bitbadges.io/for-developers/cli/chain-commands.md),
[Create and broadcast txs](https://docs.bitbadges.io/for-developers/create-and-broadcast-txs/chain-cli.md)

### 2.4 Querying and signing via SDK CLI

For read-heavy agent workflows:

```bash
bb api tokens get-collection 1        # query a collection
bb api tokens get-balance --body '{...}'
bb api --search approve               # discover API routes
bb check tx.json                      # validate before broadcasting
bb explain tx.json                    # human-readable audit
bb simulate tx.json                   # dry-run with balance diffs
```

For signed operations:

```bash
bb auth challenge                     # get a sign challenge
bb sign-arbitrary agent-wallet "$MSG" # sign arbitrary data
bb auth login --browser               # browser-wallet session
bb deploy --browser                   # broadcast via browser wallet
```

The CLI produces structured JSON output (`{ok, data, warnings, hint?, meta?,
error}`), accepts stdin and `@file.json` paths, and exposes `--help-json` for
machine-readable command discovery. Setting `BB_QUIET=1` silences deprecation
banners.

Source: [CLI for AI agents](https://docs.bitbadges.io/for-developers/cli/for-ai-agents.md)

### 2.5 Programmatic signing with `BitBadgesSigningClient`

For fully headless agent operation (no browser, no interactive shell), the
TypeScript SDK provides `BitBadgesSigningClient`:

```typescript
import { BitBadgesSigningClient, GenericEvmAdapter } from 'bitbadges';

// From private key (EVM path — recommended for bots/agents)
const adapter = await GenericEvmAdapter.fromPrivateKey(
  '0x...privateKey...',
  'https://evm-rpc.bitbadges.io',
);
const client = new BitBadgesSigningClient({ adapter });

// Sign and broadcast any message
const result = await client.signAndBroadcast([
  MsgTransferTokens.create({
    creator: client.address,
    collectionId: '1',
    transfers: [/* ... */],
  }),
]);
// result.txHash, result.success, result.error
```

The client handles: account sequence management, automatic retry on sequence
mismatch, gas simulation, and broadcasting. It supports both EVM and Cosmos
adapter paths. The docs explicitly call this out as the recommended approach for
"backend services, bots, and AI agents."

Source: [BitBadgesSigningClient](https://docs.bitbadges.io/for-developers/create-and-broadcast-txs/signing-client.md)

---

## 3. The approval and transferability engine

This is BitBadges' core differentiator and the most important primitive for
building agent spending controls.

### 3.1 Three levels of approval

Every token transfer must satisfy all applicable approvals across three levels:

1. **Collection approvals** — set by the collection manager; global rules
   applying to all transfers. Every transfer MUST satisfy collection approvals.
2. **Outgoing approvals** — set by the sender; control what the sender allows
   to leave their wallet. Stored in `UserBalanceStore`.
3. **Incoming approvals** — set by the recipient; control what they accept.
   Stored in `UserBalanceStore`.

Collection approvals can override user-level approvals via
`overridesFromOutgoingApprovals` and `overridesToIncomingApprovals` flags — used
for revocation and forced-transfer scenarios.

Source: [Transferability](https://docs.bitbadges.io/token-standard/learn/transferability.md)

### 3.2 The six core matching fields

Every approval (at any level) specifies six dimensions that must match a
transfer for the approval to apply:

| Field | What it controls |
|---|---|
| `toListId` | Who can receive |
| `fromListId` | Who can send (use `"Mint"` for minting, `"!Mint"` for normal transfers) |
| `initiatedByListId` | Who can initiate/trigger the transfer |
| `transferTimes` | When the transfer can occur (Unix ms ranges) |
| `tokenIds` | Which token IDs |
| `ownershipTimes` | Which ownership time windows are being transferred |

**First-match policy**: approval arrays are evaluated linearly; only the first
matching element applies.

### 3.3 Approval criteria — the enforcement layer

Beyond matching, each approval has an `iApprovalCriteria` block that defines
hard constraints:

**Transfer limits:**
- `maxNumTransfers` — four independent caps: `overallMaxNumTransfers`,
  `perFromAddressMaxNumTransfers`, `perToAddressMaxNumTransfers`,
  `perInitiatedByAddressMaxNumTransfers`. Uses increment-only trackers. Supports
  periodic reset via `ResetTimeIntervals` (specify `startTime` +
  `intervalLength` in ms; set both to zero to disable resets).
- `approvalAmounts` — cumulative amount caps (same tracker mechanism, different
  tally dimension: total tokens moved, not just transfer count).

**Payment on transfer:**
- `coinTransfers` — attach a `sdk.Coin` payment to every approval use.
  Structure: `{ to: address, coins: [{amount, denom}], overrideFromWithApproverAddress?, overrideToWithInitiator? }`.
  The collection's **Mint Escrow Address** (a `bb1...` address derived from
  collection ID, no known private key) holds Cosmos-native funds; seeded at
  collection creation via `mintEscrowCoinsToTransfer`. Funds release only
  through collection approvals. Note: enabling `coinTransfers` disables
  auto-scan mode for that approval.

**Cryptographic gates:**
- `merkleChallenges` — require valid merkle proofs (one-time codes, allowlists).
- `ethSignatureChallenges` — require an Ethereum signature from a specific key.
- `evmQueryChallenges` — require an on-chain EVM contract query to return a
  specific value.
- `dynamicStoreChallenges` — check the initiator/sender/recipient against an
  on-chain dynamic store (address -> boolean mapping; see section 6).
- `votingChallenges` — require weighted quorum.

**Ownership gates:**
- `mustOwnTokens` — gate the transfer on a party owning specific tokens in
  another collection. Fields: `collectionId`, `tokenIds`, `amountRange`,
  `ownershipTimes`, `ownershipCheckParty` (initiator / sender / recipient /
  hardcoded address).

**Predetermined allocation:**
- `predeterminedBalances` — define exact token amounts per transfer (manual
  specification or auto-incremented patterns). Used for sequential minting,
  subscriptions, and NFT drops where each transfer must deliver exactly the
  right tokens.

**Address type checks:**
- `senderChecks`, `recipientChecks`, `initiatorChecks` — restrict by address
  type (e.g., no EVM contracts, no liquidity pool addresses).
- `requireToEqualsInitiatedBy`, `requireFromEqualsInitiatedBy` — enforce that
  signer and recipient/sender are the same.

**Other controls:**
- `autoDeletionOptions` — delete the approval after N uses.
- `userRoyalties` — percentage-based royalty on transfers.
- `altTimeChecks` — deny transfers during specific time windows (e.g., offline
  hours).
- `overridesFromOutgoingApprovals` / `overridesToIncomingApprovals` — bypass
  user-level approvals (needed for Mint address, revocation, admin override).
- `allowBackedMinting` — permit IBC-backed path operations (collection-level
  only).
- `allowSpecialWrapping` — permit wrapper address operations.

**Tracker immutability**: approval trackers are increment-only and immutable.
To reset, you must create a new tracker ID by changing `amountTrackerId`. Do not
reuse old tracker IDs.

Source: [Approval criteria](https://docs.bitbadges.io/token-standard/learn/approval-criteria.md),
[Max number of transfers](https://docs.bitbadges.io/token-standard/learn/approval-criteria/max-number-of-transfers.md),
[Approval trackers](https://docs.bitbadges.io/token-standard/learn/approval-criteria/approval-trackers.md),
[BADGE transfers in criteria](https://docs.bitbadges.io/token-standard/learn/approval-criteria/usdbadge-transfers.md),
[Badge ownership](https://docs.bitbadges.io/token-standard/learn/approval-criteria/badge-ownership.md)

### 3.4 Permissions (manager controls)

The collection manager controls which approval fields can be updated in the
future. Permissions are expressed as time-based arrays: each entry covers a
time range and is either permanently permitted or permanently forbidden. Once
locked, no upgrade can re-open a permission. This is the mechanism for making
token rules immutable — "the chain enforces immutable terms after deployment."

Source: [Permissions](https://docs.bitbadges.io/token-standard/learn/permissions.md)

---

## 4. Escrow, backing, and the vault primitive

### 4.1 Smart tokens — IBC-backed escrow

A **smart token** is a collection configured with a `cosmosCoinBackedPath`
invariant specifying a 1:1 backing ratio between an IBC coin (e.g., USDC) and
collection tokens. The system generates a deterministic **backing address** (a
`bb1...` address with no known private key, derived from the IBC denom via a
hash function). This address holds the locked IBC coins.

Three-phase lifecycle:
1. **Backing (deposit):** User sends IBC coins to the backing address → receives
   collection tokens at the specified ratio.
2. **Holding:** Tokens exist in the compliance silo and are transferable per
   approval rules. For vaults, this phase is locked (no peer-to-peer transfer).
3. **Unbacking (withdrawal):** User sends collection tokens to the backing
   address → receives IBC coins back at the 1:1 ratio.

Approvals gate both directions. An unbacking approval can encode: daily
withdrawal limits, time-gated windows, recipient allowlists, 2FA thresholds —
all enforced at the protocol level, not in application code.

Restriction: no Mint address transfers are allowed on IBC-backed collections;
all supply enters through the backing mechanism only. The `cosmosCoinBackedPath`
is set as a collection invariant at creation and cannot be modified.

Source: [IBC-backed minting](https://docs.bitbadges.io/token-standard/learn/ibc-backed-minting.md),
[Smart token skill](https://docs.bitbadges.io/token-standard/skills/smart-token.md),
[E2E: AI Agent with USDC Vault](https://docs.bitbadges.io/for-developers/ai-agents/openclaw-vault-tutorial.md)

### 4.2 Cosmos coin wrapper paths

An alternative to IBC-backed paths: **CosmosCoinWrapperPath** creates a custom
native coin denom (`badges:collectionId:denom`) paired with the collection
tokens. Wrapping burns the collection tokens and mints the native coins; 
unwrapping burns the native coins and mints collection tokens. The key
difference from IBC-backed: no existing IBC denom is needed; the wrapper
creates its own denom. Wrapper paths can be added post-launch (unlike the
invariant-locked IBC path). Used primarily to enable IBC transport of tokenized
assets.

Source: [Cosmos coin wrapper paths](https://docs.bitbadges.io/token-standard/learn/cosmos-coin-wrapper-paths.md)

### 4.3 Mint escrow address

The **Mint Escrow Address** is a separate concept from the backing address: a
`bb1...` address (derived from the collection ID, no known private key) that
holds native `sdk.Coin` funds for use in `coinTransfers` attached to
collection-level approvals from the Mint address. It is seeded at collection
creation with `mintEscrowCoinsToTransfer`. Funds only release through Mint
address approvals (not user-level approvals). This enables the quest/bounty
pattern: depositing a reward up-front, then releasing it when a user satisfies
the approval criteria.

Source: [BADGE transfers in approval criteria](https://docs.bitbadges.io/token-standard/learn/approval-criteria/usdbadge-transfers.md),
[Minting and circulating supply](https://docs.bitbadges.io/token-standard/learn/minting-and-circulating-supply.md)

### 4.4 The agent USDC-vault pattern (documented directly for agents)

The docs include a tutorial titled **"E2E: AI Agent with USDC Vault"** (URL slug
`openclaw-vault-tutorial`) that directly describes how an AI agent manages a
USDC-backed vault. It names OpenClaw only as *one example framework* ("e.g.,
OpenClaw or any framework"), not as a requirement. The flow:

1. Create a smart token collection with USDC backing + custom approval rules
   (daily spending caps, recipient whitelists, time gates).
2. The agent holds a Cosmos or EVM keypair, funded with $BADGE for gas.
3. USDC deposited into the backing address → agent receives vault tokens.
4. To spend: agent sends vault tokens to backing address → USDC releases to
   the designated recipient. Protocol enforces the approval rules on this
   withdrawal.
5. Agent tools: `checkBalance`, `withdraw`, `getVaultRules` — wrapping the
   `bb` CLI or SDK calls.

The vault's rules live in `collectionApprovals` and are "protocol-enforced and
non-bypassable" — the agent code cannot circumvent them even if compromised.

Source: [E2E: AI Agent with USDC Vault](https://docs.bitbadges.io/for-developers/ai-agents/openclaw-vault-tutorial.md),
[Agent spending authorization](https://docs.bitbadges.io/for-developers/ai-agents/agent-spending-authorization.md)

---

## 5. Payments

### 5.1 Coin transfers on approvals

Every approval can attach a `coinTransfers` clause that executes automatically
when the approval is used. This is how payments are baked into token transfers:
approve a transfer, pay the designated address. The `overrideFromWithApproverAddress`
flag routes the payment from the approver rather than the initiator.

### 5.2 Payment-request standard

The **PaymentRequest** skill implements a collection-based payment-request
mechanism (inverse of Bounty — no escrow):

- 1 token ID acts as the approval vehicle.
- 2 collection-level approvals: **Pay** (payer signs → coins auto-debit from
  payer's wallet to requester) and **Deny** (payer rejects, no funds move).
- Both approvals are gated to the specific payer via `initiatedByListId` and
  share a time window ending at request expiration.
- `overrideFromWithApproverAddress: false` routes payment origin to the
  initiator (the payer themselves).
- No separate expiry transaction needed; time windows enforce implicit expiration.

This is an on-chain invoice/request-for-payment, not a streaming payment or
subscription. Settlement is a single `MsgTransferTokens` call from the payer.

Source: [Payment-request skill](https://docs.bitbadges.io/token-standard/skills/payment-request.md)

### 5.3 Payment protocol (escrow-based)

For multi-party flows with hold-and-release semantics, the **Payment Protocol**
skill uses smart token escrow:

- **Approach 1 (coinTransfer-based):** Immediate one-shot payments via
  `coinTransfers` in collection approvals. Good for simple invoices.
- **Approach 2 (smart token escrow):** Parties back IBC coins into the token;
  conditional release approvals control fund movement; timeout/refund approvals
  handle fallback. The docs recommend defaulting to Approach 2 unless the
  request is clearly a one-shot payment.

Approval logic effectively implements conditional branching: "all approvals are
OR logic — any approval can be satisfied as long as its criteria match."
Mutual exclusion comes from balance depletion (once one approval fires and
depletes the balance, others become unfireable).

Source: [Payment protocol skill](https://docs.bitbadges.io/token-standard/skills/payment-protocol.md)

### 5.4 Credit tokens (prepaid pools)

The **Credit Token** skill models a prepaid credit pool:

- Users pay IBC coins at mint time → receive non-transferable (soulbound)
  collection tokens representing credits.
- Tokens are increment-only; no redemption, no transfer, no burn.
- On-chain balance = `totalCreditsPaidFor`; backend tracks usage (`totalUsed`);
  remaining = balance minus usage.
- Example: BitBadges API credits — 10 USDC → 1,000,000 APITOKEN on-chain.

This is a simple prepaid-budget primitive without protocol-level enforcement of
the usage (the enforcement is in the backend, not on-chain).

Source: [Credit token skill](https://docs.bitbadges.io/token-standard/skills/credit-token.md)

---

## 6. DynamicStore — on-chain allowlists

A **DynamicStore** is an on-chain `address -> boolean` mapping controlled by
whoever creates it. Two variants:

**On-chain dynamic stores** (via `MsgCreateDynamicStore`):
- Created on-chain; returns a unique store ID.
- Fields at creation: `defaultValue` (boolean initial state for any address),
  optional `uri` (metadata pointer), optional `customData` (arbitrary JSON).
- Values updated via `MsgSetDynamicStoreValue`.
- Used in approval criteria via `dynamicStoreChallenges`: the approval checks
  the initiator's (or sender's / recipient's / hardcoded address's) value in
  the store. If the store's `globalEnabled` is false, all dependent approvals
  fail immediately (kill switch). Otherwise it looks up the address's boolean
  and passes or fails the transfer accordingly.
- All challenges must pass; any false blocks the transfer.

**Off-chain dynamic stores** (via the Claims API):
- Managed via HTTP API with a `dataSecret` for authentication; 1-2 second
  propagation delay.
- Used only in off-chain claim contexts (the `whitelist` plugin), not in
  on-chain approval criteria.
- `publicUseInClaims: true` lets any claim reference the store without the
  secret.

Use cases: sanctions lists (kill switch via `globalEnabled`), membership
registries, subscription validity checks, protocol-level circuit breakers.

Source: [Dynamic store creation](https://docs.bitbadges.io/token-standard/messages/msg-create-dynamic-store.md),
[Dynamic store challenges](https://docs.bitbadges.io/token-standard/learn/approval-criteria/dynamic-store-challenges.md),
[Claims dynamic stores](https://docs.bitbadges.io/for-developers/claims/dynamic-stores.md)

---

## 7. Cross-chain / IBC

### 7.1 The two-zone architecture

BitBadges operates two distinct zones on the same chain:

**Open zone**: vanilla Cosmos SDK behavior — standard `sdk.Coin` denominations,
public bank module, standard staking, vanilla IBC. No compliance gates. Behaves
like any Cosmos chain.

**Compliance zone**: `x/tokenization` collections under the approval engine.
All transfers, swaps, and IBC hops within this zone are subject to issuer-
configured rules checked at the protocol level.

The zones coexist on the same chain. A USDC IBC coin lives in the open zone;
a USDC-backed smart token lives in the compliance zone. Cross-zone movement
requires explicit wrapping/unwrapping through the approval engine.

Source: [Compliance zone architecture](https://docs.bitbadges.io/overview/compliance-zone-architecture.md)

### 7.2 Cross-chain token movement

Tokenized assets moving cross-chain follow this pattern:

1. **Exit the source silo** — unback/unwrap through the approval engine,
   triggering issuer exit rules. Result: standard `sdk.Coin`.
2. **Travel over vanilla ICS-20** — normal IBC transfer, no custom channels
   required.
3. **Re-enter at destination** — enter the destination chain's silo through
   its own approval/wrapping mechanism.

This mirrors depository models in traditional finance: assets encounter
independent regulatory frameworks at each border crossing. The compliance zone
is siloed — "tokenization tokens can't travel over vanilla IBC" directly;
they must exit first.

### 7.3 Cross-zone connectors on-chain

Within a single BitBadges chain instance:
- **CosmosCoinBackedPath / CosmosCoinWrapperPath** — conversion between tokens
  and native coins.
- **x/gamm pool swaps** — AMM exchanges between `sdk.Coin` and tokenization
  assets, subject to approval gates.
- **coinTransfer clauses** — move sdk.Coins alongside tokenization transfers
  (fees, payouts, settlement).
- **IBC transfer hook** — incoming IBC packets can trigger minting directly
  into a collection.

### 7.4 Additional modules

The docs also list:
- **x/ibc-rate-limit** — rate-limiting on IBC transfers.
- **x/custom-ibc-hooks** — custom logic on incoming IBC packets.
- **x/managersplitter** — split manager authority across multiple addresses.

Source: [Compliance zone architecture](https://docs.bitbadges.io/overview/compliance-zone-architecture.md),
[IBC backed minting](https://docs.bitbadges.io/token-standard/learn/ibc-backed-minting.md)

---

## 8. Standards

BitBadges defines named **standards** declared in a collection's `standards`
field via `MsgSetStandards`. Standards signal compatibility to indexers, UIs,
and other agents without re-parsing the full approval structure. Documented
standards (via the skills system — each skill maps to a standard):

| Standard / Skill | What it provides |
|---|---|
| **BB-402** | HTTP 402-gated badge ownership for pay-per-call access |
| **PaymentRequest** | On-chain invoice — payer approves or denies in one tx |
| **PaymentProtocol** | Escrow-based multi-party payment flows |
| **SmartToken** | IBC-backed 1:1 escrow vault |
| **Subscription** | Time-bounded renewable token ownership |
| **CreditToken** | Prepaid increment-only credit pool |
| **NFTCollection** | Standard NFT semantics |
| **FungibleToken** | Fungible token semantics |
| **Bounty** | Reward pool released on condition |
| **Auction** | Timed bidding with winning-bid settlement |
| **PredictionMarket** | Binary outcome resolution |
| **Quest** | Task-completion badge with optional coin reward |
| **Tradable** | Peer-to-peer transferable with royalties |
| **Burnable** | Holder can burn tokens |
| **Immutability** | Signals all permissions are locked |
| **Multi-sig voting** | Voting-challenge-gated approvals |
| **ProductCatalog** | Agent-discoverable product listings |

The `Subscriptions` standard is particularly relevant: time-bounded ownership
windows expire automatically. Each renewal mints a new ownership window; the
chain auto-deletes expired tokens. Duration examples: daily (86,400,000 ms),
monthly (2,592,000,000 ms), annual (31,536,000,000 ms).

Source: [Skills overview](https://docs.bitbadges.io/token-standard/skills.md),
[Subscription](https://docs.bitbadges.io/token-standard/skills/subscription.md),
[BB-402 overview](https://docs.bitbadges.io/token-standard/bb-402/overview.md)

---

## 9. BB-402 — BitBadges' native x402 analog

BB-402 is the protocol most directly relevant to vellum's x402 differentiator.
It is a **documented, implemented standard with its own spec page and middleware
recipes** — not a proposed future feature.

### 9.1 How it works

Three-step flow for a protected HTTP endpoint:

1. **Initial request (no auth):** client calls `GET /api/resource` without
   credentials.
2. **402 challenge:** server responds HTTP 402 with:
   ```json
   {
     "version": "1",
     "ownershipRequirements": { "tokens": [...] },
     "message": "{\"nonce\":\"...\",\"timestamp\":...,\"domain\":\"...\",\"method\":\"GET\",\"path\":\"/api/resource\"}"
   }
   ```
3. **Proof submission:** client signs the message with its private key and
   retries with header:
   ```
   X-BB-Proof: <base64({ address, chain, message, signature })>
   ```
4. **Server verification:** validate signature, check on-chain token balances
   via BitBadges API, return `200 OK` (access granted) or `403 Forbidden`
   (valid identity, insufficient tokens).

The `message` field includes nonce (single-use, 60-second TTL), timestamp,
domain, HTTP method, and path — all server-controlled for replay protection.
HTTPS required.

### 9.2 Ownership requirements

The `ownershipRequirements` field uses a recursive `AccessCondition` type:

```json
{ "$and": [
    { "tokens": [{ "chain": "BitBadges", "collectionId": "42",
                   "tokenIds": [{"start":"1","end":"1"}],
                   "mustOwnAmounts": {"start":"1","end":"10000000000"} }] },
    { "$not": [{ "tokens": [{ "collectionId": "99", ... }] }] }
]}
```

Supported: `$and`, `$or`, boolean combinators, arbitrary nesting. A
`mustOwnAmounts` of `{start:0, end:0}` means "must NOT own" (blocklist).

Supported chains for ownership verification: **BitBadges, Ethereum, Polygon,
Solana** — not just BitBadges tokens.

### 9.3 Token as payment receipt

The canonical pay-per-call pattern: a soulbound (non-transferable) token in a
collection costs X USDC to mint. The token persists in the payer's wallet and
is re-used for every subsequent authenticated request. The token IS the on-chain
receipt. No per-call payment required after the initial mint — BB-402 is a
**paid access token** model, not a per-request USDC transfer model.

For per-call billing (credits), combine BB-402 with the Credit Token standard:
gate access on owning a credit token, decrement credits via an on-chain transfer
on each call.

### 9.4 Middleware recipes

The docs provide server-side implementation patterns (Node/TypeScript):
- Generate nonces with 60-second TTL; single-use (delete after validation).
- Cosmos signature: `@cosmjs/crypto`, `@cosmjs/encoding`, `@cosmjs/amino` —
  verify Secp256k1 via ADR-036.
- EVM signature: `ethers.verifyMessage()` — recover signer address via EIP-191.
- Ownership check: call BitBadges API endpoint with address + `AccessCondition`.

Source: [BB-402 overview](https://docs.bitbadges.io/token-standard/bb-402/overview.md),
[BB-402 spec](https://docs.bitbadges.io/token-standard/bb-402/spec.md),
[BB-402 middleware recipes](https://docs.bitbadges.io/token-standard/bb-402/middleware-recipes.md)

---

## 10. Mapping to our differentiators

| Our differentiator | BitBadges primitive | Fit | Notes |
|---|---|---|---|
| **Token budgets** — scoped, capped, time-boxed spend granted to agents | Approval engine: `maxNumTransfers` + `approvalAmounts` per address, `ResetTimeIntervals` for rolling windows, `transferTimes` for windows. Encoded in a collection-level approval on a "budget token" collection. | **Strong** | This is exactly what the approval engine was built for. Per-address caps, daily/weekly resets, and time-gated windows are all native fields. Protocol-enforced, not app-layer promises. |
| **Agent vaults** — a funded, policy-controlled vault per persona | Smart token (IBC-backed USDC): backing address holds USDC, agent holds vault tokens, unbacking approval encodes the spend policy. OpenClaw vault tutorial is a direct implementation guide. | **Strong** | First-class documented pattern. Withdrawal rules (daily cap, recipient whitelist, 2FA threshold) live in `collectionApprovals`. USDC is the denominated asset. Gas costs ubadge. |
| **BB-402 / pay-per-call** — pay for a resource, receive a receipt/access token | BB-402 protocol: HTTP 402 challenge, X-BB-Proof signed response, on-chain token ownership as access. Token IS the receipt. Works cross-chain (ETH, Solana, Polygon also valid for ownership checks). | **Strong** | Native, documented, spec'd. The token-as-receipt model is cleaner than x402's per-call USDC transfer: pay once to mint, prove ownership on every call. Middleware recipes exist. |
| **Agentic payments / agent-to-agent** — agent wallets transact with one another | MsgTransferTokens between agent `bb1` wallets; coinTransfer clauses for USDC alongside token transfers; PaymentRequest standard for agent-to-agent invoicing. `initiatedByListId` scopes who can initiate. | **Partial** | Token-to-token and badge-to-badge transfers are native. Direct USDC transfer between agent wallets goes through the open-zone bank module (standard Cosmos bank send) — straightforward but not through the approval engine. The PaymentRequest pattern (on-chain invoice) is elegant for larger structured payments but adds a round-trip vs a direct send. |
| **Per-persona budgets** — separate vault and budget per compartment | Two strategies: (A) one wallet per persona (separate `bb keys add`), each with its own vault collection and budget approvals; or (B) one wallet with per-persona sub-approvals scoped by `initiatedByListId` or token ID ranges. | **Partial** | Strategy A (one wallet per persona) is cleaner and maps directly to the compartmentalization thesis — each persona is a distinct on-chain identity. Strategy B requires more approval engineering. The docs do not explicitly address multi-persona wallet patterns; this would be designed, not off-the-shelf. |
| **Cost accounting / transparency** — auditable ledger of what was spent | Every transfer creates a permanent blockchain record: timestamp, approval ID, amounts, sender, recipient. The `bb` CLI and BitBadges API expose these as queryable structured data. Approval tracker state (`numTransfers`, `amounts`) is queryable on-chain. | **Partial** | The raw data is there. A readable ledger UI that aggregates across collections and frames it in dollar terms is not off-the-shelf — vellum would build that presentation layer on top of chain queries. |

### Assessment summary

The approval engine is a strong fit for **token budgets** and **agent vaults**
— these are the primary design intent of the standard. BB-402 is a direct
replacement for x402 with a cleaner "token as receipt" model. Agentic payments
work but USDC transfers between agent wallets use the open-zone bank module
(standard Cosmos semantics), not the approval engine. Per-persona budgets
require architectural choice (one-wallet-per-persona is cleanest). The cost
ledger is raw data on-chain; the UI layer is vellum's responsibility.

---

## 11. Feasibility for a 2-3 day build

### What's achievable on testnet via the `bb` CLI and SDK

**Solid for the timebox:**

- **Agent wallet creation**: `bb keys add agent-wallet` in 10 seconds. `BitBadgesSigningClient.fromPrivateKey()` for headless signing.
- **Spending authorization pattern**: Create a collection with `maxNumTransfers`
  per-address caps and `transferTimes` windows. Encode a persona's budget as a
  collection-level approval. Revoke by removing the approval in a single tx.
  This is `MsgSetCollectionApprovals` — one SDK call.
- **BB-402 middleware**: The spec and middleware recipes are documented with
  code. A working Express/Hono middleware for badge-gated endpoints is a few
  hours of work, not days.
- **PaymentRequest demo**: Create an on-chain invoice between two agent wallets.
  The approver signs; coins move. A concrete, demoable "agent A pays agent B"
  flow.

**Heavier (scope carefully):**

- **USDC smart token vault**: Creating and funding an IBC-backed USDC vault
  requires: bridging USDC to the chain (Noble IBC path), deploying the
  collection with a cosmosCoinBackedPath invariant, funding the backing address,
  and then spending from it. Each step is documented but it is multiple
  transactions and bridge dependencies. Realistic for a demo; the USDC bridge
  step is the biggest unknown for testnet (testnet faucet is offline as of April
  2026; mainnet "chaosnet" mode with worthless CHAOS tokens is the current
  testing path per the docs).
- **Per-persona wallet management**: Generating N wallets, managing their
  private keys, wiring each to a separate collection is mechanical but adds
  surface area. A single-wallet multi-persona approximation using sub-approvals
  is simpler for a 2-3 day build.
- **Cost ledger UI**: Not heavy in isolation but time competes with wallet/vault
  plumbing.

**Testnet note**: The testnet faucet is offline (as of April 25, 2026 per the
docs). The docs suggest using mainnet in "chaosnet" mode with CHAOS tokens for
testing. Confirm current testnet status before planning a testnet-only demo.

---

## 12. Open questions and risks

1. **Testnet status**: Faucet offline as of April 2026. The docs suggest using
   mainnet chaosnet mode. Confirm whether the USDC (Noble) IBC path is live on
   whichever environment we use for the demo, or whether CHAOS tokens suffice
   for the vault demo.

2. **`bb tx bank send` syntax**: The docs focus heavily on `bb tx tokenization
   ...` commands. Standard Cosmos bank sends (plain BADGE or USDC between
   wallets) follow the standard Cosmos SDK `bank` module syntax but no concrete
   example appears in the docs. This is almost certainly `bb tx bank send
   <to_addr> <amount>ubadge --from agent-wallet --fees ...` but should be
   verified against the actual binary before relying on it.

3. **Per-persona wallet topology vs. sub-approvals**: The docs do not discuss
   multi-persona agent patterns directly. The "one wallet per persona" approach
   (separate `bb keys add` per persona) is architecturally clean and maps to
   the compartmentalization thesis, but increases key management complexity.
   Sub-approvals from one wallet (using `initiatedByListId` to scope to a
   persona) are simpler operationally but weaker isolation. This is a design
   decision, not a gap in the docs.

4. **Who holds the vault manager key**: The smart token vault's collection
   manager key controls approval updates. For the agent vault pattern, this is
   the human principal's key (not the agent's key). The agent's wallet only
   holds vault tokens and triggers withdrawals. The docs describe this
   correctly, but the UX of "who holds the collection manager key and how do
   they update rules" is not spelled out for the agent case.

5. **EVM vs. Cosmos adapter for agent wallets**: The same mnemonic produces
   different `bb1` addresses depending on which adapter (EVM: coin type 60;
   Cosmos: coin type 118). The docs warn about this. For a headless agent, pick
   one adapter and be consistent. The EVM adapter is explicitly recommended for
   bots/agents by the docs.

6. **USDC IBC path details**: The docs confirm USDC from Noble is supported with
   6 decimals. The exact IBC channel ID and bridge path for depositing USDC into
   a backing address is not detailed in the pages reviewed. This would need
   verification via the explorer or BitBadges Discord before building the vault
   demo.

7. **BB-402 vs. direct coinTransfer**: For pay-per-call where every call costs
   money (not a prepaid access token), the Credit Token + BB-402 combination is
   the documented pattern. This requires two collections (one for access, one for
   credits) and an off-chain decrement. A simpler "pay per call via direct
   coinTransfer in approval" is possible but loses the receipt/audit trail
   that BB-402 provides. Worth deciding which model fits our demo scenario.

---

## Sources

All pages fetched directly from docs.bitbadges.io on 2026-05-26.

- [BitBadges overview](https://docs.bitbadges.io/overview/readme.md)
- [x/tokenization module](https://docs.bitbadges.io/token-standard/x-tokenization.md)
- [Compliance zone architecture](https://docs.bitbadges.io/overview/compliance-zone-architecture.md)
- [BADGE token](https://docs.bitbadges.io/overview/badge.md)
- [Supported denominations](https://docs.bitbadges.io/for-developers/bitbadges-blockchain/supported-denoms.md)
- [Blockchain overview (address model, endpoints)](https://docs.bitbadges.io/for-developers/bitbadges-blockchain/overview.md)
- [EVM RPC endpoints](https://docs.bitbadges.io/for-developers/bitbadges-blockchain/evm-rpc-endpoints.md)
- [Address conversions](https://docs.bitbadges.io/for-developers/bitbadges-sdk/common-snippets/address-conversions.md)
- [CLI installation](https://docs.bitbadges.io/for-developers/cli/installation.md)
- [CLI overview](https://docs.bitbadges.io/for-developers/cli.md)
- [CLI for AI agents](https://docs.bitbadges.io/for-developers/cli/for-ai-agents.md)
- [CLI chain commands](https://docs.bitbadges.io/for-developers/cli/chain-commands.md)
- [CLI tx commands](https://docs.bitbadges.io/for-developers/cli/tx-commands.md)
- [Create and broadcast txs — chain CLI](https://docs.bitbadges.io/for-developers/create-and-broadcast-txs/chain-cli.md)
- [BitBadgesSigningClient](https://docs.bitbadges.io/for-developers/create-and-broadcast-txs/signing-client.md)
- [Transferability (three approval levels)](https://docs.bitbadges.io/token-standard/learn/transferability.md)
- [Approval criteria overview](https://docs.bitbadges.io/token-standard/learn/approval-criteria.md)
- [Approval trackers](https://docs.bitbadges.io/token-standard/learn/approval-criteria/approval-trackers.md)
- [Max number of transfers](https://docs.bitbadges.io/token-standard/learn/approval-criteria/max-number-of-transfers.md)
- [BADGE transfers in approval criteria](https://docs.bitbadges.io/token-standard/learn/approval-criteria/usdbadge-transfers.md)
- [Badge/token ownership requirements](https://docs.bitbadges.io/token-standard/learn/approval-criteria/badge-ownership.md)
- [Predetermined balances](https://docs.bitbadges.io/token-standard/learn/approval-criteria/predetermined-balances.md)
- [Dynamic store challenges](https://docs.bitbadges.io/token-standard/learn/approval-criteria/dynamic-store-challenges.md)
- [Minting and circulating supply](https://docs.bitbadges.io/token-standard/learn/minting-and-circulating-supply.md)
- [IBC-backed minting](https://docs.bitbadges.io/token-standard/learn/ibc-backed-minting.md)
- [Cosmos coin wrapper paths](https://docs.bitbadges.io/token-standard/learn/cosmos-coin-wrapper-paths.md)
- [MsgCreateDynamicStore](https://docs.bitbadges.io/token-standard/messages/msg-create-dynamic-store.md)
- [Claims dynamic stores](https://docs.bitbadges.io/for-developers/claims/dynamic-stores.md)
- [BB-402 overview](https://docs.bitbadges.io/token-standard/bb-402/overview.md)
- [BB-402 spec](https://docs.bitbadges.io/token-standard/bb-402/spec.md)
- [BB-402 middleware recipes](https://docs.bitbadges.io/token-standard/bb-402/middleware-recipes.md)
- [BB-402 skill](https://docs.bitbadges.io/token-standard/skills/bb-402.md)
- [Smart token skill](https://docs.bitbadges.io/token-standard/skills/smart-token.md)
- [Payment-request skill](https://docs.bitbadges.io/token-standard/skills/payment-request.md)
- [Payment protocol skill](https://docs.bitbadges.io/token-standard/skills/payment-protocol.md)
- [Credit token skill](https://docs.bitbadges.io/token-standard/skills/credit-token.md)
- [Subscription skill](https://docs.bitbadges.io/token-standard/skills/subscription.md)
- [Skills overview](https://docs.bitbadges.io/token-standard/skills.md)
- [Agent spending authorization](https://docs.bitbadges.io/for-developers/ai-agents/agent-spending-authorization.md)
- [E2E: AI Agent with USDC Vault](https://docs.bitbadges.io/for-developers/ai-agents/openclaw-vault-tutorial.md)
- [Programmatic agent](https://docs.bitbadges.io/for-developers/ai-agents/programmatic-agent.md)
- [Claims for agents](https://docs.bitbadges.io/for-developers/ai-agents/claims-for-agents.md)
- [Testnet faucet](https://docs.bitbadges.io/for-developers/ai-agents/testnet-faucet.md)
- [Documentation sitemap](https://docs.bitbadges.io/sitemap.md)
