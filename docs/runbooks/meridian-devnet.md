---
title: Meridian devnet — access & chain ops
last-verified: 2026-05-26
---

# Meridian devnet — access & chain ops

The chain environment for vellum-project is the **Meridian devnet**: a standalone
`bitbadges-1` Cosmos SDK chain running on the founder's DigitalOcean droplet
(also home to the Meridian prediction-markets app). We use it instead of the
public BitBadges testnet (whose faucet is offline).

## Endpoints

| Surface | URL |
|---|---|
| Tendermint RPC | `https://rpc.meridian.trevormil.com` |
| Cosmos LCD (REST) | `https://lcd.meridian.trevormil.com` |
| Aggregator API | `https://api.meridian.trevormil.com` |
| Web (Meridian app) | `https://meridian.trevormil.com` |
| Droplet (SSH) | `root@198.199.70.29` (nyc1) |
| Chain ID | `bitbadges-1` |

No EVM JSON-RPC endpoint is exposed → use the **Cosmos signing path**
(`bitbadgeschaind` / cosmjs / the `bitbadges` SDK Cosmos adapter).

## SSH access

A harness-dedicated ed25519 key lives at `~/.meridian-ssh/id_ed25519` (private
key never committed). Its public half is in the droplet's
`/root/.ssh/authorized_keys`. There is **no `meridian` ssh alias** — connect by
IP. Use the helper:

```bash
bin/meridian-ssh 'bitbadgeschaind status'           # run a remote command
bin/meridian-ssh                                     # interactive shell
```

To re-authorize the key on a fresh droplet (the public key):
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGrMiM8ysAaHafn0ubQRVsNxvMglnmdpgkSkHok8Fyvy harness-meridian-20260526
```
Append it to `/root/.ssh/authorized_keys` via the DigitalOcean web console.

## Funded signer: `alice`

The droplet keyring (`--keyring-backend test`) holds dev accounts
`alice / burn / charlie / zero`. **`alice` is the funded, non-important signer**
we use:

- Address: `bb1t84pw50zw4wt0redc8w9w7w0mndnvvm00egur0`
- Holdings (2026-05-26): `ubadge` ~1e17 (gas), three `ibc/...` USDC-like denoms
  @ 1e11 (vault backing material), `badges:49:chaosnet` 1e15.

`burn`/`charlie` hold ~1 `ubadge` (dust); `zero` is empty.

### Two ways the agent can sign

1. **Remote (quick, dev):** shell out via `bin/meridian-ssh` and sign on the
   droplet with the keyring:
   ```bash
   bin/meridian-ssh 'bitbadgeschaind tx <module> <cmd> ... \
     --from alice --keyring-backend test --chain-id bitbadges-1 \
     --gas auto --gas-adjustment 1.5 --fees 10000ubadge -y'
   ```
2. **Local (clean, for the app):** export alice's key once and sign locally with
   the `bitbadges` SDK / cosmjs, broadcasting to the public RPC. Export (prompts
   for a `yes`):
   ```bash
   bin/meridian-ssh 'bitbadgeschaind keys export alice --unarmored-hex --unsafe --keyring-backend test'
   ```
   Load the hex priv key into the agent via an env var (NEVER commit it).

## Common reads (no SSH needed — public LCD/RPC)

```bash
# Chain status / height
curl -s https://rpc.meridian.trevormil.com/status | python3 -m json.tool

# Account balances
curl -s https://lcd.meridian.trevormil.com/cosmos/bank/v1beta1/balances/<bb1addr>

# Latest block
curl -s https://lcd.meridian.trevormil.com/cosmos/base/tendermint/v1beta1/blocks/latest
```

## Notes / gotchas

- The droplet also runs the Meridian app (aggregator, web, daily MAG7 market
  crons). **Don't disrupt it** — we only need the chain. Treat the box as shared.
- `bitbadgeschaind` runs under systemd (`bitbadgeschain.service`); chain data at
  `/root/.bitbadgeschain`.
- Transfer-times on chain are in **milliseconds**.
- Sensitive Meridian mnemonics (oracle/faucet/bot) are at
  `/etc/meridian/fixtures/` — leave them alone; use `alice` for our work.
