import { useState, type ReactNode } from "react";
import { Button, Input } from "@vellum/ui";
import { api } from "./api.ts";

// Shared persona-creation form (#58) — ONE UX for every entry point: first-run
// onboarding (SetupFlow), the empty-state Welcome, and the in-app "+ new
// persona". Name is required; the PERSONA.md instructions (#87) are an optional
// freeform doc appended to every request (editable later in Settings). Each
// persona gets its own bb1 wallet + walled-off memory on creation.
const INSTRUCTIONS_PLACEHOLDER = `# Who you are
A concise, friendly assistant.

## How to act
- Keep replies short and plain-English.
- Always confirm anything that moves money.`;

export function PersonaForm({
  submitLabel = "Create persona",
  onCreated,
  onCancel,
  autoFocus = true,
}: {
  submitLabel?: string;
  onCreated: (id: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { persona } = await api.createPersona({
        name: name.trim(),
        instructions: instructions.trim() || undefined,
      });
      onCreated(persona.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Atlas"
          autoFocus={autoFocus}
        />
      </Field>
      <Field label="PERSONA.md — instructions (optional)">
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={INSTRUCTIONS_PLACEHOLDER}
          rows={6}
          className="w-full resize-y rounded-lg border border-border bg-base px-3 py-2 font-mono text-xs leading-relaxed text-fg outline-none placeholder:text-soft focus:border-border-gold focus:ring-1 focus:ring-border-gold"
        />
      </Field>
      <p className="text-[11px] leading-relaxed text-soft">
        Markdown appended to every request — like a CLAUDE.md. Leave blank for a
        sensible default; edit it anytime in Settings.
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button onClick={submit} disabled={busy || !name.trim()}>
          {busy ? "Creating…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-soft">
        {label}
      </span>
      {children}
    </label>
  );
}
