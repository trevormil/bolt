import { useEffect, useState } from "react";
import { Badge, Button, Card, Icon, Input } from "@vellum/ui";
import { api, type Vault } from "./api.ts";

// Per-persona vaults: 1:1 USDC-backed, siloed for a purpose. The agent creates +
// withdraws within rules; the human is the manager + funds escrow.
export function VaultsView({ personaId }: { personaId: string }) {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setVaults(await api.listVaults(personaId));
  }
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);

  async function create() {
    if (!name.trim() || !symbol.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.createVault(personaId, {
        name: name.trim(),
        symbol: symbol.trim(),
        dailyWithdrawLimit: limit ? Number(limit) : undefined,
      });
      setName("");
      setSymbol("");
      setLimit("");
      setCreating(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted">
          Vaults — 1:1 USDC, agent-managed within rules
        </h3>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setCreating((v) => !v)}
        >
          <Icon name="plus" size={14} /> New vault
        </Button>
      </div>

      {creating && (
        <Card className="mb-4 space-y-3 p-4">
          <div className="grid grid-cols-3 gap-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (Groceries)"
            />
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="Symbol (vUSDC)"
            />
            <Input
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="Daily limit (USDC)"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end">
            <Button
              onClick={create}
              disabled={busy || !name.trim() || !symbol.trim()}
            >
              {busy ? "Creating on-chain…" : "Create vault"}
            </Button>
          </div>
        </Card>
      )}

      {vaults.length === 0 ? (
        <p className="text-sm text-soft">
          No vaults yet — create one to earmark USDC for a purpose.
        </p>
      ) : (
        <div className="space-y-2">
          {vaults.map((v) => (
            <VaultRow key={v.collectionId} personaId={personaId} vault={v} />
          ))}
        </div>
      )}
    </div>
  );
}

function VaultRow({ personaId, vault }: { personaId: string; vault: Vault }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function withdraw() {
    const usdc = Number(amount);
    if (!usdc) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await api.vaultWithdraw(
        personaId,
        vault.collectionId,
        String(Math.round(usdc * 1e6)),
      );
      setNote(`Withdrawal ${r.status} (${r.hash.slice(0, 10)}…)`);
      setAmount("");
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge tone="accent">{vault.symbol}</Badge>
            <span className="truncate text-sm">{vault.name}</span>
          </div>
          <div className="mt-1 font-mono text-xs text-soft">
            collection {vault.collectionId}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="USDC"
            className="w-24"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={withdraw}
            disabled={busy || !amount}
          >
            Withdraw
          </Button>
        </div>
      </div>
      {note && <div className="mt-2 text-xs text-muted">{note}</div>}
    </Card>
  );
}
