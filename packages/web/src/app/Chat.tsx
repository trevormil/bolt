import { useEffect, useRef, useState } from "react";
import { Button, Icon, Input, cn } from "@vellum/ui";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, type Conversation, type Persona } from "./api.ts";
import { useWallet } from "./wallet-context.tsx";

interface Msg {
  role: "user" | "agent";
  text: string;
}

// Markdown renderers for assistant bubbles (#69) — Aurum-styled, no raw HTML
// (react-markdown's default; rehype-raw is deliberately NOT enabled). Links open
// in a new tab; fenced code gets a bordered block, inline code a subtle chip.
const MD: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent underline"
    >
      {children}
    </a>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg border border-border bg-base p-3 font-mono text-xs">
      {children}
    </pre>
  ),
  code: ({ className, children }) =>
    className?.startsWith("language-") ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.85em]">
        {children}
      </code>
    ),
  ul: ({ children }) => (
    <ul className="my-1.5 list-disc space-y-0.5 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1.5 list-decimal space-y-0.5 pl-5">{children}</ol>
  ),
  p: ({ children }) => <p className="my-1.5">{children}</p>,
};

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Per-persona chat with multiple sessions (#72). App remounts this per persona
// (key={persona.id}), so all session state is naturally scoped to one persona —
// no cross-compartment bleed. The transcript is persisted server-side, so it
// survives reload (unlike the old in-memory single thread).
export function Chat({ persona }: { persona: Persona }) {
  // The connected human wallet (#73) — when present, sent with each turn so the
  // agent knows "my wallet". A public address; nothing secret leaves the browser.
  const { wallet } = useWallet();
  const [sessions, setSessions] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Load this persona's sessions on mount; select the most-recent one.
  useEffect(() => {
    let live = true;
    api
      .listConversations(persona.id)
      .then((list) => {
        if (!live) return;
        setSessions(list);
        setActiveId((cur) => cur ?? list[0]?.id ?? null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [persona.id]);

  // Load the active session's transcript whenever the selection changes.
  useEffect(() => {
    if (!activeId) {
      setMsgs([]);
      return;
    }
    let live = true;
    api
      .conversationMessages(persona.id, activeId)
      .then((list) => {
        if (live) setMsgs(list.map((m) => ({ role: m.role, text: m.text })));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [activeId, persona.id]);

  const refreshSessions = () =>
    api
      .listConversations(persona.id)
      .then(setSessions)
      .catch(() => {});

  async function newChat() {
    setError(null);
    try {
      const c = await api.createConversation(persona.id);
      setSessions((s) => [c, ...s]);
      setActiveId(c.id);
      setMsgs([]);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    // Lazily create a session on the first send so we never spawn empty chats.
    let cid = activeId;
    if (!cid) {
      try {
        const c = await api.createConversation(persona.id);
        setSessions((s) => [c, ...s]);
        setActiveId(c.id);
        cid = c.id;
      } catch (e) {
        setError(errMsg(e));
        return;
      }
    }
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const res = await api.chat({
        conversationId: cid,
        personaId: persona.id,
        message: text,
        // Cost/tokens come back + are recorded server-side, but are intentionally
        // NOT shown in the direct chat — that lives in Activity / Ledger.
        ...(wallet ? { humanAddress: wallet.address } : {}),
      });
      setMsgs((m) => [...m, { role: "agent", text: res.reply }]);
      void refreshSessions(); // pick up the auto-title + most-recent ordering
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
      requestAnimationFrame(() =>
        endRef.current?.scrollIntoView({ behavior: "smooth" }),
      );
    }
  }

  async function commitRename(id: string) {
    const t = draftTitle.trim();
    setEditingId(null);
    if (!t) return;
    try {
      const updated = await api.renameConversation(persona.id, id, t);
      setSessions((s) => s.map((c) => (c.id === id ? updated : c)));
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function removeChat(id: string) {
    if (!confirm("Delete this conversation? Its history is removed.")) return;
    try {
      await api.deleteConversation(persona.id, id);
      setSessions((s) => {
        const next = s.filter((c) => c.id !== id);
        if (activeId === id) setActiveId(next[0]?.id ?? null);
        return next;
      });
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Session rail — the list of conversations under this persona. */}
      <div className="flex w-48 shrink-0 flex-col border-r border-border bg-surface/50">
        <div className="flex items-center justify-between px-3 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-soft">
            Chats
          </span>
          <button
            onClick={() => void newChat()}
            title="New chat"
            className="rounded-md p-1 text-soft transition-colors hover:bg-surface-3 hover:text-fg"
          >
            <Icon name="plus" size={14} />
          </button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {sessions.length === 0 && (
            <p className="px-2 py-2 text-xs leading-relaxed text-soft">
              No chats yet — send a message to start one.
            </p>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={cn(
                "group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors",
                s.id === activeId
                  ? "border border-border-gold bg-accent-soft/40 text-fg"
                  : "border border-transparent text-muted hover:bg-surface-3/50",
              )}
            >
              {editingId === s.id ? (
                <input
                  autoFocus
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onBlur={() => void commitRename(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void commitRename(s.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="w-full rounded bg-base px-1 py-0.5 text-sm text-fg outline-none ring-1 ring-border-gold"
                />
              ) : (
                <>
                  <button
                    onClick={() => setActiveId(s.id)}
                    onDoubleClick={() => {
                      setEditingId(s.id);
                      setDraftTitle(s.title);
                    }}
                    title={`${s.title} — double-click to rename`}
                    className="min-w-0 flex-1 truncate text-left"
                  >
                    {s.title}
                  </button>
                  <button
                    onClick={() => void removeChat(s.id)}
                    title="Delete chat"
                    className="hidden shrink-0 text-soft hover:text-danger group-hover:block"
                  >
                    <Icon name="trash" size={12} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Conversation pane. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {msgs.length === 0 && (
            <p className="mt-10 text-center text-sm text-soft">
              Talk to {persona.name}. It reasons only over its own walled
              memory.
            </p>
          )}
          {msgs.map((m, i) => (
            <div
              key={i}
              className={cn(
                "flex",
                m.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                  m.role === "user"
                    ? "rounded-[18px] rounded-br-md bg-gold font-medium text-accent-fg"
                    : "rounded-[18px] rounded-bl-md border border-border bg-surface-2 text-fg",
                )}
              >
                {m.role === "user" ? (
                  <div className="whitespace-pre-wrap">{m.text}</div>
                ) : (
                  <div className="[&>:first-child]:mt-0 [&>:last-child]:mb-0">
                    <Markdown remarkPlugins={[remarkGfm]} components={MD}>
                      {m.text}
                    </Markdown>
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-soft">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              {persona.name} is thinking…
            </div>
          )}
          {error && <div className="text-sm text-danger">{error}</div>}
          <div ref={endRef} />
        </div>
        <div className="flex items-center gap-2 border-t border-border p-4">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={`Message ${persona.name}…`}
            disabled={busy}
          />
          <Button onClick={send} disabled={busy || !input.trim()}>
            <Icon name="send" size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
