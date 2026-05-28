import { Database } from "bun:sqlite";

// Capability/permission model (#37) — the trust spine for the local-first
// runtime. Local filesystem (#35), self-set cron (#36), MCP tools, and spend are
// far more powerful than a web wrapper; every such action is checked against
// per-persona grants. DEFAULT-DENY: nothing is permitted without an explicit
// grant.
//
// A capability is a dotted verb ("fs.read", "fs.write", "schedule", "spend",
// "mcp"). A grant optionally carries a SCOPE constraining the target:
//   - path capabilities (fs.*): scope is a root; the target path must be under it
//   - other capabilities: scope must equal the target (or be null = unscoped)
// mode: "allow" = standing grant (auto-allowed); "ask" = allowed only after the
// human approves each time.
export type CapabilityMode = "allow" | "ask";
export type Decision = "allow" | "ask" | "deny";

export interface Grant {
  personaId: string;
  capability: string;
  scope: string | null;
  mode: CapabilityMode;
}

interface Row {
  persona_id: string;
  capability: string;
  scope: string | null;
  mode: string;
}
const toGrant = (r: Row): Grant => ({
  personaId: r.persona_id,
  capability: r.capability,
  scope: r.scope,
  mode: r.mode as CapabilityMode,
});

// fs.* capabilities are path-scoped (prefix match); everything else is exact.
function scopeMatches(
  capability: string,
  grantScope: string | null,
  target: string | undefined,
): boolean {
  if (grantScope === null) return true; // unscoped grant covers any target
  if (target === undefined) return false; // scoped grant needs a target to check
  if (capability.startsWith("fs.")) {
    const root = grantScope.endsWith("/") ? grantScope : grantScope + "/";
    return target === grantScope || target.startsWith(root);
  }
  return target === grantScope;
}

export class CapabilityStore {
  private db: Database;

  constructor(dbPath = ":memory:") {
    this.db = new Database(dbPath);
    this.db.run(`CREATE TABLE IF NOT EXISTS capabilities (
      persona_id TEXT NOT NULL,
      capability TEXT NOT NULL,
      scope TEXT,
      mode TEXT NOT NULL DEFAULT 'ask',
      PRIMARY KEY (persona_id, capability, scope))`);
  }

  grant(g: Grant): void {
    this.db
      .query(
        `INSERT INTO capabilities (persona_id, capability, scope, mode)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(persona_id, capability, scope) DO UPDATE SET mode = excluded.mode`,
      )
      .run(g.personaId, g.capability, g.scope, g.mode);
  }

  revoke(
    personaId: string,
    capability: string,
    scope: string | null = null,
  ): void {
    this.db
      .query(
        "DELETE FROM capabilities WHERE persona_id = ? AND capability = ? AND scope IS ?",
      )
      .run(personaId, capability, scope);
  }

  list(personaId?: string): Grant[] {
    const rows = (
      personaId
        ? this.db
            .query("SELECT * FROM capabilities WHERE persona_id = ?")
            .all(personaId)
        : this.db.query("SELECT * FROM capabilities").all()
    ) as Row[];
    return rows.map(toGrant);
  }

  /**
   * The effective decision for (persona, capability, target), default-deny.
   * A matching "allow" grant wins; else a matching "ask"; else "deny".
   */
  decide(personaId: string, capability: string, target?: string): Decision {
    const matches = (
      this.db
        .query(
          "SELECT * FROM capabilities WHERE persona_id = ? AND capability = ?",
        )
        .all(personaId, capability) as Row[]
    ).filter((r) => scopeMatches(capability, r.scope, target));
    if (matches.some((r) => r.mode === "allow")) return "allow";
    if (matches.some((r) => r.mode === "ask")) return "ask";
    return "deny";
  }

  close(): void {
    this.db.close();
  }
}
