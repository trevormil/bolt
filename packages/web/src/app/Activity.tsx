import { useEffect, useMemo, useState } from "react";
import { Badge, Card, Icon } from "@vellum/ui";
import {
  api,
  type ObservabilityResponse,
  type UnifiedRow,
  type EventSummaryWindow,
} from "./api.ts";

// Unified observability (#95) — ONE timeline that merges the operational event
// store (latency / errors / every chat + tool + capability) with the
// proof-of-action ledger (authority + on-chain txHash). Replaces the separate
// Activity + Ledger screens: ops "what's it doing + how fast" and money-truth
// "who authorized + which tx" now live in one source-tagged feed with filters,
// per-row detail, window rollups, and a budget burn-down.

type Win = "24h" | "7d" | "30d";
type SourceFilter = "all" | "event" | "ledger";

export function ActivityView({ personaId }: { personaId: string }) {
  const [data, setData] = useState<ObservabilityResponse | null>(null);
  const [win, setWin] = useState<Win>("24h");
  const [source, setSource] = useState<SourceFilter>("all");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [kind, setKind] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);

  async function reload() {
    setData(await api.observability(personaId, 200));
  }
  useEffect(() => {
    let live = true;
    api.observability(personaId, 200).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [personaId]);

  const window: EventSummaryWindow | undefined =
    win === "24h"
      ? data?.summary.last24h
      : win === "7d"
        ? data?.summary.last7d
        : data?.summary.last30d;

  const kinds = useMemo(
    () => Array.from(new Set((data?.rows ?? []).map((r) => r.kind))).sort(),
    [data],
  );

  const rows = (data?.rows ?? []).filter(
    (r) =>
      (source === "all" || r.source === source) &&
      (!errorsOnly || r.ok === false) &&
      (kind === "all" || r.kind === kind),
  );

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-serif text-xl">Activity</h3>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-border text-xs">
            {(["24h", "7d", "30d"] as Win[]).map((w) => (
              <button
                key={w}
                onClick={() => setWin(w)}
                className={
                  "px-2.5 py-1 " +
                  (win === w
                    ? "bg-accent/15 text-accent"
                    : "text-soft hover:text-fg")
                }
              >
                {w}
              </button>
            ))}
          </div>
          <button
            onClick={() => void reload()}
            className="text-xs text-soft hover:text-fg"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Events" value={String(window?.events ?? 0)} />
        <Stat label="Cost" value={`$${(window?.costUsd ?? 0).toFixed(4)}`} />
        <Stat label="Tokens" value={(window?.tokens ?? 0).toLocaleString()} />
        <Stat
          label="Errors"
          value={String(window?.errors ?? 0)}
          danger={(window?.errors ?? 0) > 0}
        />
      </div>

      {data && <Budget budget={data.budget} />}

      {data && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-soft">
          {Object.keys(data.latencyByKind).length > 0 && (
            <span>
              latency:{" "}
              {Object.entries(data.latencyByKind)
                .map(([k, ms]) => `${k} ${ms}ms`)
                .join(" · ")}
            </span>
          )}
          {Object.keys(data.summary.byKind).length > 0 && (
            <span>
              by kind:{" "}
              {Object.entries(data.summary.byKind)
                .map(([k, n]) => `${k}×${n}`)
                .join(" · ")}
            </span>
          )}
        </div>
      )}

      {/* Filter bar */}
      <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
        {(["all", "event", "ledger"] as SourceFilter[]).map((s) => (
          <Chip key={s} on={source === s} onClick={() => setSource(s)}>
            {s === "all" ? "all sources" : s}
          </Chip>
        ))}
        <Chip on={errorsOnly} onClick={() => setErrorsOnly((v) => !v)}>
          errors only
        </Chip>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="rounded-lg border border-border bg-base px-2 py-1 text-soft"
        >
          <option value="all">all kinds</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-soft">
            No activity matches — chat, tool calls, spends, and capability
            checks land here.
          </p>
        ) : (
          rows.map((r) => (
            <Row
              key={r.id}
              row={r}
              open={open === r.id}
              onToggle={() => setOpen(open === r.id ? null : r.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function Row({
  row,
  open,
  onToggle,
}: {
  row: UnifiedRow;
  open: boolean;
  onToggle: () => void;
}) {
  const tone = row.ok === false ? "danger" : "accent";
  const metaEntries = Object.entries(row.meta ?? {});
  return (
    <Card className="p-3">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <Badge tone={tone}>{row.kind}</Badge>
          <span
            className="font-mono text-[9px] uppercase tracking-[0.2em] text-soft"
            title={
              row.source === "ledger" ? "proof-of-action ledger" : "event store"
            }
          >
            {row.source === "ledger" ? "settled" : "ops"}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm">{row.summary}</div>
            <div className="text-xs text-soft">
              {new Date(row.ts).toLocaleString()}
              {row.authority && (
                <span className="text-muted"> · by {row.authority}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-right text-xs text-muted">
          <div>
            {row.latencyMs ? <div>{row.latencyMs} ms</div> : null}
            {row.costUsd > 0 && <div>${row.costUsd.toFixed(6)}</div>}
            {row.tokens > 0 && <div>{row.tokens} tok</div>}
            {row.txHash && (
              <div className="flex items-center justify-end gap-1 font-mono text-soft">
                <Icon name="link" size={11} />
                {row.txHash.slice(0, 8)}
              </div>
            )}
          </div>
          <Icon name={open ? "chevDown" : "chevRight"} size={14} />
        </div>
      </button>

      {open && (
        <div className="mt-3 border-t border-border pt-3 text-xs text-soft">
          <Detail k="source" v={row.source} />
          {row.ok !== undefined && <Detail k="ok" v={String(row.ok)} />}
          {row.authority && <Detail k="authority" v={row.authority} />}
          {row.txHash && <Detail k="tx" v={row.txHash} mono />}
          {row.latencyMs ? (
            <Detail k="latency" v={`${row.latencyMs} ms`} />
          ) : null}
          {row.costUsd > 0 && (
            <Detail k="cost" v={`$${row.costUsd.toFixed(6)}`} />
          )}
          {row.tokens > 0 && <Detail k="tokens" v={String(row.tokens)} />}
          {metaEntries.map(([k, v]) => (
            <Detail key={k} k={k} v={JSON.stringify(v)} mono />
          ))}
        </div>
      )}
    </Card>
  );
}

function Detail({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="w-24 shrink-0 text-muted">{k}</span>
      <span
        className={"min-w-0 break-all text-fg " + (mono ? "font-mono" : "")}
      >
        {v}
      </span>
    </div>
  );
}

function Budget({ budget }: { budget: ObservabilityResponse["budget"] }) {
  const { llm, burndown } = budget;
  const pct =
    llm.capUsd > 0 ? Math.min(100, (llm.spentUsd / llm.capUsd) * 100) : 0;
  return (
    <div className="mt-3 rounded-lg border border-border bg-base/40 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-soft">LLM budget · 24h</span>
        <span className={llm.ok ? "text-muted" : "text-danger"}>
          ${llm.spentUsd.toFixed(4)} / ${llm.capUsd.toFixed(2)}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className={"h-full " + (llm.ok ? "bg-accent" : "bg-danger")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 text-[11px] text-soft">
        burn-down: at this rate ≈{" "}
        <span className={burndown.willBreach ? "text-danger" : "text-fg"}>
          ${burndown.projectedUsd.toFixed(2)}/mo
        </span>
        {burndown.capUsd !== undefined && (
          <span className="text-muted">
            {" "}
            vs ${burndown.capUsd.toFixed(2)} cap
            {burndown.willBreach ? " — over" : ""}
          </span>
        )}
      </div>
    </div>
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

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-full border px-2.5 py-1 " +
        (on
          ? "border-accent/40 bg-accent/15 text-accent"
          : "border-border text-soft hover:text-fg")
      }
    >
      {children}
    </button>
  );
}
