import { useState, type ReactNode } from "react";
import { Button, Card, Icon, Input } from "@vellum/ui";
import { api } from "./api.ts";
import { PersonaForm } from "./PersonaForm.tsx";

// First-run web onboarding (#19): the browser-native alternative to the terminal
// wizard. Walks a from-scratch user through the LLM key + first persona, all on
// loopback — secrets go to the local daemon's .env via POST /api/setup. The agent
// wallet is ALWAYS generated fresh server-side (#59, no import); the phrase is the
// AGENT's key, never shown here — the user reveals it from Settings → Export
// (#57). On done, the app reloads into the dashboard.
type Step = "secrets" | "persona";

export function SetupFlow({ onDone }: { onDone: (personaId: string) => void }) {
  const [step, setStep] = useState<Step>("secrets");
  const [openRouterKey, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitSecrets() {
    if (!openRouterKey.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.setup({ openRouterKey: openRouterKey.trim() });
      setStep("persona");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
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
                : "step 2 · your first persona"}
            </div>
          </div>
        </div>

        {step === "secrets" && (
          <div className="mt-6 space-y-5">
            <Field
              label="OpenRouter API key"
              hint="Powers the agent's LLM — required. We verify it before continuing. Get one at openrouter.ai/keys."
            >
              <Input
                type="password"
                value={openRouterKey}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && openRouterKey.trim() && submitSecrets()
                }
                placeholder="sk-or-…"
                autoFocus
              />
            </Field>
            <div className="rounded-lg border border-border-gold bg-accent-soft/20 p-3">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                <Icon name="wallet" size={13} /> Agent wallet
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                A fresh wallet is generated automatically and held locally — all
                persona wallets derive from it. You can back up the seed phrase
                anytime in Settings → Wallet recovery.
              </p>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button
              className="w-full"
              size="lg"
              onClick={submitSecrets}
              disabled={busy || !openRouterKey.trim()}
            >
              {busy ? "Verifying key…" : "Continue"}{" "}
              <Icon name="arrowRight" size={16} />
            </Button>
          </div>
        )}

        {step === "persona" && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-muted">
              Your first persona gets its own wallet + walled-off memory. You
              can add more later — name is all you need to start.
            </p>
            <div className="rounded-lg border border-border-gold bg-accent-soft/20 p-3">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                <Icon name="zap" size={13} /> Full local access (YOLO)
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                By default this agent can read &amp; write files in its
                workspace folder, and{" "}
                <strong className="text-fg">
                  run any shell command on this machine
                </strong>{" "}
                — full host access, not sandboxed. This is{" "}
                <strong className="text-fg">full trust</strong>: a command can
                even read the agent&apos;s signing key and move funds, so only
                enable it for an agent you trust. (The vault/spend rules still
                gate the agent&apos;s money <em>tools</em>; raw commands bypass
                them.) Revoke file &amp; command access per-persona to lock
                down.
              </p>
            </div>
            <PersonaForm submitLabel="Enter Bolt" onCreated={onDone} />
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
