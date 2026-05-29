import { Database } from "bun:sqlite";

/**
 * Per-chat active-persona selection (#49). One operator can drive multiple
 * compartments from Telegram — each chat picks which persona it's talking to
 * via /switch, and that choice survives a restart. Stores ONLY the chat id and
 * a persona id (both metadata); never message content.
 *
 * Isolation: the active persona is keyed by chat_id, so two chats (or a chat
 * vs the web/CLI surface) never share a selection. The handlers scope every
 * action — chat, /vaults, /spend — to the resolved persona, so a /switch in one
 * chat can't reach into another chat's compartment.
 */
export class Sessions {
  private db: Database;

  constructor(dbPath = ":memory:") {
    this.db = new Database(dbPath);
    this.db.run(
      "CREATE TABLE IF NOT EXISTS tg_sessions (chat_id INTEGER PRIMARY KEY, persona_id TEXT NOT NULL, updated INTEGER NOT NULL)",
    );
  }

  /** The persona this chat is currently driving, or null if it hasn't switched. */
  activePersona(chatId: number): string | null {
    const r = this.db
      .query("SELECT persona_id FROM tg_sessions WHERE chat_id = ?")
      .get(chatId) as { persona_id: string } | null;
    return r?.persona_id ?? null;
  }

  /** Pin this chat to a persona (create-or-replace). */
  setActivePersona(chatId: number, personaId: string): void {
    this.db
      .query(
        `INSERT INTO tg_sessions (chat_id, persona_id, updated) VALUES (?, ?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET persona_id = excluded.persona_id, updated = excluded.updated`,
      )
      .run(chatId, personaId, Date.now());
  }

  close(): void {
    this.db.close();
  }
}
