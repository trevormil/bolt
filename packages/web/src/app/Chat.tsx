import { useRef, useState } from "react";
import { Button, Icon, Input, cn } from "@vellum/ui";
import { api, type Persona } from "./api.ts";

interface Msg {
  role: "user" | "agent";
  text: string;
  costUsd?: number;
  tokens?: number;
}

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
      setMsgs((m) => [
        ...m,
        {
          role: "agent",
          text: res.reply,
          costUsd: res.costUsd,
          tokens: res.tokens,
        },
      ]);
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
                "max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm",
                m.role === "user"
                  ? "bg-accent text-accent-fg"
                  : "border border-border bg-surface text-fg",
              )}
            >
              <div className="whitespace-pre-wrap">{m.text}</div>
              {m.role === "agent" && m.costUsd !== undefined && (
                <div className="mt-1.5 flex items-center gap-2 text-xs text-soft">
                  <Icon name="zap" size={12} />${m.costUsd.toFixed(6)} ·{" "}
                  {m.tokens} tok
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="text-sm text-soft">{persona.name} is thinking…</div>
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
