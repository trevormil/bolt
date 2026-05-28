import { useState, type ReactNode } from "react";
import { Button, Input } from "@vellum/ui";
import { api } from "./api.ts";

// Shared persona-creation form (#58) — ONE UX for every entry point: first-run
// onboarding (SetupFlow), the empty-state Welcome, and the in-app "+ new
// persona". Name is required; role/voice are optional soul hints. Each persona
// gets its own bb1 wallet + walled-off memory on creation.
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
  const [role, setRole] = useState("");
  const [voice, setVoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { persona } = await api.createPersona({
        name: name.trim(),
        role: role.trim() || undefined,
        voice: voice.trim() || undefined,
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
      <Field label="Role">
        <Input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="finance copilot"
        />
      </Field>
      <Field label="Voice">
        <Input
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          placeholder="terse, dry"
        />
      </Field>
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
