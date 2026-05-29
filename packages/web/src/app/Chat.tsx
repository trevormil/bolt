import { useRef, useState } from "react";
import { Button, Icon, Input, cn } from "@vellum/ui";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, type Persona } from "./api.ts";

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

export function Chat({ persona }: { persona: Persona }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationId = `web:${persona.id}`;
  const endRef = useRef<HTMLDivElement>(null);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const res = await api.chat({
        conversationId,
        personaId: persona.id,
        message: text,
      });
      // Cost/tokens still come back on the response (and are recorded to the
      // ledger server-side) but are intentionally NOT shown in the direct chat —
      // that lives in the behind-the-scenes Activity / Ledger views.
      setMsgs((m) => [...m, { role: "agent", text: res.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      requestAnimationFrame(() =>
        endRef.current?.scrollIntoView({ behavior: "smooth" }),
      );
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {msgs.length === 0 && (
          <p className="mt-10 text-center text-sm text-soft">
            Talk to {persona.name}. It reasons only over its own walled memory.
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
  );
}
