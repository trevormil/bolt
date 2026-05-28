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

export interface AuthorizerOptions {
  approve?: Approver; // prompt for "ask" decisions; default fail-closed (deny)
  ledger?: AuthLedger; // record every decision for the proof-of-action trail
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
    return allowed;
  }
}
