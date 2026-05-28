import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button, Icon, Input } from "@vellum/ui";
import { api, type PaymentRequest } from "./api.ts";
import { BrandLogo } from "./BrandLogo.tsx";
import { bankSendMsg, loadConfig, signAndBroadcast } from "./keplr.ts";
import { useWallet } from "./wallet-context.tsx";

// Section label — mono, gold-soft, wide tracking (the terminal-luxe motif).
const Label = ({ children }: { children: ReactNode }) => (
  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-soft">
    {children}
  </div>
);

const fmtUsdc = (base: string) =>
  (Number(base) / 1e6).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// Shows the persona's bb1 wallet + live USDC balance, with a devnet faucet tap.
// Vellum is single-asset (USDC); agent-initiated funding (PaymentRequests) is 0014.
export function WalletPanel({ personaId }: { personaId: string }) {
  const [address, setAddress] = useState("");
  const [usdc, setUsdc] = useState("0");
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reqVersion, setReqVersion] = useState(0);
  const bumpRequests = useCallback(() => setReqVersion((v) => v + 1), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const w = await api.wallet(personaId);
      setAddress(w.address);
      setUsdc(w.usdc);
    } finally {
      setLoading(false);
    }
  }, [personaId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function claim() {
    setClaiming(true);
    setError(null);
    try {
      await api.faucet(personaId);
      // Faucet settles on-chain shortly; refresh after a beat.
      await new Promise((r) => setTimeout(r, 1500));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setClaiming(false);
    }
  }

  function copy() {
    navigator.clipboard?.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="w-72 shrink-0 border-l border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-serif text-base">
          <Icon name="wallet" size={15} className="text-accent" /> Wallet
        </h3>
        <button
          onClick={refresh}
          className="text-soft transition-colors hover:text-accent"
          title="Refresh balance"
        >
          <Icon name="refresh" size={14} />
        </button>
      </div>

      <div className="mt-4 flex items-center gap-1.5">
        <BrandLogo name="bitbadges" size={11} /> <Label>bb1 address</Label>
      </div>
      <button
        onClick={copy}
        className="mt-1 flex w-full items-center gap-2 rounded-lg border border-border bg-surface-3 px-2.5 py-2 text-left font-mono text-xs text-muted transition-colors hover:border-border-gold hover:text-fg"
        title="Copy address"
      >
        <span className="truncate">{address || "…"}</span>
        <Icon name={copied ? "check" : "copy"} size={13} />
      </button>

      <div className="mt-5">
        <Label>Balance</Label>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <BrandLogo name="usdc" size={26} />
        <span className="font-mono text-3xl leading-none text-accent">
          {loading ? "…" : fmtUsdc(usdc)}
        </span>
        <span className="self-end pb-0.5 font-mono text-xs text-soft">
          USDC
        </span>
      </div>

      <Button
        variant="secondary"
        size="sm"
        className="mt-3 w-full"
        onClick={claim}
        disabled={claiming}
      >
        <Icon name="plus" size={14} />{" "}
        {claiming ? "Claiming…" : "Claim 10 USDC (devnet)"}
      </Button>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {address && (
        <>
          <FundActions
            personaId={personaId}
            personaAddress={address}
            onFunded={refresh}
            onRequested={bumpRequests}
          />
          <PendingRequests
            personaId={personaId}
            version={reqVersion}
            onChange={bumpRequests}
            onFunded={refresh}
          />
        </>
      )}
    </div>
  );
}

