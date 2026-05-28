import { useEffect, useState } from "react";
import { Button, Card, Icon } from "@vellum/ui";
import { api, type PaymentRequest } from "./api.ts";
import { bankSendMsg, signAndBroadcast } from "./keplr.ts";
import { useWallet } from "./wallet-context.tsx";

const fmtUsdc = (base: string) => (Number(base) / 1e6).toFixed(2);

// Public pay page (0014) — the human opens a payment-request link and signs a
// USDC transfer to the persona from their own Keplr wallet. The agent never
// pulls funds; the server records the funding only after the tx is confirmed.
export function PayPage({ reqId }: { reqId: string }) {
  const { wallet, available, connecting, connect } = useWallet();
  const [req, setReq] = useState<PaymentRequest | null>(null);
  const [personaName, setPersonaName] = useState("");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .getPaymentRequest(reqId)
      .then((r) => {
        setReq(r.request);
        setPersonaName(r.personaName);
      })
      // A filled (or unknown) request is deleted, so its link 404s — show that
      // rather than a payable form.
      .catch((e) => setLoadErr(e instanceof Error ? e.message : String(e)));
  }, [reqId]);

  async function pay() {
    if (!req) return;
    setPaying(true);
    setError(null);
    try {
      const txHash = await signAndBroadcast(
        [bankSendMsg(wallet!.address, req.toAddress, req.amount, req.denom)],
        `payment request ${req.id.slice(0, 8)}`,
      );
      await api.confirmPaymentRequest(req.id, txHash);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="grid h-full place-items-center bg-base p-4 text-fg font-sans">
      <Card className="w-[26rem] p-6">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-accent text-accent-fg">
            <Icon name="wallet" size={16} />
          </span>
          <span className="font-serif text-xl">Vellum payment request</span>
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
            <p className="text-lg">Paid</p>
            <p className="mt-1 text-sm text-muted">
              {fmtUsdc(req.amount)} USDC sent to {personaName}.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-5 text-sm text-muted">{req.memo}</p>
            <div className="mt-4 font-mono text-3xl">
              {fmtUsdc(req.amount)}{" "}
              <span className="text-base text-muted">USDC</span>
            </div>
            <div className="mt-1 text-xs text-soft">
              to {personaName} · {req.toAddress.slice(0, 14)}…
            </div>

            {error && <p className="mt-4 text-sm text-danger">{error}</p>}

            <div className="mt-6">
              {!available ? (
                <p className="text-sm text-danger">
                  Keplr extension not detected — install it to pay.
                </p>
              ) : !wallet ? (
                <Button
                  className="w-full"
                  onClick={connect}
                  disabled={connecting}
                >
                  <Icon name="wallet" size={16} />{" "}
                  {connecting ? "Connecting…" : "Connect Keplr"}
                </Button>
              ) : (
                <Button className="w-full" onClick={pay} disabled={paying}>
                  {paying
                    ? "Signing + confirming…"
                    : `Pay ${fmtUsdc(req.amount)} USDC`}
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
