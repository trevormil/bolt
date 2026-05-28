import { useState, type ReactNode } from "react";
import { Button, Card, Icon, Input } from "@vellum/ui";
import { api } from "./api.ts";

// First-run web onboarding (#54): the browser-native alternative to the terminal
// wizard. Walks a from-scratch user through the LLM key + agent wallet (generate
// server-side or import) + first persona, all on loopback — secrets go to the
// local daemon's .env via POST /api/setup, and a generated mnemonic is shown ONCE
// to back up. On done, the app reloads into the dashboard.
type Step = "secrets" | "backup" | "persona";

export function SetupFlow({ onDone }: { onDone: (personaId: string) => void }) {
  const [step, setStep] = useState<Step>("secrets");
  const [openRouterKey, setKey] = useState("");
  const [walletMode, setWalletMode] = useState<"generate" | "import">(
    "generate",
  );
  const [importMnemonic, setImport] = useState("");
  const [mnemonic, setMnemonic] = useState<string | null>(null); // generated, to back up
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitSecrets() {
    if (
      walletMode === "import" &&
      importMnemonic.trim().split(/\s+/).length < 12
    )
      return setError("That doesn't look like a 12–24 word mnemonic.");
    setBusy(true);
    setError(null);
    try {
      const r = await api.setup({
        openRouterKey: openRouterKey.trim() || undefined,
        mnemonic: walletMode === "import" ? importMnemonic.trim() : undefined,
      });
      if (r.generatedMnemonic) {
        setMnemonic(r.generatedMnemonic);
        setStep("backup");
      } else {
        setStep("persona");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function createPersona() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { persona } = await api.createPersona({ name: name.trim() });
      onDone(persona.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="relative grid h-full place-items-center overflow-hidden bg-base text-fg font-sans">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(48rem 32rem at 50% -8%, rgba(212,175,55,0.12), transparent 60%)",
        }}
      />
      <Card className="relative w-[28rem] max-w-[92vw] p-7">
        <div className="flex items-center gap-2.5">
          <img
            src="/logos/bolt.png"
            alt="Bolt"
            className="h-9 w-9 rounded-lg object-cover shadow-glow"
          />
          <div className="leading-tight">
            <div className="font-serif text-xl">Set up Bolt</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-soft">
              {step === "secrets"
                ? "step 1 · key + wallet"
                : step === "backup"
                  ? "step 2 · back up your wallet"
                  : "step 3 · your first persona"}
            </div>
          </div>
        </div>

        {step === "secrets" && (
          <div className="mt-6 space-y-5">
            <Field
              label="OpenRouter API key"
              hint="Powers the agent's LLM. You can add it later, but chat won't work until you do."
            >
              <Input
                type="password"
                value={openRouterKey}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-or-…  (optional)"
              />
            </Field>
            <Field
              label="Agent wallet"
              hint="All persona wallets derive from one master key — held locally, never sent anywhere."
            >
              <div className="flex gap-2">
                <Choice
                  active={walletMode === "generate"}
                  onClick={() => setWalletMode("generate")}
                  title="Generate"
                  sub="fresh key"
                />
                <Choice
                  active={walletMode === "import"}
                  onClick={() => setWalletMode("import")}
                  title="Import"
                  sub="existing phrase"
                />
              </div>
              {walletMode === "import" && (
                <textarea
                  value={importMnemonic}
                  onChange={(e) => setImport(e.target.value)}
                  placeholder="paste your 24-word recovery phrase"
                  rows={2}
                  className="mt-2 w-full rounded-md border border-border bg-surface-3 px-3 py-2 font-mono text-xs text-fg placeholder:text-soft focus:border-accent focus:outline-none"
                />
              )}
            </Field>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button
              className="w-full"
              size="lg"
              onClick={submitSecrets}
              disabled={busy}
            >
              {busy ? "Setting up…" : "Continue"}{" "}
              <Icon name="arrowRight" size={16} />
            </Button>
          </div>
        )}

        {step === "backup" && mnemonic && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-muted">
              This is your agent's recovery phrase. Write it down — it's shown
              once and never leaves this machine.
            </p>
            <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-border-gold bg-accent-soft/30 p-3">
              {mnemonic.split(/\s+/).map((w, i) => (
                <div
                  key={i}
                  className="flex items-baseline gap-1.5 font-mono text-xs"
                >
                  <span className="text-soft">{i + 1}</span>
                  <span className="text-accent-strong">{w}</span>
                </div>
              ))}
            </div>
            <Button
              className="w-full"
              size="lg"
              onClick={() => setStep("persona")}
            >
              I've saved it — continue
            </Button>
          </div>
        )}

        {step === "persona" && (
          <div className="mt-6 space-y-4">
            <Field
              label="Name your first persona"
              hint="It gets its own wallet + walled-off memory. You can add more later."
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createPersona()}
                placeholder="Assistant"
                autoFocus
              />
            </Field>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button
              className="w-full"
              size="lg"
              onClick={createPersona}
              disabled={busy || !name.trim()}
            >
              {busy ? "Creating…" : "Enter Bolt"}{" "}
              <Icon name="arrowRight" size={16} />
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-soft">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      <p className="mt-1.5 text-xs leading-relaxed text-soft">{hint}</p>
    </label>
  );
}

function Choice({
  active,
  onClick,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex-1 rounded-lg border px-3 py-2 text-left transition-colors " +
        (active
          ? "border-border-gold bg-accent-soft/40 text-fg"
          : "border-border text-muted hover:border-soft")
      }
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-[11px] text-soft">{sub}</div>
    </button>
  );
}
