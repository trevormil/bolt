import { useEffect, useState } from "react";
import { Avatar, Button, Card, Icon, Input, cn } from "@vellum/ui";
import { api, type Persona } from "./api.ts";
import { Chat } from "./Chat.tsx";
import { LedgerView } from "./Ledger.tsx";
import { VaultsView } from "./Vaults.tsx";
import { WalletPanel } from "./WalletPanel.tsx";
import { useWallet } from "./wallet-context.tsx";

type Tab = "chat" | "vaults" | "ledger";

export function App() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);

  async function reload(selectId?: string) {
    const list = await api.listPersonas();
    setPersonas(list);
    setLoaded(true);
    if (selectId) setSelectedId(selectId);
    else if (!selectId && list.length && !selectedId)
      setSelectedId(list[0]!.id);
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = personas.find((p) => p.id === selectedId) ?? null;

  if (loaded && personas.length === 0 && !creating) {
    return <Welcome onStart={() => setCreating(true)} />;
  }
  if (creating || (loaded && personas.length === 0)) {
    return (
      <Onboarding
        onCancel={personas.length ? () => setCreating(false) : undefined}
        onCreated={async (id) => {
          setCreating(false);
          await reload(id);
        }}
      />
    );
  }

  return (
    <div className="flex h-full bg-base text-fg font-sans">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-accent-fg">
            <Icon name="sparkle" size={16} />
          </span>
          <span className="font-serif text-lg">Vellum</span>
        </div>
        <div className="px-3 text-xs uppercase tracking-wide text-soft">
          Personas
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {personas.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm",
                p.id === selectedId
                  ? "bg-surface-3 text-fg"
                  : "text-muted hover:bg-surface-3/50",
              )}
            >
              <Avatar name={p.name} size={26} />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </nav>
        <div className="p-3">
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => setCreating(true)}
          >
            <Icon name="plus" size={14} /> New persona
          </Button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {selected && (
          <>
            <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
              <div className="min-w-0">
                <h1 className="truncate text-lg font-medium">
                  {selected.name}
                </h1>
                <p className="truncate text-sm text-muted">
                  {selected.soul.role}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <KeplrButton />
                <div className="flex gap-1 rounded-lg bg-surface p-1">
                  {(["chat", "vaults", "ledger"] as Tab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm capitalize",
                        tab === t
                          ? "bg-accent text-accent-fg"
                          : "text-muted hover:text-fg",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </header>

            {/* key={selected.id} remounts these on persona switch so no local
                state (e.g. Chat's message list) bleeds across compartments. */}
            <div key={selected.id} className="flex min-h-0 flex-1">
              <div className="min-w-0 flex-1">
                {tab === "chat" ? (
                  <Chat persona={selected} />
                ) : tab === "vaults" ? (
                  <VaultsView personaId={selected.id} />
                ) : (
                  <LedgerView personaId={selected.id} />
                )}
              </div>
              <WalletPanel personaId={selected.id} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// The human's own Keplr wallet (0027) — distinct from the per-persona agent
// keys. Underpins every human-signed flow (fund a persona, pay a request, fund
// a vault). Connect/disconnect + a compact address·balance chip.
function KeplrButton() {
  const { wallet, usdc, available, connecting, connect, disconnect } =
    useWallet();
  if (!available)
    return <span className="text-xs text-soft">Keplr not detected</span>;
  if (!wallet)
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={connect}
        disabled={connecting}
      >
        <Icon name="wallet" size={14} />{" "}
        {connecting ? "Connecting…" : "Connect Keplr"}
      </Button>
    );
  return (
    <button
      onClick={disconnect}
      title="Disconnect Keplr"
      className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs hover:border-soft"
    >
      <Icon name="wallet" size={14} />
      <span className="font-mono">
        {wallet.address.slice(0, 8)}…{wallet.address.slice(-4)}
      </span>
      <span className="text-muted">{(Number(usdc) / 1e6).toFixed(2)} USDC</span>
    </button>
  );
}

function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="grid h-full place-items-center bg-base text-fg font-sans">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-xl bg-accent text-accent-fg shadow-glow">
          <Icon name="sparkle" size={28} />
        </span>
        <h1 className="font-serif text-4xl">Vellum</h1>
        <p className="mt-3 text-muted">
          A payment-first personal agent. Every persona is its own compartment —
          its own memory, wallet, and budget, walled off from the rest.
        </p>
        <Button className="mt-6" onClick={onStart}>
          Create your first persona <Icon name="arrowRight" size={16} />
        </Button>
      </div>
    </div>
  );
}

function Onboarding({
  onCreated,
  onCancel,
}: {
  onCreated: (id: string) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [voice, setVoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { persona } = await api.createPersona({
        name: name.trim(),
        role: role.trim() || undefined,
        voice: voice.trim() || undefined,
      });
      onCreated(persona.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="grid h-full place-items-center bg-base text-fg font-sans">
      <Card className="w-[26rem] p-6">
        <h2 className="font-serif text-2xl">New persona</h2>
        <p className="mt-1 text-sm text-muted">
          A persona gets its own bb1 wallet on creation — fund it from the
          wallet panel.
        </p>
        <div className="mt-5 space-y-3">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Atlas"
              autoFocus
            />
          </Field>
          <Field label="Role">
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="finance copilot"
            />
          </Field>
          <Field label="Voice">
            <Input
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              placeholder="terse, dry"
            />
          </Field>
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create persona"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wide text-soft">
        {label}
      </span>
      {children}
    </label>
  );
}
