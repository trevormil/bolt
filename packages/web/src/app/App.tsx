import { useEffect, useState } from "react";
import { Avatar, Button, Card, Icon, Input, cn } from "@vellum/ui";
import { api, type Persona, type SetupStatus } from "./api.ts";
import { BrandLogo } from "./BrandLogo.tsx";
import { Chat } from "./Chat.tsx";
import { LedgerView } from "./Ledger.tsx";
import { VaultsView } from "./Vaults.tsx";
import { ActivityView } from "./Activity.tsx";
import { SettingsView } from "./Settings.tsx";
import { WalletPanel } from "./WalletPanel.tsx";
import { useWallet } from "./wallet-context.tsx";

type Tab = "chat" | "vaults" | "ledger" | "activity" | "settings";
const TABS: Tab[] = ["chat", "vaults", "ledger", "activity", "settings"];

export function App() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);

  async function reload(selectId?: string) {
    const list = await api.listPersonas();
    setPersonas(list);
    setLoaded(true);
    if (selectId) setSelectedId(selectId);
    else if (!selectId && list.length && !selectedId)
      setSelectedId(list[0]!.id);
  }

  // Auth gate (#27): open on loopback dev; a login is only needed when the API
  // is token-protected (exposed deploy). Check before loading any data.
  useEffect(() => {
    api
      .authStatus()
      .then((s) => setAuthed(s.authed))
      .catch(() => setAuthed(true));
  }, []);

  useEffect(() => {
    if (authed) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  const selected = personas.find((p) => p.id === selectedId) ?? null;

  if (authed === null) {
    return (
      <div className="grid h-full place-items-center bg-base text-soft">…</div>
    );
  }
  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

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
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold text-accent-fg shadow-glow">
            <Icon name="zap" size={17} strokeWidth={2} />
          </span>
          <span className="font-serif text-xl tracking-tight">Bolt</span>
        </div>
        <div className="px-5 pb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-soft">
          Personas
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
          {personas.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                p.id === selectedId
                  ? "border border-border-gold bg-accent-soft/40 text-fg"
                  : "border border-transparent text-muted hover:bg-surface-3/50",
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
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={selected.name} size={36} />
                <div className="min-w-0">
                  <h1 className="truncate font-serif text-xl">
                    {selected.name}
                  </h1>
                  <p className="truncate text-sm text-muted">
                    {selected.soul.role}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <KeplrButton />
                <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
                  {TABS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm capitalize transition-colors",
                        tab === t
                          ? "bg-gold text-accent-fg shadow-glow"
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
                ) : tab === "activity" ? (
                  <ActivityView personaId={selected.id} />
                ) : tab === "settings" ? (
                  <SettingsView personaId={selected.id} />
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
        <BrandLogo name="keplr" size={15} className="rounded-none" />
        {connecting ? "Connecting…" : "Connect Keplr"}
      </Button>
    );
  return (
    <button
      onClick={disconnect}
      title="Disconnect Keplr"
      className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs transition-colors hover:border-border-gold"
    >
      <BrandLogo name="keplr" size={14} className="rounded-none" />
      <span className="font-mono text-fg">
        {wallet.address.slice(0, 8)}…{wallet.address.slice(-4)}
      </span>
      <span className="flex items-center gap-1 font-mono text-muted">
        {(Number(usdc) / 1e6).toFixed(2)}
        <BrandLogo name="usdc" size={13} />
      </span>
    </button>
  );
}

// Shown only when the API is token-protected (exposed deploy) and not yet
// authenticated. Exchanges the token for an httpOnly session cookie via /api/login.
function Login({ onLogin }: { onLogin: () => void }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.login(token.trim());
      onLogin();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="grid h-full place-items-center bg-base text-fg font-sans">
      <Card className="w-[24rem] p-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gold text-accent-fg shadow-glow">
            <Icon name="zap" size={18} strokeWidth={2} />
          </span>
          <span className="font-serif text-2xl">Bolt</span>
        </div>
        <p className="mt-4 text-sm text-muted">
          This instance is access-protected. Enter the API token to continue.
        </p>
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="API token"
          className="mt-3"
          autoFocus
        />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <Button
          className="mt-4 w-full"
          onClick={submit}
          disabled={busy || !token.trim()}
        >
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </Card>
    </div>
  );
}

function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="relative grid h-full place-items-center overflow-hidden bg-base text-fg font-sans">
      {/* Atmosphere: a warm gold glow from above, matching the landing. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(48rem 32rem at 50% -8%, rgba(212,175,55,0.12), transparent 60%)",
        }}
      />
      <div className="relative max-w-md px-6 text-center">
        <span className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-gold text-accent-fg shadow-glow">
          <Icon name="zap" size={32} strokeWidth={2} />
        </span>
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.3em] text-copper">
          local-first · agentic · payment-native
        </p>
        <h1 className="font-serif text-5xl leading-none tracking-tight">Bolt</h1>
        <p className="mt-4 text-muted">
          The agent with a wallet. Every persona is its own compartment — its own
          memory, wallet, and budget, walled off from the rest.
        </p>
        <SetupBanner />
        <Button className="mt-7" size="lg" onClick={onStart}>
          Create your first persona <Icon name="arrowRight" size={16} />
        </Button>
      </div>
    </div>
  );
}

// Surfaces missing first-run setup (#19) — secrets are configured through the
// terminal wizard (never the browser), so the web onboarding guides the user
// there rather than collecting an API key + mnemonic over HTTP.
function SetupBanner() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  useEffect(() => {
    api
      .setupStatus()
      .then(setStatus)
      .catch(() => {});
  }, []);
  if (!status) return null;
  const missing: string[] = [];
  if (!status.hasLlmKey) missing.push("an OpenRouter API key");
  if (!status.hasWallet) missing.push("an agent signer wallet");
  if (!missing.length) return null;
  return (
    <div className="mt-6 rounded-xl border border-border-gold bg-accent-soft/30 p-4 text-left text-sm">
      <p className="flex items-center gap-1.5 font-medium text-accent">
        <Icon name="zap" size={14} strokeWidth={2} /> Finish setup to enable chat
      </p>
      <p className="mt-1.5 text-muted">
        Missing {missing.join(" and ")}. Run the one-command wizard in a
        terminal:
      </p>
      <pre className="mt-2.5 rounded-md border border-border bg-base/70 px-3 py-2 font-mono text-xs text-accent-strong">
        <span className="text-soft">$ </span>bun run setup
      </pre>
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
