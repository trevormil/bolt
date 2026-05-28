import { useEffect, useState } from "react";
import { Badge, Button, Card, Icon, Input } from "@vellum/ui";
import { api, type BudgetResponse, type Resolved, type Task } from "./api.ts";

export function SettingsView({ personaId }: { personaId: string }) {
  return (
    <div className="h-full space-y-6 overflow-y-auto p-6">
      <ModelSection personaId={personaId} />
      <BudgetSection personaId={personaId} />
      <TasksSection personaId={personaId} />
      <RecoverySection />
    </div>
  );
}

// ── #57 wallet recovery — deliberate seed-phrase export ──────────────────────
// The agent's master mnemonic is never shown at onboarding; this is the one place
// the user can reveal it (blurred until clicked) to back it up. Fetched only on
// demand from the loopback+authed GET /api/agent/mnemonic.
function RecoverySection() {
  const [phrase, setPhrase] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const { mnemonic } = await api.agentMnemonic();
      setPhrase(mnemonic);
      setRevealed(false); // shown blurred first — a second click reveals
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    if (!phrase) return;
    navigator.clipboard?.writeText(phrase);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <Card className="p-4">
      <SectionHead
        title="Wallet recovery"
        hint="The agent's master seed phrase — every persona wallet derives from it. Back it up somewhere safe; anyone who has it controls the agent's funds."
      />
      {!phrase ? (
        <div className="mt-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void load()}
            disabled={busy}
          >
            <Icon name="eye" size={14} /> {busy ? "…" : "Export seed phrase"}
          </Button>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="relative">
            <div
              className={
                "grid grid-cols-3 gap-1.5 rounded-lg border border-border-gold bg-accent-soft/20 p-3 font-mono text-xs transition " +
                (revealed ? "" : "select-none blur-sm")
              }
            >
              {phrase.split(/\s+/).map((w, i) => (
                <div key={i} className="flex items-baseline gap-1.5">
                  <span className="text-soft">{i + 1}</span>
                  <span className="text-accent-strong">{w}</span>
                </div>
              ))}
            </div>
            {!revealed && (
              <button
                onClick={() => setRevealed(true)}
                className="absolute inset-0 grid place-items-center text-sm font-medium text-fg"
              >
                <span className="rounded-md bg-surface px-3 py-1.5 shadow-glow">
                  Click to reveal
                </span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={copy} disabled={!revealed}>
              <Icon name={copied ? "check" : "copy"} size={13} />{" "}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPhrase(null);
                setRevealed(false);
              }}
            >
              Hide
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── #43 per-persona model (approved allowlist) ───────────────────────────────
function ModelSection({ personaId }: { personaId: string }) {
  const [resolved, setResolved] = useState<Resolved<string | null> | null>(
    null,
  );
  const [models, setModels] = useState<string[]>([]);
  const [value, setValue] = useState(""); // "" = inherit
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    api.getModel(personaId).then((r) => {
      if (!live) return;
      setResolved(r);
      setValue(r.value ?? "");
    });
    api.config().then((c) => live && setModels(c.models ?? []));
    return () => {
      live = false;
    };
  }, [personaId]);

  async function save(v: string) {
    const r = await api.setModel(personaId, v.trim() || null);
    setResolved(r);
    setValue(r.value ?? "");
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <Card className="p-4">
      <SectionHead
        title="Model"
        hint="OpenRouter model this persona runs on (approved list). Inherit = the tier router."
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={value}
          onChange={(e) => void save(e.target.value)}
          className="min-w-[18rem] flex-1 rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-fg"
        >
          <option value="">(inherit tier router)</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {saved && <span className="text-xs text-accent">Saved</span>}
      </div>
      {resolved && (
        <p className="mt-2 text-xs text-soft">
          Active:{" "}
          <span className="text-muted">{resolved.value ?? "tier router"}</span>{" "}
          <Badge tone={resolved.source === "persona" ? "accent" : "default"}>
            {resolved.source}
          </Badge>
        </p>
      )}
    </Card>
  );
}

// ── #44 per-persona budgets (daily/weekly/monthly) ───────────────────────────
function BudgetSection({ personaId }: { personaId: string }) {
  const [budget, setBudget] = useState<BudgetResponse | null>(null);
  const [daily, setDaily] = useState("");
  const [weekly, setWeekly] = useState("");
  const [monthly, setMonthly] = useState("");
  const [saved, setSaved] = useState(false);

  function hydrate(b: BudgetResponse) {
    setBudget(b);
    const l = b.limits.value;
    setDaily(l.dailyUsd != null ? String(l.dailyUsd) : "");
    setWeekly(l.weeklyUsd != null ? String(l.weeklyUsd) : "");
    setMonthly(l.monthlyUsd != null ? String(l.monthlyUsd) : "");
  }
  useEffect(() => {
    let live = true;
    api.budget(personaId).then((b) => live && hydrate(b));
    return () => {
      live = false;
    };
  }, [personaId]);

  async function save() {
    const limits: Record<string, number> = {};
    if (Number(daily) > 0) limits.dailyUsd = Number(daily);
    if (Number(weekly) > 0) limits.weeklyUsd = Number(weekly);
    if (Number(monthly) > 0) limits.monthlyUsd = Number(monthly);
    await api.setBudgetLimits(personaId, limits);
    const b = await api.budget(personaId);
    hydrate(b);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const w = budget?.evaluation.windows;
  return (
    <Card className="p-4">
      <SectionHead
        title="LLM budget"
        hint="Per-window USD caps on OpenRouter spend. Blank = no cap for that window."
      />
      <div className="mt-3 grid grid-cols-3 gap-3">
        <LimitField
          label="Daily $"
          value={daily}
          onChange={setDaily}
          burn={w?.daily}
        />
        <LimitField
          label="Weekly $"
          value={weekly}
          onChange={setWeekly}
          burn={w?.weekly}
        />
        <LimitField
          label="Monthly $"
          value={monthly}
          onChange={setMonthly}
          burn={w?.monthly}
        />
      </div>
      <div className="mt-3">
        <Button size="sm" onClick={() => void save()}>
          {saved ? "Saved" : "Save limits"}
        </Button>
        {budget && (
          <span className="ml-3 text-xs text-soft">
            source: {budget.limits.source}
          </span>
        )}
      </div>
    </Card>
  );
}

function LimitField({
  label,
  value,
  onChange,
  burn,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  burn?: { spentUsd: number; capUsd: number; ok: boolean };
}) {
  const pct =
    burn && burn.capUsd > 0
      ? Math.min(100, (burn.spentUsd / burn.capUsd) * 100)
      : 0;
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-soft">
        {label}
      </span>
      <Input
        type="number"
        min="0"
        step="0.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
      />
      {burn && (
        <>
          <div className="mt-1 h-1 overflow-hidden rounded bg-surface-3">
            <div
              className={`h-full ${burn.ok ? "bg-accent" : "bg-danger"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] text-soft">
            ${burn.spentUsd.toFixed(4)} / ${burn.capUsd.toFixed(2)}
          </span>
        </>
      )}
    </label>
  );
}

// ── #36 scheduled tasks + #24/T-13 armed toggle ──────────────────────────────
function TasksSection({ personaId }: { personaId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [prompt, setPrompt] = useState("");
  const [everyMinutes, setEveryMinutes] = useState("60");
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setTasks(await api.tasks(personaId));
  }
  useEffect(() => {
    let live = true;
    api.tasks(personaId).then((t) => live && setTasks(t));
    return () => {
      live = false;
    };
  }, [personaId]);

  async function create() {
    if (!prompt.trim() || !(Number(everyMinutes) > 0)) return;
    setError(null);
    try {
      await api.createTask(personaId, {
        prompt: prompt.trim(),
        everyMinutes: Number(everyMinutes),
        armed,
      });
      setPrompt("");
      setArmed(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card className="p-4">
      <SectionHead
        title="Scheduled tasks"
        hint="Recurring prompts run on an interval. Read-only unless armed (can't move money)."
      />
      <div className="mt-3 space-y-2">
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Summarize my vault balances"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            every
            <Input
              type="number"
              min="1"
              value={everyMinutes}
              onChange={(e) => setEveryMinutes(e.target.value)}
              className="w-20"
            />
            min
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={armed}
              onChange={(e) => setArmed(e.target.checked)}
            />
            armed (can move money)
          </label>
          <Button
            size="sm"
            onClick={() => void create()}
            disabled={!prompt.trim()}
          >
            Add task
          </Button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      <div className="mt-4 space-y-2">
        {tasks.length === 0 ? (
          <p className="text-sm text-soft">No scheduled tasks.</p>
        ) : (
          tasks.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border p-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm">{t.prompt}</div>
                <div className="text-xs text-soft">
                  every {Math.round(t.intervalMs / 60000)}m
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={t.armed ? "danger" : "default"}>
                  {t.armed ? "armed" : "read-only"}
                </Badge>
                <button
                  onClick={async () => {
                    await api.cancelTask(personaId, t.id);
                    await reload();
                  }}
                  className="text-xs text-soft hover:text-danger"
                >
                  cancel
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function SectionHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h3 className="font-serif text-base text-fg">{title}</h3>
      <p className="text-xs text-soft">{hint}</p>
    </div>
  );
}
