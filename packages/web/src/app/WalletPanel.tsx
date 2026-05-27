import { useCallback, useEffect, useState } from "react";
import { Button, Icon } from "@vellum/ui";
import { api, type Coin } from "./api.ts";

// Shows the persona's bb1 wallet + live balance. Funding on devnet is external
// (send to this address); PaymentRequest-style funding is a later ticket (0014).
export function WalletPanel({ personaId }: { personaId: string }) {
  const [address, setAddress] = useState<string>("");
  const [balance, setBalance] = useState<Coin[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const w = await api.wallet(personaId);
      setAddress(w.address);
      setBalance(w.balance);
    } finally {
      setLoading(false);
    }
  }, [personaId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
      <div className="mt-1">
        {loading ? (
          <div className="text-sm text-soft">loading…</div>
        ) : balance.length === 0 ? (
          <div className="text-sm text-soft">
            empty — fund this address on devnet
          </div>
        ) : (
          balance.map((c) => (
            <div key={c.denom} className="font-mono text-sm text-fg">
              {Number(c.amount).toLocaleString()}{" "}
              <span className="text-muted">{c.denom}</span>
            </div>
          ))
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-soft">
        Send {balance.length === 0 ? "" : "more "}ubadge to this address to fund{" "}
        {personaId}. Agent-initiated funding links arrive with vaults (0014).
      </p>
    </div>
  );
}
