import { Database } from "bun:sqlite";
import { runAgent, type ToolInvoker, type ToolSpec } from "@vellum/agent";
import type { ChatMessage, Meter } from "@vellum/llm";
import {
  renderSoul,
  type Persona,
  type PersonaStore,
  type RetrievalHit,
} from "@vellum/persona";
import { createLogger } from "@vellum/shared";

const log = createLogger("router");

// Deterministic routing only. A message is bound to a persona by an explicit
// `/switch <id>` command or the conversation's stored binding — NEVER inferred
// by an LLM from the message body (audit M5: that is a compartment-leak +
// misroute-charges-wrong-wallet vector). The routing decision reads only the
// binding table + persona registry; it never touches persona memory.
export type RouteDecision =
  | { kind: "switch"; persona: Persona; reply: string }
  | { kind: "switch_failed"; reply: string }
  | { kind: "message"; persona: Persona };

export interface HandleResult {
  routed: RouteDecision["kind"];
  persona: Persona | null;
  reply: string;
  meters: Meter[];
}

// The per-persona dispatch step. Injectable so the orchestrator is testable
// without the network; the default runs the bounded agent loop (0005).
export type RunLoop = (input: {
  persona: Persona;
  messages: ChatMessage[];
  tools: ToolSpec[];
  invoke: ToolInvoker;
}) => Promise<{ text: string; meters: Meter[] }>;

const defaultRunLoop: RunLoop = async ({ messages, tools, invoke }) => {
  const run = await runAgent({ messages, tools, invoke });
  return { text: run.text, meters: run.meters };
};

const SWITCH = /^\/(?:switch|use)\s+(\S+)/i;

export interface OrchestratorOptions {
  defaultPersonaId: string;
  dbPath?: string; // routing/binding table (own table; not persona memory)
  maxDepth?: number; // dispatch depth bound (default 1 — no nested routing)
  recallK?: number; // memory hits injected into persona context (default 5)
}

export class Orchestrator {
  private store: PersonaStore;
  private db: Database;
  private defaultPersonaId: string;
  private maxDepth: number;
  private recallK: number;
  private runLoop: RunLoop;

  constructor(
    store: PersonaStore,
    opts: OrchestratorOptions,
    runLoop: RunLoop = defaultRunLoop,
  ) {
    this.store = store;
    this.defaultPersonaId = opts.defaultPersonaId;
    this.maxDepth = opts.maxDepth ?? 1;
    this.recallK = opts.recallK ?? 5;
    this.runLoop = runLoop;
    this.db = new Database(opts.dbPath ?? ":memory:");
    this.db.run(
      "CREATE TABLE IF NOT EXISTS routing (conversation_id TEXT PRIMARY KEY, persona_id TEXT NOT NULL, updated INTEGER NOT NULL)",
    );
  }

  private getBinding(conversationId: string): string | null {
    const row = this.db
      .query("SELECT persona_id FROM routing WHERE conversation_id = ?")
      .get(conversationId) as { persona_id: string } | null;
    return row?.persona_id ?? null;
  }
  private setBinding(conversationId: string, personaId: string): void {
    this.db
      .query(
        "INSERT INTO routing (conversation_id, persona_id, updated) VALUES (?, ?, ?) ON CONFLICT(conversation_id) DO UPDATE SET persona_id = ?, updated = ?",
      )
      .run(conversationId, personaId, Date.now(), personaId, Date.now());
  }

  /**
   * Deterministically resolve which persona a message belongs to. Pure of any
   * memory access — only the binding table and persona registry are consulted.
   */
  resolve(conversationId: string, message: string): RouteDecision {
    const m = message.trim().match(SWITCH);
    if (m) {
      const target = this.store.getPersona(m[1]!);
      if (!target) {
        const known = this.store
          .listPersonas()
          .map((p) => p.id)
          .join(", ");
        return {
          kind: "switch_failed",
          reply: `No persona "${m[1]}". Available: ${known || "(none)"}.`,
        };
      }
      this.setBinding(conversationId, target.id);
      log.info(`switch · ${conversationId} → ${target.id}`);
      return {
        kind: "switch",
        persona: target,
        reply: `Switched to ${target.name}.`,
      };
    }

    const boundId = this.getBinding(conversationId) ?? this.defaultPersonaId;
    const persona =
      this.store.getPersona(boundId) ??
      this.store.getPersona(this.defaultPersonaId);
    if (!persona)
      throw new Error(
        `no persona resolvable (default "${this.defaultPersonaId}" missing)`,
      );
    if (boundId !== persona.id) this.setBinding(conversationId, persona.id);
    return { kind: "message", persona };
  }

  /**
   * Route a message and dispatch it to the resolved persona's agent loop. The
   * persona reasons ONLY over its own memory: we recall from `persona.id` and
   * inject just that into the system context. Bounded to `maxDepth` hops — there
   * is no path for a persona to trigger another persona (no routing tool).
   */
  async handle(
    conversationId: string,
    message: string,
    opts: { tools?: ToolSpec[]; invoke?: ToolInvoker } = {},
    depth = 1,
  ): Promise<HandleResult> {
    if (depth > this.maxDepth) {
      throw new Error(
        `dispatch depth ${depth} exceeds maxDepth ${this.maxDepth}`,
      );
    }
    const dec = this.resolve(conversationId, message);
    if (dec.kind !== "message") {
      return {
        routed: dec.kind,
        persona: dec.kind === "switch" ? dec.persona : null,
        reply: dec.reply,
        meters: [],
      };
    }

    const recalled = await this.store.recall(
      dec.persona.id,
      message,
      this.recallK,
    );
    const messages = buildContext(dec.persona, recalled, message);
    const { text, meters } = await this.runLoop({
      persona: dec.persona,
      messages,
      tools: opts.tools ?? [],
      invoke: opts.invoke ?? (async () => ""),
    });
    return { routed: "message", persona: dec.persona, reply: text, meters };
  }

  close(): void {
    this.db.close();
  }
}

// Build the persona's system context: its SOUL plus ONLY its own recalled
// memory. No other persona's data can enter here — recall was persona-scoped.
function buildContext(
  persona: Persona,
  recalled: RetrievalHit[],
  message: string,
): ChatMessage[] {
  let system = renderSoul(persona.soul);
  if (recalled.length) {
    const mem = recalled.map((h) => `- ${h.record.text}`).join("\n");
    system += `\n\nRelevant memory (yours only):\n${mem}`;
  }
  return [
    { role: "system", content: system },
    { role: "user", content: message },
  ];
}
