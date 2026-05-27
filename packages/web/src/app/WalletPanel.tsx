import { useCallback, useEffect, useState } from "react";
import { Button, Icon, Input } from "@vellum/ui";
import { api } from "./api.ts";
import { bankSendMsg, loadConfig, signAndBroadcast } from "./keplr.ts";
import { useWallet } from "./wallet-context.tsx";

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
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Icon name="wallet" size={15} /> Wallet
        </h3>
        <button
          onClick={refresh}
          className="text-soft hover:text-fg"
          title="Refresh balance"
        >
          <Icon name="refresh" size={14} />
        </button>
      </div>

      <div className="mt-3 text-xs uppercase tracking-wide text-soft">
        bb1 address
      </div>
      <button
        onClick={copy}
        className="mt-1 flex w-full items-center gap-2 rounded-md border border-border bg-surface-3 px-2.5 py-2 text-left font-mono text-xs text-muted hover:text-fg"
        title="Copy address"
      >
        <span className="truncate">{address || "…"}</span>
        <Icon name={copied ? "check" : "copy"} size={13} />
      </button>

      <div className="mt-4 text-xs uppercase tracking-wide text-soft">
        Balance
      </div>
      <div className="mt-1 font-mono text-2xl text-fg">
        {loading ? "…" : fmtUsdc(usdc)}{" "}
        <span className="text-sm text-muted">USDC</span>
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
        <FundActions
          personaId={personaId}
          personaAddress={address}
          onFunded={refresh}
        />
      )}
    </div>
  );
}

// Human-signed funding (0027 + 0014): fund this persona directly from the
// connected Keplr wallet, or raise a one-time PaymentRequest link the human (or
// someone else) opens and pays.
function FundActions({
  personaId,
  personaAddress,
  onFunded,
}: {
  personaId: string;
  personaAddress: string;
  onFunded: () => void;
}) {
  const { wallet } = useWallet();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"fund" | "request" | null>(null);
  const [link, setLink] = useState<string | null>(null);
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
      const req = await api.createPaymentRequest(personaId, {
        amountUsdc: usd,
      });
      setLink(`${window.location.origin}/pay/${req.id}`);
      setAmount("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="text-xs uppercase tracking-wide text-soft">Fund</div>
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
      {link && (
        <button
          onClick={() => navigator.clipboard?.writeText(link)}
          className="mt-2 flex w-full items-center gap-2 rounded-md border border-border bg-surface-3 px-2.5 py-2 text-left font-mono text-[11px] text-muted hover:text-fg"
          title="Copy payment link"
        >
          <span className="truncate">{link}</span>
          <Icon name="copy" size={12} />
        </button>
      )}
      <p className="mt-3 text-xs leading-relaxed text-soft">
        “From my wallet” signs with Keplr (your address). “Request” makes a
        one-time link anyone can open and pay — the agent never pulls funds.
      </p>
    </div>
  );
}
