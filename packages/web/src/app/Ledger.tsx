import { useEffect, useState } from "react";
import { Badge, Card, Icon } from "@vellum/ui";
import { api, type LedgerEntry, type LedgerSummary } from "./api.ts";

type Budget = Awaited<ReturnType<typeof api.budget>>;

export function LedgerView({ personaId }: { personaId: string }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);

  useEffect(() => {
    let live = true;
    api.ledger(personaId).then((d) => {
      if (!live) return;
      setEntries(d.entries);
      setSummary(d.summary);
    });
    api.budget(personaId).then((b) => live && setBudget(b));
    return () => {
      live = false;
    };
  }, [personaId]);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="grid grid-cols-3 gap-3">
        <Stat
          label="Spend (LLM)"
          value={`$${(summary?.totalCostUsd ?? 0).toFixed(4)}`}
        />
        <Stat
          label="Tokens"
          value={(summary?.totalTokens ?? 0).toLocaleString()}
        />
        <Stat label="Actions" value={String(summary?.entries ?? 0)} />
      </div>

      {budget && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-soft">
          <span>
            LLM budget:{" "}
            <span className={budget.llm.ok ? "text-muted" : "text-danger"}>
              ${budget.llm.spentUsd.toFixed(4)} / $
              {budget.llm.capUsd.toFixed(2)} (24h)
            </span>
          </span>
        </div>
      )}

      <h3 className="mb-3 mt-6 font-serif text-lg">Proof-of-action ledger</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-soft">
          No actions yet — every tool call, spend, and message lands here.
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <Card
              key={e.id}
              className="flex items-center justify-between gap-3 p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Badge tone={e.kind === "spend" ? "danger" : "accent"}>
                  {e.kind}
                </Badge>
                <div className="min-w-0">
                  <div className="truncate text-sm">{e.summary}</div>
                  <div className="text-xs text-soft">
                    by {e.authority} · {new Date(e.ts).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-right text-xs text-muted">
                {e.costUsd > 0 && <div>${e.costUsd.toFixed(6)}</div>}
                {e.tokens > 0 && <div>{e.tokens} tok</div>}
                {e.txHash && (
                  <div className="flex items-center gap-1 font-mono text-soft">
                    <Icon name="link" size={11} />
                    {e.txHash.slice(0, 8)}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-soft">
        {label}
      </div>
      <div className="mt-1 font-mono text-2xl text-fg">{value}</div>
    </Card>
  );
}
