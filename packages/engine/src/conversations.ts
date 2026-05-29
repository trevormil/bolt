import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";

// Per-persona chat sessions (#72) — the UI/history layer. This is the verbatim
// transcript store: a session list + the literal turns, so the web UI can render
// chat history that survives reload and let the user keep several conversations
// per persona (ChatGPT-style).
//
// Deliberately SEPARATE from two existing concerns:
//   - the orchestrator's routing table (conversationId → persona binding), and
//   - persona memory (semantic recall, what the agent actually reasons over).
// The agent's reasoning context is unchanged by this store — it still recalls
// persona-scoped memory, NOT the literal session transcript (the memory wall).
// This store only organizes what the human sees. Local-only (~/.vellum).
//
// The persona wall is enforced here: every mutation/read is scoped by
// (id, personaId), so one persona's conversations can't be listed or touched
// under another persona's id.
export interface Conversation {
  id: string;
  personaId: string;
  title: string;
  created: number;
  updated: number;
}
export interface ConversationMessage {
  id: number;
  conversationId: string;
  role: "user" | "agent";
  text: string;
  created: number;
}

const DEFAULT_TITLE = "New chat";

interface ConvRow {
  id: string;
  persona_id: string;
  title: string;
  created: number;
  updated: number;
}
interface MsgRow {
  id: number;
  conversation_id: string;
  role: string;
  text: string;
  created: number;
}
const toConv = (r: ConvRow): Conversation => ({
  id: r.id,
  personaId: r.persona_id,
  title: r.title,
  created: r.created,
  updated: r.updated,
});
const toMsg = (r: MsgRow): ConversationMessage => ({
  id: r.id,
  conversationId: r.conversation_id,
  role: r.role === "user" ? "user" : "agent",
  text: r.text,
  created: r.created,
});

// A readable title from the first user message — first line, trimmed to 50.
function deriveTitle(text: string): string {
  const line = text.trim().split("\n", 1)[0]!.trim();
  if (!line) return DEFAULT_TITLE;
  return line.length > 50 ? `${line.slice(0, 50).trimEnd()}…` : line;
}

export class Conversations {
  private db: Database;

  constructor(dbPath = ":memory:") {
    this.db = new Database(dbPath);
    this.db.run(`CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '${DEFAULT_TITLE}',
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL)`);
    this.db.run(`CREATE TABLE IF NOT EXISTS conversation_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created INTEGER NOT NULL)`);
    this.db.run(
      "CREATE INDEX IF NOT EXISTS idx_conv_persona ON conversations(persona_id, updated DESC)",
    );
    this.db.run(
      "CREATE INDEX IF NOT EXISTS idx_msg_conv ON conversation_messages(conversation_id, id)",
    );
  }

  // Sessions for a persona, most-recently-active first.
  list(personaId: string): Conversation[] {
    return (
      this.db
        .query(
          "SELECT * FROM conversations WHERE persona_id = ? ORDER BY updated DESC, created DESC",
        )
        .all(personaId) as ConvRow[]
    ).map(toConv);
  }

  get(id: string): Conversation | null {
    const r = this.db
      .query("SELECT * FROM conversations WHERE id = ?")
      .get(id) as ConvRow | null;
    return r ? toConv(r) : null;
  }

  // Start a new session under a persona (server-generated id).
  create(personaId: string, title?: string): Conversation {
    return this.insert(randomUUID(), personaId, title);
  }

  // Idempotent bind-by-id: returns the existing session if it already belongs to
  // this persona; creates it if absent. Throws if the id exists under a DIFFERENT
  // persona (the wall — a conversation must not be re-homed across compartments).
  ensure(id: string, personaId: string, title?: string): Conversation {
    const existing = this.get(id);
    if (existing) {
      if (existing.personaId !== personaId)
        throw new Error(
          `conversation ${id} belongs to another persona — refusing to rebind`,
        );
      return existing;
    }
    return this.insert(id, personaId, title);
  }

  private insert(id: string, personaId: string, title?: string): Conversation {
    const now = Date.now();
    this.db
      .query(
        "INSERT INTO conversations (id, persona_id, title, created, updated) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, personaId, title?.trim() || DEFAULT_TITLE, now, now);
    return this.get(id)!;
  }

  // Rename, scoped to (id, personaId). Returns the updated session, or null when
  // the session doesn't exist / isn't this persona's.
  rename(personaId: string, id: string, title: string): Conversation | null {
    const clean = title.trim();
    if (!clean)
      return this.get(id)?.personaId === personaId ? this.get(id) : null;
    this.db
      .query(
        "UPDATE conversations SET title = ?, updated = ? WHERE id = ? AND persona_id = ?",
      )
      .run(clean, Date.now(), id, personaId);
    const r = this.get(id);
    return r && r.personaId === personaId ? r : null;
  }

  // Delete a session + its transcript, scoped to (id, personaId).
  remove(personaId: string, id: string): boolean {
    const owned = this.get(id);
    if (!owned || owned.personaId !== personaId) return false;
    this.db
      .query("DELETE FROM conversation_messages WHERE conversation_id = ?")
      .run(id);
    this.db
      .query("DELETE FROM conversations WHERE id = ? AND persona_id = ?")
      .run(id, personaId);
    return true;
  }

  // Transcript for a session, scoped to (id, personaId). Returns [] when the
  // session isn't this persona's (wall) or doesn't exist.
  messages(personaId: string, id: string): ConversationMessage[] {
    const owned = this.get(id);
    if (!owned || owned.personaId !== personaId) return [];
    return (
      this.db
        .query(
          "SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY id ASC",
        )
        .all(id) as MsgRow[]
    ).map(toMsg);
  }

  // Append a turn + bump the session's updated time. The first user turn names
  // an as-yet-unnamed session from its text (ChatGPT-style auto-title). No-op if
  // the session row is missing (callers ensure() it first).
  append(id: string, role: "user" | "agent", text: string): void {
    const conv = this.get(id);
    if (!conv) return;
    const now = Date.now();
    this.db
      .query(
        "INSERT INTO conversation_messages (conversation_id, role, text, created) VALUES (?, ?, ?, ?)",
      )
      .run(id, role, text, now);
    const nextTitle =
      role === "user" && conv.title === DEFAULT_TITLE
        ? deriveTitle(text)
        : conv.title;
    this.db
      .query("UPDATE conversations SET updated = ?, title = ? WHERE id = ?")
      .run(now, nextTitle, id);
  }

  close(): void {
    this.db.close();
  }
}
