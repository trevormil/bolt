import { useEffect, useState } from "react";
import { Badge, Button, Card, Icon, Input } from "@vellum/ui";
import { BrandLogo } from "./BrandLogo.tsx";
import { api, type Vault } from "./api.ts";
import {
  signAndBroadcast,
  vaultDepositMsg,
  managerWithdrawMsg,
  managerRevokeMsg,
} from "./keplr.ts";
import { useWallet } from "./wallet-context.tsx";

// Per-persona vaults: 1:1 USDC-backed, siloed for a purpose. The agent creates +
// withdraws within rules; the human is the manager + funds escrow.
export function VaultsView({ personaId }: { personaId: string }) {
  const [vaults, setVaults] = useState<Vault[]>([]);
  // The persona agent's own wallet address — the recipient of deposited vault
  // tokens (#45 / !37): the agent must hold them to withdraw within rules.
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  // Gating policy (#45 slice 2): amount cap per period + optional unlock date.
  const [period, setPeriod] = useState<"none" | "daily" | "weekly" | "monthly">(
    "daily",
  );
  const [limit, setLimit] = useState("");
  const [unlockDate, setUnlockDate] = useState(""); // yyyy-mm-dd
  // Multi-sig (#45 slice 3): signer bb1 addresses (one per line) + threshold.
  const [signersText, setSignersText] = useState("");
  const [threshold, setThreshold] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setVaults(await api.listVaults(personaId));
  }
  useEffect(() => {
    void reload();
    void api.wallet(personaId).then((w) => setAgentAddress(w.address));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);

  async function create() {
    if (!name.trim() || !symbol.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const gating: {
        amount?: { limitUsd: number; period: "daily" | "weekly" | "monthly" };
        time?: { unlockAt?: number };
        multisig?: { signers: { address: string }[]; threshold: number };
      } = {};
      if (period !== "none" && Number(limit) > 0)
        gating.amount = { limitUsd: Number(limit), period };
      if (unlockDate)
        gating.time = { unlockAt: new Date(unlockDate).getTime() };
      const signers = signersText
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter((s) => s.startsWith("bb1"));
      if (signers.length && Number(threshold) > 0)
        gating.multisig = {
          signers: signers.map((address) => ({ address })),
          threshold: Number(threshold),
        };
      await api.createVault(personaId, {
        name: name.trim(),
        symbol: symbol.trim(),
        gating: Object.keys(gating).length ? gating : undefined,
      });
      setName("");
      setSymbol("");
      setLimit("");
      setUnlockDate("");
      setPeriod("daily");
      setSignersText("");
      setThreshold("");
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
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-serif text-xl">
            <BrandLogo name="usdc" size={18} /> Vaults
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            1:1 USDC, agent-managed within rules
          </p>
        </div>
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
          <div className="grid grid-cols-2 gap-3">
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
          </div>
          {/* Gating policy — agent withdrawal guardrails (#45 slice 2). */}
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-wide text-soft">
              Withdrawal gating
            </span>
            <div className="grid grid-cols-3 gap-3">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as typeof period)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg"
              >
                <option value="none">No amount cap</option>
                <option value="daily">Cap / day</option>
                <option value="weekly">Cap / week</option>
                <option value="monthly">Cap / month</option>
              </select>
              <Input
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                placeholder="Cap (USDC)"
                disabled={period === "none"}
              />
              <Input
                type="date"
                value={unlockDate}
                onChange={(e) => setUnlockDate(e.target.value)}
                title="Unlock date — no withdrawals before this"
              />
            </div>
            <p className="text-[11px] text-soft">
              The agent can withdraw up to the cap per{" "}
              {period === "none" ? "—" : period}
              {unlockDate ? `, and not before ${unlockDate}` : ""}.
            </p>
          </div>
          {/* Multi-sig (#45 slice 3): withdrawals need signer sign-off. */}
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-wide text-soft">
              Multi-sig sign-off (optional)
            </span>
            <textarea
              value={signersText}
              onChange={(e) => setSignersText(e.target.value)}
              placeholder="Signer bb1… addresses, one per line (leave blank for none)"
              rows={2}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-fg"
            />
            <Input
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder="Approvals required (e.g. 2)"
              disabled={!signersText.trim()}
            />
            <p className="text-[11px] text-soft">
              If set, each withdrawal needs this many signer approvals (via a
              shareable sign-off link) before it executes.
            </p>
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
            <VaultRow
              key={v.collectionId}
              personaId={personaId}
              vault={v}
              agentAddress={agentAddress}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VaultRow({
  personaId,
  vault,
  agentAddress,
}: {
  personaId: string;
  vault: Vault;
  agentAddress: string | null;
}) {
  const { wallet } = useWallet();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<
    "withdraw" | "deposit" | "drain" | "revoke" | null
  >(null);
  const [note, setNote] = useState<string | null>(null);
  const [escrowMicro, setEscrowMicro] = useState<string | null>(null);

  // Escrow = the agent's holding of THIS vault's tokens (#45) — the correct
  // per-vault figure (all USDC vaults share one backing alias, so the agent's
  // per-collection token balance, not the shared backing, is this vault's slice).
  async function reloadEscrow() {
    try {
      const e = await api.vaultEscrow(personaId, vault.collectionId);
      setEscrowMicro(e.escrowedMicro);
    } catch {
      setEscrowMicro(null);
    }
  }
  useEffect(() => {
    void reloadEscrow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId, vault.collectionId]);

  // Agent withdraws within the vault's on-chain rule (server-signed).
  async function withdraw() {
    const usdc = Number(amount);
    if (!usdc) return;
    setBusy("withdraw");
    setNote(null);
    try {
      const r = await api.vaultWithdraw(
        personaId,
        vault.collectionId,
        String(Math.round(usdc * 1e6)),
      );
      setNote(`Withdrawal ${r.status} (${r.hash.slice(0, 10)}…)`);
      void reloadEscrow();
      setAmount("");
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  // Manager-admin (#45 slice 4): the human manager, signing from their own
  // Keplr wallet, drains or claws back the agent's escrow — overriding the
  // agent's gated approval. Only shown when the connected wallet IS the manager.
  const isManager =
    !!wallet &&
    !!vault.managerAddress &&
    wallet.address === vault.managerAddress;
  async function managerAction(kind: "drain" | "revoke") {
    if (!wallet || !agentAddress || !escrowMicro || escrowMicro === "0") return;
    setBusy(kind);
    setNote(null);
    try {
      const msg =
        kind === "drain"
          ? managerWithdrawMsg({
              manager: wallet.address,
              agentAddress,
              backingAddress: vault.backingAddress,
              collectionId: vault.collectionId,
              amountMicro: escrowMicro,
            })
          : managerRevokeMsg({
              manager: wallet.address,
              agentAddress,
              collectionId: vault.collectionId,
              amountMicro: escrowMicro,
            });
      const txHash = await signAndBroadcast(
        [msg],
        `manager ${kind} · vault ${vault.symbol}`,
      );
      setNote(
        `Manager ${kind === "drain" ? "drained" : "revoked"} (${txHash.slice(0, 10)}…)`,
      );
      void reloadEscrow();
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  // The human funds the escrow from their OWN Keplr wallet (0016) — a
  // human-signed vault action, distinct from the agent's withdrawals.
  async function deposit() {
    const usdc = Number(amount);
    if (!usdc || !wallet) return;
    if (!agentAddress) {
      setNote("agent wallet not loaded yet — try again in a moment");
      return;
    }
    setBusy("deposit");
    setNote(null);
    try {
      const txHash = await signAndBroadcast(
        [
          vaultDepositMsg({
            human: wallet.address, // signer
            agentAddress, // recipient: the persona agent, who later withdraws
            collectionId: vault.collectionId,
            backingAddress: vault.backingAddress,
            amountMicro: String(Math.round(usdc * 1e6)),
          }),
        ],
        `fund vault ${vault.symbol}`,
      );
      setNote(`Escrow funded (${txHash.slice(0, 10)}…)`);
      setAmount("");
      void reloadEscrow();
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
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
            collection {vault.collectionId} · backing{" "}
            {vault.backingAddress.slice(0, 10)}…
          </div>
          {escrowMicro !== null && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-soft">
                escrowed
              </span>
              <BrandLogo name="usdc" size={13} />
              <span className="font-mono text-fg">
                {(Number(escrowMicro) / 1e6).toFixed(2)}
              </span>
              <span className="text-soft">· agent's claim</span>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {vault.gating?.amount && (
              <Badge tone="accent">
                ≤ {vault.gating.amount.limitUsd} USDC /{" "}
                {vault.gating.amount.period}
              </Badge>
            )}
            {vault.gating?.time?.unlockAt != null && (
              <Badge tone="default">
                unlocks{" "}
                {new Date(vault.gating.time.unlockAt).toLocaleDateString()}
              </Badge>
            )}
            {vault.gating?.multisig && (
              <Badge tone="accent">
                {vault.gating.multisig.threshold}-of-
                {vault.gating.multisig.signers.length} multisig
              </Badge>
            )}
            {!vault.gating?.amount &&
              vault.gating?.time?.unlockAt == null &&
              !vault.gating?.multisig && (
                <span className="text-[11px] text-soft">no withdrawal cap</span>
              )}
          </div>
          {vault.gating?.multisig && (
            <a
              href={`/vote/${vault.collectionId}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
            >
              <Icon name="link" size={11} /> share sign-off link
            </a>
          )}
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
            onClick={deposit}
            disabled={busy !== null || !amount || !wallet}
            title={
              wallet
                ? "Fund escrow from your Keplr wallet (human-signed)"
                : "Connect Keplr to fund escrow"
            }
          >
            {busy === "deposit" ? "Signing…" : "Fund"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={withdraw}
            disabled={busy !== null || !amount}
          >
            {busy === "withdraw" ? "…" : "Withdraw"}
          </Button>
        </div>
      </div>
      {isManager && (
        <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
          <span className="text-[11px] uppercase tracking-wide text-soft">
            Manager
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => managerAction("drain")}
            disabled={busy !== null || !escrowMicro || escrowMicro === "0"}
            title="Burn the agent's vault tokens → release USDC to you (drain)"
          >
            {busy === "drain" ? "…" : "Drain"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => managerAction("revoke")}
            disabled={busy !== null || !escrowMicro || escrowMicro === "0"}
            title="Forcefully claw back the agent's vault tokens to you"
          >
            {busy === "revoke" ? "…" : "Revoke agent tokens"}
          </Button>
        </div>
      )}
      {note && <div className="mt-2 text-xs text-muted">{note}</div>}
    </Card>
  );
}
