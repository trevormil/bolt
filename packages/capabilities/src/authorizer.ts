import type { CapabilityStore } from "./store.ts";

// The single enforcement point (#37): every gated local action (filesystem,
// cron, mcp, spend) passes through authorize() before it runs. Surfaces supply
// an `approve` callback (a terminal/web prompt) for "ask" decisions; with none
// wired it FAILS CLOSED (denies), so an action is never silently allowed.
export interface AuthAction {
  capability: string;
  target?: string;
  summary: string; // human-legible, shown in the approval prompt + ledger
}

// Thrown by authorizeOrThrow when a gated action is denied — lets the engine
// chokepoints (VaultService, TxManager) enforce capabilities so a direct call
// can't bypass the surface gates, while surfaces catch this to return a clean
// "denied" message rather than a 500.
export class CapabilityDeniedError extends Error {
  constructor(readonly action: AuthAction) {
    super(`denied: ${action.summary}`);
    this.name = "CapabilityDeniedError";
  }
}

export type Approver = (action: AuthAction) => boolean | Promise<boolean>;

// Minimal ledger surface (avoids a hard dep on @vellum/ledger here).
export interface AuthLedger {
  record(entry: {
    personaId: string;
    kind: "capability";
    summary: string;
    authority: string;
    meta?: Record<string, unknown>;
  }): unknown;
}

// Minimal observability hook — surfaces inject an emitter so capability
// decisions land on the per-persona event timeline (#42) without coupling
// @vellum/capabilities to @vellum/observability.
export interface AuthEventSink {
  emit(event: {
    personaId: string;
    kind: "capability";
    summary: string;
    ok: boolean;
    meta?: Record<string, unknown>;
  }): unknown;
}

export interface AuthorizerOptions {
  approve?: Approver; // prompt for "ask" decisions; default fail-closed (deny)
  ledger?: AuthLedger; // record every decision for the proof-of-action trail
  events?: AuthEventSink; // user-facing telemetry (#42); optional, no-op if absent
}

export class Authorizer {
  constructor(
    private readonly store: CapabilityStore,
    private readonly opts: AuthorizerOptions = {},
  ) {}

  /** Authorize a gated action. Records the outcome; returns whether to proceed. */
  async authorize(personaId: string, action: AuthAction): Promise<boolean> {
    const decision = this.store.decide(
      personaId,
      action.capability,
      action.target,
    );

    let allowed: boolean;
    let authority: string;
    if (decision === "allow") {
      allowed = true;
      authority = "grant";
    } else if (decision === "deny") {
      allowed = false;
      authority = "denied";
    } else {
      // "ask" — require explicit human approval; absent an approver, fail closed.
      allowed = this.opts.approve ? await this.opts.approve(action) : false;
      authority = allowed ? "human" : this.opts.approve ? "rejected" : "denied";
    }

    this.opts.ledger?.record({
      personaId,
      kind: "capability",
      summary: `${allowed ? "allowed" : "blocked"}: ${action.summary}`,
      authority,
      meta: {
        capability: action.capability,
        target: action.target,
        decision,
      },
    });
    this.opts.events?.emit({
      personaId,
      kind: "capability",
      summary: `${allowed ? "allowed" : "blocked"}: ${action.summary}`,
      ok: allowed,
      meta: {
        capability: action.capability,
        target: action.target,
        authority,
        decision,
      },
    });
    return allowed;
  }

  /** authorize(), but throw CapabilityDeniedError when blocked — for engine
   *  chokepoints that must hard-stop a denied action. */
  async authorizeOrThrow(personaId: string, action: AuthAction): Promise<void> {
    if (!(await this.authorize(personaId, action)))
      throw new CapabilityDeniedError(action);
  }
}