// Human-signed funding (0027 + 0014): fund this persona directly from the
// connected Keplr wallet, or raise a payment request (it appears in the pending
// list below — pay it inline or share its /pay link). The agent never pulls funds.
function FundActions({
  personaId,
  personaAddress,
  onFunded,
  onRequested,
}: {
  personaId: string;
  personaAddress: string;
  onFunded: () => void;
  onRequested: () => void;
}) {
  const { wallet } = useWallet();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"fund" | "request" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fundFromKeplr() {
    const usd = Number(amount);
    if (!usd || !wallet) return;
    setBusy("fund");
    setError(null);
    setNote(null);
    try {
      const { denom } = await loadConfig();
      const micro = String(Math.round(usd * 1e6));
      const txHash = await signAndBroadcast(
        [bankSendMsg(wallet.address, personaAddress, micro, denom)],
        `fund ${personaId}`,
      );
      setNote(`Sent ${usd} USDC (${txHash.slice(0, 10)}…)`);
      setAmount("");
      onFunded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function requestFunds() {
    const usd = Number(amount);
    if (!usd) return;
    setBusy("request");
    setError(null);
    setNote(null);
    try {
      await api.createPaymentRequest(personaId, { amountUsdc: usd });
      setAmount("");
      onRequested();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-5 border-t border-border pt-4">
      <Label>Fund</Label>
      <Input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount (USDC)"
        className="mt-1"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={fundFromKeplr}
          disabled={!wallet || !amount || busy !== null}
          title={wallet ? "Send from your Keplr wallet" : "Connect Keplr first"}
        >
          {busy === "fund" ? "Signing…" : "From my wallet"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={requestFunds}
          disabled={!amount || busy !== null}
        >
          <Icon name="link" size={13} /> {busy === "request" ? "…" : "Request"}
        </Button>
      </div>
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <p className="mt-3 text-xs leading-relaxed text-soft">
        “From my wallet” signs with Keplr (your address). “Request” raises a
        payment request you can pay inline below or share as a link.
      </p>
    </div>
  );
}

// Full UX for this persona's outstanding payment requests (0014). Each can be
// paid inline (Keplr, no page nav), shared as a /pay link, or dismissed. Filled
// requests disappear — the server deletes them once the funding is in the ledger.
function PendingRequests({
  personaId,
  version,
  onChange,
  onFunded,
}: {
  personaId: string;
  version: number;
  onChange: () => void;
  onFunded: () => void;
}) {
  const { wallet } = useWallet();
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .listPaymentRequests(personaId)
      .then(setRequests)
      .catch(() => {});
  }, [personaId, version]);

  async function pay(req: PaymentRequest) {
    if (!wallet) return;
    setBusyId(req.id);
    setError(null);
    try {
      const txHash = await signAndBroadcast(
        [bankSendMsg(wallet.address, req.toAddress, req.amount, req.denom)],
        `payment request ${req.id.slice(0, 8)}`,
      );
      await api.confirmPaymentRequest(req.id, txHash);
      onChange();
      onFunded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(id: string) {
    setBusyId(id);
    try {
      await api.dismissPaymentRequest(id);
      onChange();
    } finally {
      setBusyId(null);
    }
  }

  function copy(id: string) {
    navigator.clipboard?.writeText(`${window.location.origin}/pay/${id}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1200);
  }

  if (requests.length === 0) return null;

  return (
    <div className="mt-5 border-t border-border pt-4">
      <Label>Pending requests</Label>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-2 space-y-2">
        {requests.map((r) => (
          <div
            key={r.id}
            className="rounded-md border border-border bg-surface-3 p-2.5"
          >
            <div className="flex items-baseline justify-between">
              <span className="flex items-center gap-1.5 font-mono text-sm text-fg">
                <BrandLogo name="usdc" size={14} />
                {fmtUsdc(r.amount)}
              </span>
              <span className="truncate pl-2 text-[11px] text-soft">
                {r.memo}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <Button
                size="sm"
                onClick={() => pay(r)}
                disabled={!wallet || busyId !== null}
                title={wallet ? "Pay now with Keplr" : "Connect Keplr to pay"}
              >
                {busyId === r.id ? "Signing…" : "Pay"}
              </Button>
              <button
                onClick={() => copy(r.id)}
                title="Copy /pay link"
                className="grid h-7 w-7 place-items-center rounded-md border border-border text-soft hover:text-fg"
              >
                <Icon name={copiedId === r.id ? "check" : "link"} size={13} />
              </button>
              <button
                onClick={() => dismiss(r.id)}
                disabled={busyId !== null}
                title="Dismiss"
                className="grid h-7 w-7 place-items-center rounded-md border border-border text-soft hover:text-danger"
              >
                <Icon name="trash" size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
