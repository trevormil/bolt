import { Database } from "bun:sqlite";

// Per-persona settings framework (#40). Every customizable setting (#41 markdown,
// #43 model, #44 budgets) resolves the same way: a per-persona override wins,
// else the global default, else the built-in default. The store is a generic
// JSON KV at two scopes; typed accessors (settings.ts) layer validation on top.
// Persisted in ~/.vellum so the CLI, daemon, and web share one config.

export const GLOBAL = "global"; // reserved scope id for global defaults

export type SettingSource = "persona" | "global" | "default";
export interface Resolved<T> {
  value: T;
  source: SettingSource;
}

export class SettingsStore {
  private db: Database;

  constructor(dbPath = ":memory:") {
    this.db = new Database(dbPath);
    this.db.run(`CREATE TABLE IF NOT EXISTS settings (
      scope TEXT NOT NULL,
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      PRIMARY KEY (scope, key))`);
  }

  /** Set a value at a scope ("global" or a personaId). */
  set(scope: string, key: string, value: unknown): void {
    this.db
      .query(
        `INSERT INTO settings (scope, key, value_json) VALUES (?, ?, ?)
         ON CONFLICT(scope, key) DO UPDATE SET value_json = excluded.value_json`,
      )
      .run(scope, key, JSON.stringify(value));
  }

  setGlobal(key: string, value: unknown): void {
    this.set(GLOBAL, key, value);
  }

  /** Remove a value at a scope (a persona then inherits the global/default). */
  clear(scope: string, key: string): void {
    this.db
      .query("DELETE FROM settings WHERE scope = ? AND key = ?")
      .run(scope, key);
  }

  /** Raw value at a single scope, or undefined if unset. */
  getRaw(scope: string, key: string): unknown {
    const r = this.db
      .query("SELECT value_json FROM settings WHERE scope = ? AND key = ?")
      .get(scope, key) as { value_json: string } | null;
    return r ? (JSON.parse(r.value_json) as unknown) : undefined;
  }

  /**
   * Resolve a key for a persona: persona override → global → built-in default,
   * with provenance so the UI can show "inherited" vs "overridden".
   */
  resolve<T>(personaId: string, key: string, builtinDefault: T): Resolved<T> {
    const p = this.getRaw(personaId, key);
    if (p !== undefined) return { value: p as T, source: "persona" };
    const g = this.getRaw(GLOBAL, key);
    if (g !== undefined) return { value: g as T, source: "global" };
    return { value: builtinDefault, source: "default" };
  }

  close(): void {
    this.db.close();
  }
}
