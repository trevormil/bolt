import { useEffect, useState } from "react";
import { Badge, Card } from "@vellum/ui";
import {
  api,
  type EventItem,
  type EventSummary,
  type EventSummaryWindow,
} from "./api.ts";

// #42 observability — the user-facing activity timeline + per-window rollups.
// Distinct from the proof-of-action ledger (Ledger tab): this captures latency,
// every chat turn, tool/capability events, errors — the "what's it doing + how
// fast + what's it costing" view.
export function ActivityView({ personaId }: { personaId: string }) {
  const [summary, setSummary] = useState<EventSummary | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);

  async function reload() {
    const d = await api.events(personaId, 100);
    setSummary(d.summary);
    setEvents(d.events);
  }
  useEffect(() => {
    let live = true;
    api.events(personaId, 100).then((d) => {
      if (!live) return;
      setSummary(d.summary);
      setEvents(d.events);
    });
    return () => {
      live = false;
    };
  }, [personaId]);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-serif text-xl">
          Activity{" "}
          <span className="text-sm font-sans text-soft">· last 24h</span>
        </h3>
        <button
          onClick={() => void reload()}
          className="text-xs text-soft hover:text-fg"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Events" value={String(summary?.last24h.events ?? 0)} />
        <Stat
          label="Cost"
          value={`$${(summary?.last24h.costUsd ?? 0).toFixed(4)}`}
        />
        <Stat
          label="Tokens"
          value={(summary?.last24h.tokens ?? 0).toLocaleString()}
        />
        <Stat
          label="Errors"
          value={String(summary?.last24h.errors ?? 0)}
          danger={(summary?.last24h.errors ?? 0) > 0}
        />
      </div>

      {summary && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-soft">
          <Window label="7d" w={summary.last7d} />
          <Window label="30d" w={summary.last30d} />
          {Object.keys(summary.byKind).length > 0 && (
            <span>
              by kind:{" "}
              {Object.entries(summary.byKind)
                .map(([k, n]) => `${k}×${n}`)
                .join(" · ")}
            </span>
          )}
        </div>
      )}

      <h3 className="mb-3 mt-6 font-serif text-lg">Timeline</h3>
      {events.length === 0 ? (
        <p className="text-sm text-soft">
          No activity yet — chat, tool calls, and capability checks land here.
        </p>
      ) : (
        <div className="space-y-2">
          {events.map((e) => (
            <Card
              key={e.id}
              className="flex items-center justify-between gap-3 p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Badge tone={e.ok ? "accent" : "danger"}>{e.kind}</Badge>
                <div className="min-w-0">
                  <div className="truncate text-sm">{e.summary}</div>
                  <div className="text-xs text-soft">
                    {new Date(e.ts).toLocaleTimeString()}
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-right text-xs text-muted">
                {e.latencyMs > 0 && <div>{e.latencyMs} ms</div>}
                {e.costUsd > 0 && <div>${e.costUsd.toFixed(6)}</div>}
                {e.tokens > 0 && <div>{e.tokens} tok</div>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Window({ label, w }: { label: string; w: EventSummaryWindow }) {
  return (
    <span>
      {label}: {w.events} events · ${w.costUsd.toFixed(4)} · {w.tokens} tok
      {w.errors > 0 && <span className="text-danger"> · {w.errors} err</span>}
    </span>
  );
}

function Stat({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-soft">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-2xl ${danger ? "text-danger" : "text-fg"}`}
      >
        {value}
      </div>
    </Card>
  );
}
