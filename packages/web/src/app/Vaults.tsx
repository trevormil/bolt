import { useEffect, useState, type ReactNode } from "react";
import { Badge, Button, Card, Icon, Input } from "@vellum/ui";
import { BrandLogo } from "./BrandLogo.tsx";
import { api, type Vault, type DepositRequest, type VoteTally } from "./api.ts";
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
  // The connected Keplr wallet becomes the vault's manager (#75) — the human
  // controls it; the agent (creator) has zero manager capability.
  const { wallet } = useWallet();
  const [vaults, setVaults] = useState<Vault[]>([]);
  // The persona agent's own wallet address — the recipient of deposited vault
  // tokens (#45 / !37): the agent must hold them to withdraw within rules.
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  // Gating policy (#45 slice 2): amount cap per period + an optional active
  // window (start / end date).
  const [period, setPeriod] = useState<"none" | "daily" | "weekly" | "monthly">(
    "weekly",
  );
  const [limit, setLimit] = useState("");
  const [startDate, setStartDate] = useState(""); // yyyy-mm-dd; withdrawals open
  const [endDate, setEndDate] = useState(""); // yyyy-mm-dd; withdrawals close
  // Multi-sig (#45 slice 3): one bb1 signer address per row + threshold.
  const [signerList, setSignerList] = useState<string[]>([""]);
  const [threshold, setThreshold] = useState("");
  // Withdrawal rules are advanced + optional — hidden behind a toggle so the
  // common case (a plain vault) is two fields (#55).
  const [showRules, setShowRules] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live-derived gating from the form, shared by the preview, inline validation,
  // and submit. Only counts when the rules section is open.
  const signers = signerList
    .map((s) => s.trim())
    .filter((s) => s.startsWith("bb1"));
  const thresholdNum = Number(threshold);
  const hasAmount = showRules && period !== "none" && Number(limit) > 0;
  const hasStart = showRules && !!startDate;
  const hasEnd = showRules && !!endDate;
  const hasTime = hasStart || hasEnd;
  const hasMultisig = showRules && signers.length > 0;
  // Inline validation (#55): surface unworkable rules in the form (mirrors the
  // server's parseGating guards) instead of waiting for a 400.
  const timeError =
    hasStart && hasEnd && localEpoch(endDate) <= localEpoch(startDate)
      ? "End date must be after the start date."
      : null;
  const multisigError = !hasMultisig
    ? null
    : !(thresholdNum >= 1)
      ? "Set how many approvals each withdrawal needs."
      : thresholdNum > signers.length
        ? `Approvals required (${thresholdNum}) can't exceed the ${signers.length} signer${signers.length === 1 ? "" : "s"}.`
        : null;
  const formError = timeError || multisigError;
  const windowText =
    hasStart && hasEnd
      ? `active ${fmtLocalDay(startDate)} – ${fmtLocalDay(endDate)}`
      : hasStart
        ? `unlocks ${fmtLocalDay(startDate)}`
        : hasEnd
          ? `expires ${fmtLocalDay(endDate)}`
          : null;
  const previewParts = [
    hasAmount ? `≤ ${limit} USDC / ${period}` : null,
    timeError ? null : windowText,
    hasMultisig && !multisigError
      ? `${thresholdNum}-of-${signers.length} sign-off`
      : null,
  ].filter(Boolean) as string[];

  async function reload() {
    setVaults(await api.listVaults(personaId));
  }
  useEffect(() => {
    void reload();
    void api.wallet(personaId).then((w) => setAgentAddress(w.address));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);

  async function create() {
    if (!name.trim() || !symbol.trim() || formError) return;
    // The vault needs a human manager — the connected Keplr address (#75).
    // Without it the create would 400; guide the user to connect first.
    if (!wallet) {
      setError(
        "Connect your Keplr wallet first — it becomes the vault's manager.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const gating: {
        amount?: { limitUsd: number; period: "daily" | "weekly" | "monthly" };
        time?: { unlockAt?: number; expiresAt?: number };
        multisig?: { signers: { address: string }[]; threshold: number };
      } = {};
      // `hasAmount` already narrows period to a non-"none" value (it includes
      // `period !== "none"`), so the assignment typechecks.
      if (hasAmount) gating.amount = { limitUsd: Number(limit), period };
      if (hasTime)
        gating.time = {
          ...(hasStart ? { unlockAt: localEpoch(startDate) } : {}),
          ...(hasEnd ? { expiresAt: localEpoch(endDate) } : {}),
        };
      if (hasMultisig)
        gating.multisig = {
          signers: signers.map((address) => ({ address })),
          threshold: thresholdNum,
        };
      await api.createVault(personaId, {
        name: name.trim(),
        symbol: symbol.trim(),
        gating: Object.keys(gating).length ? gating : undefined,
        managerAddress: wallet.address,
      });
      setName("");
      setSymbol("");
      setLimit("");
      setStartDate("");
      setEndDate("");
      setPeriod("weekly");
      setSignerList([""]);
      setThreshold("");
      setShowRules(false);
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
        <Card className="mb-4 space-y-4 p-4">
          {/* Basics — all most vaults need. */}
          <div className="grid grid-cols-2 gap-3">
            <Label text="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Groceries"
                autoFocus
              />
            </Label>
            <Label text="Symbol">
              <Input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="vUSDC"
              />
            </Label>
          </div>

          {/* Withdrawal rules — optional + advanced, hidden by default (#55). */}
          {!showRules ? (
            <button
              onClick={() => setShowRules(true)}
              className="flex items-center gap-1.5 text-sm text-accent transition-colors hover:text-accent-strong"
            >
              <Icon name="plus" size={13} /> Add withdrawal rules (optional)
            </button>
          ) : (
            <div className="space-y-4 rounded-lg border border-border-gold bg-accent-soft/10 p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                  Withdrawal rules
                </span>
                <button
                  onClick={() => setShowRules(false)}
                  className="text-xs text-soft transition-colors hover:text-fg"
                >
                  remove rules
                </button>
              </div>

              {/* Amount cap */}
              <Label text="Amount cap">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value as typeof period)}
                    className="rounded-md border border-border bg-surface px-3 text-sm text-fg"
                  >
                    <option value="none">No cap</option>
                    <option value="daily">per day</option>
                    <option value="weekly">per week</option>
                    <option value="monthly">per month</option>
                  </select>
                  <div className="relative">
                    <BrandLogo
                      name="usdc"
                      size={15}
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
                    />
                    <Input
                      value={limit}
                      onChange={(e) => setLimit(e.target.value)}
                      placeholder="25"
                      inputMode="decimal"
                      disabled={period === "none"}
                      className="pl-8 font-mono"
                    />
                  </div>
                </div>
              </Label>

              {/* Active window — start / end date (#55). */}
              <Label text="Active window">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    title="Start — no withdrawals before this date"
                  />
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    title="End — no withdrawals after this date"
                  />
                </div>
                <p className="mt-1 text-[11px] text-soft">
                  Start and end are both optional — leave either blank for
                  open-ended.
                </p>
                {timeError && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-danger">
                    <Icon name="warn" size={12} /> {timeError}
                  </p>
                )}
              </Label>

              {/* Multi-sig sign-off — one signer address per row. */}
              <Label text="Multi-sig sign-off">
                <div className="space-y-1.5">
                  {signerList.map((addr, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Input
                        value={addr}
                        onChange={(e) =>
                          setSignerList((list) =>
                            list.map((s, j) => (j === i ? e.target.value : s)),
                          )
                        }
                        placeholder="bb1…"
                        className="font-mono text-xs"
                      />
                      {signerList.length > 1 && (
                        <button
                          onClick={() =>
                            setSignerList((list) =>
                              list.filter((_, j) => j !== i),
                            )
                          }
                          title="Remove signer"
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border text-soft transition-colors hover:border-danger hover:text-danger"
                        >
                          <Icon name="x" size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => setSignerList((list) => [...list, ""])}
                    className="flex items-center gap-1.5 text-xs text-accent transition-colors hover:text-accent-strong"
                  >
                    <Icon name="plus" size={12} /> Add signer
                  </button>
                </div>
                <Input
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder={
                    signers.length
                      ? `Approvals required (1–${signers.length})`
                      : "Approvals required"
                  }
                  inputMode="numeric"
                  disabled={!signers.length}
                  className="mt-2 font-mono"
                />
                {multisigError && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-danger">
                    <Icon name="warn" size={12} /> {multisigError}
                  </p>
                )}
              </Label>
            </div>
          )}

          {/* Plain-English preview of the rule being created (#55). */}
          <div className="rounded-md border border-border bg-surface-3 px-3 py-2 text-xs">
            <span className="font-mono uppercase tracking-[0.15em] text-soft">
              Preview ·{" "}
            </span>
            {previewParts.length ? (
              <span className="font-medium text-accent-strong">
                {previewParts.join("  ·  ")}
              </span>
            ) : (
              <span className="text-muted">
                No limits — the agent withdraws freely within escrow.
              </span>
            )}
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end">
            <Button
              onClick={create}
              disabled={busy || !name.trim() || !symbol.trim() || !!formError}
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

// Format a yyyy-mm-dd value as a local-day label. Parsing the string directly
// (`new Date("2026-06-01")`) is UTC midnight, which renders as the PREVIOUS day
// for users behind UTC — so build the date from local parts (!54 LOW).
function fmtLocalDay(iso: string): string {
  return localDate(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// yyyy-mm-dd → a Date at LOCAL midnight (not UTC, which would shift the day).
function localDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}
const localEpoch = (iso: string): number => localDate(iso).getTime();

// Label for a vault's active window (epoch-ms bounds) in the list — null if no
// time gate. unlockAt = start, expiresAt = end (#55).
function timeBadge(time?: {
  unlockAt?: number;
  expiresAt?: number;
}): string | null {
  const start = time?.unlockAt;
  const end = time?.expiresAt;
  const day = (e: number) => new Date(e).toLocaleDateString();
  if (start != null && end != null) return `active ${day(start)} – ${day(end)}`;
  if (start != null) return `unlocks ${day(start)}`;
  if (end != null) return `expires ${day(end)}`;
  return null;
}

// Mono-caps field label wrapper — matches the Settings/onboarding form motif.
function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-soft">
        {text}
      </span>
      {children}
    </label>
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
    "withdraw" | "deposit" | "request" | "drain" | "revoke" | null
  >(null);
  const [note, setNote] = useState<string | null>(null);
  // undefined = not yet loaded · null = LCD unreachable (#104) · string = real
  const [escrowMicro, setEscrowMicro] = useState<string | null | undefined>(
    undefined,
  );
  // Deposit requests (#62) — the shareable "fund this vault" links for this vault.
  const [memo, setMemo] = useState("");
  const [requests, setRequests] = useState<DepositRequest[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Live multisig sign-off tally (#83) — only for multisig vaults.
  const [tally, setTally] = useState<VoteTally | null>(null);

  // Escrow = the agent's holding of THIS vault's tokens (#45) — the correct
  // per-vault figure (all USDC vaults share one backing alias, so the agent's
  // per-collection token balance, not the shared backing, is this vault's slice).
  async function reloadEscrow() {
    try {
      const e = await api.vaultEscrow(personaId, vault.collectionId);
      // API can return null when the chain LCD is unreachable (#104 §1).
      // Preserve that distinct signal — caller renders "unknown" instead
      // of pretending the vault is empty.
      setEscrowMicro(e.escrowedMicro);
    } catch {
      setEscrowMicro(null);
    }
  }
  // Pending deposit requests are stored per-persona; show only this vault's.
  async function reloadRequests() {
    try {
      const all = await api.listDepositRequests(personaId);
      setRequests(all.filter((r) => r.collectionId === vault.collectionId));
    } catch {
      setRequests([]);
    }
  }
  useEffect(() => {
    void reloadEscrow();
    void reloadRequests();
    if (vault.gating?.multisig)
      api
        .vaultSignoff(vault.collectionId)
        .then((s) => setTally(s.tally))
        .catch(() => setTally(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId, vault.collectionId]);

  // Poll a submitted tx toward a terminal state (#81). The daemon's auto-reconcile
  // is the real guarantee it settles; this just lets the UI reflect it without a
  // reload. Returns the last-seen status ("pending" if the window elapses first).
  async function pollTx(pid: string, txId: string): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const t = await api.txStatus(pid, txId).catch(() => null);
      if (t && (t.status === "confirmed" || t.status === "failed"))
        return t.status;
      await new Promise((res) => setTimeout(res, 1500));
    }
    return "pending";
  }

  // Agent withdraws within the vault's on-chain rule (server-signed).
  async function withdraw() {
    const usdc = Number(amount);
    if (!usdc) return;
    setBusy("withdraw");
    setNote(null);
    let r: { id: string; hash: string | null; status: string };
    try {
      r = await api.vaultWithdraw(
        personaId,
        vault.collectionId,
        String(Math.round(usdc * 1e6)),
      );
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
      setBusy(null);
      return;
    }
    // Unblock the button as soon as it's submitted; surface progress via the note
    // (#81) instead of a perpetual "pending" or a 30s-disabled control.
    setBusy(null);
    setAmount("");
    const short = r.hash ? ` (${r.hash.slice(0, 10)}…)` : "";
    setNote(`Withdrawal submitted${short} — confirming on-chain…`);
    const settled = await pollTx(personaId, r.id);
    if (settled === "confirmed") setNote(`Withdrawal confirmed${short}`);
    else if (settled === "failed")
      setNote(`Withdrawal failed${short} — see Activity for details.`);
    else
      setNote(
        `Still confirming${short} — it will settle shortly; see Activity.`,
      );
    void reloadEscrow();
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
        `${kind === "drain" ? "Withdrew all to you" : "Froze agent access"} (${txHash.slice(0, 10)}…)`,
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

  // Raise a shareable deposit request for this vault (#62) — the deposit analog
  // of WalletPanel's "Request" payment-request action. It appears in the pending
  // list below; share its /deposit/:id link so anyone can fund the vault.
  async function requestDeposit() {
    const usd = Number(amount);
    if (!usd) return;
    setBusy("request");
    setNote(null);
    try {
      await api.createDepositRequest(personaId, {
        collectionId: vault.collectionId,
        amountUsdc: usd,
        memo: memo.trim() || undefined,
      });
      setAmount("");
      setMemo("");
      await reloadRequests();
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function dismissRequest(id: string) {
    setBusy("request");
    try {
      await api.dismissDepositRequest(id);
      await reloadRequests();
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function copyLink(id: string) {
    navigator.clipboard?.writeText(`${window.location.origin}/deposit/${id}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1200);
  }

  return (
    <Card data-testid={`vault-row-${vault.symbol}`} className="p-3">
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
          {escrowMicro !== undefined && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-soft">
                escrowed
              </span>
              <BrandLogo name="usdc" size={13} />
              {escrowMicro === null ? (
                <span className="font-mono text-danger">
                  unknown — chain unreachable
                </span>
              ) : (
                <>
                  <span className="font-mono text-fg">
                    {(Number(escrowMicro) / 1e6).toFixed(2)}
                  </span>
                  <span className="text-soft">· agent's claim</span>
                </>
              )}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {vault.gating?.amount && (
              <Badge tone="accent">
                ≤ {vault.gating.amount.limitUsd} USDC /{" "}
                {vault.gating.amount.period}
              </Badge>
            )}
            {timeBadge(vault.gating?.time) && (
              <Badge tone="default">{timeBadge(vault.gating?.time)}</Badge>
            )}
            {vault.gating?.multisig && (
              <Badge tone="accent">
                {vault.gating.multisig.threshold}-of-
                {vault.gating.multisig.signers.length} multisig
                {tally
                  ? ` · ${tally.signedCount}/${tally.totalSigners} signed${tally.quorumMet ? " ✓" : ""}`
                  : ""}
              </Badge>
            )}
            {!vault.gating?.amount &&
              !timeBadge(vault.gating?.time) &&
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
          <Button
            variant="secondary"
            size="sm"
            onClick={requestDeposit}
            disabled={busy !== null || !amount}
            title="Raise a shareable deposit request — anyone can fund this vault via the link"
          >
            <Icon name="link" size={13} />{" "}
            {busy === "request" ? "…" : "Request"}
          </Button>
        </div>
      </div>
      <div className="mt-2">
        <Input
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="Deposit request memo (optional)"
          className="text-xs"
        />
      </div>
      {isManager && (
        <div className="mt-2 border-t border-border pt-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-soft">
              Manager
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => managerAction("drain")}
              disabled={busy !== null || !escrowMicro || escrowMicro === "0"}
              title="Burn the agent's vault tokens and return the escrowed USDC to your wallet."
            >
              {busy === "drain" ? "…" : "Withdraw all to me"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => managerAction("revoke")}
              disabled={busy !== null || !escrowMicro || escrowMicro === "0"}
              title="Claw the agent's vault tokens back to you — it can no longer spend; the escrowed USDC stays under your control."
            >
              {busy === "revoke" ? "…" : "Freeze agent access"}
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-soft">
            <span className="text-muted">Withdraw all</span> returns the
            escrowed USDC to your wallet.{" "}
            <span className="text-muted">Freeze</span> revokes the agent's
            spending access but keeps the USDC escrowed under you.
          </p>
        </div>
      )}
      {note && <div className="mt-2 text-xs text-muted">{note}</div>}
      {requests.length > 0 && (
        <div className="mt-2 border-t border-border pt-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-soft">
            Pending deposit requests
          </span>
          <div className="mt-1.5 space-y-1.5">
            {requests.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-3 px-2.5 py-1.5"
              >
                <span className="flex min-w-0 items-center gap-1.5 text-xs">
                  <BrandLogo name="usdc" size={13} />
                  <span className="font-mono text-fg">
                    {(Number(r.amount) / 1e6).toFixed(2)}
                  </span>
                  <span className="truncate text-soft">{r.memo}</span>
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => copyLink(r.id)}
                    title="Copy /deposit link"
                    className="grid h-7 w-7 place-items-center rounded-md border border-border text-soft hover:text-fg"
                  >
                    <Icon
                      name={copiedId === r.id ? "check" : "link"}
                      size={13}
                    />
                  </button>
                  <button
                    onClick={() => dismissRequest(r.id)}
                    disabled={busy !== null}
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
      )}
    </Card>
  );
}
