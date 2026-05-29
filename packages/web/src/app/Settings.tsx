import { useEffect, useState } from "react";
import { Badge, Button, Card, Icon, Input } from "@vellum/ui";
import { api, type BudgetResponse, type Resolved } from "./api.ts";

export function SettingsView({ personaId }: { personaId: string }) {
  return (
    <div className="h-full space-y-6 overflow-y-auto p-6">
      <LlmKeySection />
      <TelegramSection />
      <ModelSection personaId={personaId} />
      <BudgetSection personaId={personaId} />
      <RecoverySection />
    </div>
  );
}

// ── #60 OpenRouter key — set / change / reset (global, validated) ────────────
// The key powers every persona's LLM. Required at onboarding; this lets the user
// rotate it. The new key is health-checked server-side before it's persisted.
function LlmKeySection() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .setupStatus()
      .then((s) => live && setConfigured(s.hasLlmKey))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  async function save() {
    if (!key.trim()) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.setOpenRouterKey(key.trim());
      setKey("");
      setConfigured(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <SectionHead
        title="OpenRouter API key"
        hint="Powers every persona's LLM. Validated before it's saved; a new key replaces the old one."
      />
      <p className="mt-2 text-xs text-soft">
        Status:{" "}
        <span className={configured ? "text-accent" : "text-danger"}>
          {configured == null
            ? "…"
            : configured
              ? "configured"
              : "not set — chat is disabled"}
        </span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && key.trim() && void save()}
          placeholder="sk-or-…"
          className="min-w-[16rem] flex-1"
        />
        <Button
          size="sm"
          onClick={() => void save()}
          disabled={busy || !key.trim()}
        >
          {busy
            ? "Verifying…"
            : saved
              ? "Saved"
              : configured
                ? "Replace"
                : "Save"}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}

// ── #63 Telegram remote control — set / rotate / disable (validated via getMe) ─
// Telegram is the agent's remote entrypoint (the bot polls OUT; nothing is
// exposed on this machine). The token is health-checked via getMe before it's
// saved, and takes effect on the next daemon restart. This is the post-onboarding
// home for enabling/rotating Telegram (onboarding only offers it once).
function TelegramSection() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [busy, setBusy] = useState<"save" | "disable" | null>(null);
  const [connected, setConnected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .setupStatus()
      .then((s) => live && setConfigured(!!s.telegramConfigured))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  async function save() {
    if (!token.trim()) return;
    setBusy("save");
    setError(null);
    setConnected(null);
    try {
      const r = await api.setTelegramToken({
        token: token.trim(),
        ...(chatId.trim() ? { principalChatId: chatId.trim() } : {}),
      });
      setToken("");
      setChatId("");
      setConfigured(true);
      setConnected(r.username ? `@${r.username}` : "connected");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function disable() {
    setBusy("disable");
    setError(null);
    setConnected(null);
    try {
      await api.setTelegramToken({ token: "" });
      setConfigured(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-4">
      <SectionHead
        title="Telegram remote control"
        hint="Control Bolt from anywhere — the bot polls out to Telegram, so nothing is exposed on this machine. The token is verified (getMe) before it's saved."
      />
      <p className="mt-2 text-xs text-soft">
        Status:{" "}
        <span className={configured ? "text-accent" : "text-muted"}>
          {configured == null ? "…" : configured ? "connected" : "not set"}
        </span>
        {connected && (
          <span className="text-accent"> · connected as {connected}</span>
        )}
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-soft">
        <li>
          In Telegram, message <span className="text-fg">@BotFather</span> and
          send <span className="font-mono text-fg">/newbot</span>.
        </li>
        <li>
          Pick a name + a <span className="font-mono text-fg">…_bot</span>{" "}
          username; copy the token it returns.
        </li>
        <li>
          Paste it below, then message your bot{" "}
          <span className="font-mono text-fg">/start</span> to claim ownership
          (or set your chat id) — so a stranger can't drive your agent.
        </li>
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="bot token (123456:ABC-…)"
          className="min-w-[16rem] flex-1"
        />
        <Input
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder="chat id (optional)"
          className="w-36"
        />
        <Button
          size="sm"
          onClick={() => void save()}
          disabled={busy !== null || !token.trim()}
        >
          {busy === "save" ? "Verifying…" : configured ? "Replace" : "Connect"}
        </Button>
        {configured && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void disable()}
            disabled={busy !== null}
          >
            {busy === "disable" ? "…" : "Disable"}
          </Button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <p className="mt-3 text-xs leading-relaxed text-soft">
        Once connected (takes effect on the next daemon restart) you can message
        the bot directly, or use{" "}
        <span className="font-mono text-fg">
          /personas /switch /vaults /balance /ledger /spend /help
        </span>
        . It's a full remote control — the same capability gates apply as in the
        app.
      </p>
    </Card>
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

function SectionHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h3 className="font-serif text-base text-fg">{title}</h3>
      <p className="text-xs text-soft">{hint}</p>
    </div>
  );
}
