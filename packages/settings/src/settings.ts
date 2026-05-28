import type { z } from "zod";
import type { Resolved, SettingsStore } from "./store.ts";

// A typed setting definition (#40): a key + a zod schema + a built-in default.
// Features (#43 model, #44 budgets) define their settings once and get a typed,
// validated accessor over the generic store — no bespoke per-setting plumbing.
export interface SettingDef<T> {
  readonly key: string;
  /** Resolve persona → global → default, validating the stored value. */
  get(store: SettingsStore, personaId: string): Resolved<T>;
  /** Set the global default (validated). */
  setGlobal(store: SettingsStore, value: T): void;
  /** Override for one persona (validated). */
  setPersona(store: SettingsStore, personaId: string, value: T): void;
  /** Reset a persona to inherit the global/default. */
  reset(store: SettingsStore, personaId: string): void;
}

export function defineSetting<T>(
  key: string,
  schema: z.ZodType<T>,
  defaultValue: T,
): SettingDef<T> {
  // Validate a stored value; fall back to the default if it's somehow malformed
  // (schema drift) rather than throwing in a hot path.
  const safe = (raw: Resolved<unknown>): Resolved<T> => {
    const parsed = schema.safeParse(raw.value);
    return parsed.success
      ? { value: parsed.data, source: raw.source }
      : { value: defaultValue, source: "default" };
  };
  return {
    key,
    get: (store, personaId) =>
      safe(store.resolve(personaId, key, defaultValue)),
    setGlobal: (store, value) => store.setGlobal(key, schema.parse(value)),
    setPersona: (store, personaId, value) =>
      store.set(personaId, key, schema.parse(value)),
    reset: (store, personaId) => store.clear(personaId, key),
  };
}
