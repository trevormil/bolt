import { useCallback, useEffect, useState } from "react";
import { Button, Icon } from "@vellum/ui";
import { api } from "./api.ts";

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

      <p className="mt-4 text-xs leading-relaxed text-soft">
        Devnet USDC only. Agent-initiated funding (PaymentRequests) and vault
        spend arrive in 0014 / 0012-0013.
      </p>
    </div>
  );
}
