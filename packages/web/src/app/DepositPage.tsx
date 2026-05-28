import { useEffect, useState } from "react";
import { Button, Card, Icon } from "@vellum/ui";
import { api, type DepositRequest } from "./api.ts";
import { BrandLogo } from "./BrandLogo.tsx";
import { signAndBroadcast, vaultDepositMsg } from "./keplr.ts";
import { useWallet } from "./wallet-context.tsx";

const fmtUsdc = (base: string) => (Number(base) / 1e6).toFixed(2);

// Public deposit page (#62) — the funder opens a vault deposit-request link and
// signs `vaultDepositMsg` to fund the vault's escrow from their own Keplr wallet.
// The minted vault tokens go to the persona agent (who later withdraws within
// the vault's rules). Mirrors PayPage, but the on-chain action is a vault deposit
// rather than a bank send, and the confirm is a LIGHT delete-by-id (the deposit
// is the funder's own tx — no server-side credit verification).
export function DepositPage({ reqId }: { reqId: string }) {
  const { wallet, available, connecting, connect } = useWallet();
  const [req, setReq] = useState<DepositRequest | null>(null);
  const [personaName, setPersonaName] = useState("");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [funding, setFunding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .getDepositRequest(reqId)
      .then((r) => {
        setReq(r.request);
        setPersonaName(r.personaName);
      })
      // A fulfilled (or unknown) request is deleted, so its link 404s — show that
      // rather than a fundable form.
      .catch((e) => setLoadErr(e instanceof Error ? e.message : String(e)));
  }, [reqId]);

  async function fund() {
    if (!req) return;
    setFunding(true);
    setError(null);
    try {
      await signAndBroadcast(
        [
          vaultDepositMsg({
            human: wallet!.address, // signer
            agentAddress: req.agentAddress, // recipient: the persona agent
            collectionId: req.collectionId,
            backingAddress: req.backingAddress,
            amountMicro: req.amount,
          }),
        ],
        `deposit request ${req.id.slice(0, 8)}`,
      );
      // Light confirm — delete the request now that the deposit is on-chain.
      await api.confirmDepositRequest(req.id);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFunding(false);
    }
  }

  return (
    <div className="grid h-full place-items-center bg-base p-4 text-fg font-sans">
      <Card className="w-[26rem] p-6">
        <div className="flex items-center gap-2.5">
          <img
            src="/logos/bolt.png"
            alt="Bolt"
            className="h-9 w-9 rounded-lg object-cover shadow-glow"
          />
          <span className="font-serif text-xl">Bolt deposit request</span>
        </div>

        {loadErr ? (
          <p className="mt-5 text-sm text-danger">{loadErr}</p>
        ) : !req ? (
          <p className="mt-5 text-sm text-muted">Loading…</p>
        ) : done ? (
          <div className="mt-5 text-center">
            <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-accent/15 text-accent">
              <Icon name="check" size={24} />
            </span>
            <p className="text-lg">Deposited</p>
            <p className="mt-1 text-sm text-muted">
              {fmtUsdc(req.amount)} USDC funded into the {req.vaultSymbol}{" "}
              vault.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-5 text-sm text-muted">{req.memo}</p>
            <div className="mt-4 flex items-center gap-2.5">
              <BrandLogo name="usdc" size={30} />
              <span className="font-mono text-3xl text-accent">
                {fmtUsdc(req.amount)}
              </span>
              <span className="self-end pb-1 font-mono text-xs text-soft">
                USDC
              </span>
            </div>
            <div className="mt-1 text-xs text-soft">
              into {req.vaultName} ({req.vaultSymbol}) · {personaName} ·
              collection {req.collectionId}
            </div>

            {error && <p className="mt-4 text-sm text-danger">{error}</p>}

            <div className="mt-6">
              {!available ? (
                <p className="text-sm text-danger">
                  Keplr extension not detected — install it to fund.
                </p>
              ) : !wallet ? (
                <Button
                  className="w-full"
                  onClick={connect}
                  disabled={connecting}
                >
                  <BrandLogo name="keplr" size={15} className="rounded-none" />
                  {connecting ? "Connecting…" : "Connect Keplr"}
                </Button>
              ) : (
                <Button className="w-full" onClick={fund} disabled={funding}>
                  {funding
                    ? "Signing + confirming…"
                    : `Fund ${fmtUsdc(req.amount)} USDC`}
                </Button>
              )}
            </div>
            {wallet && (
              <p className="mt-2 text-center text-xs text-soft">
                from {wallet.address.slice(0, 14)}…
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
