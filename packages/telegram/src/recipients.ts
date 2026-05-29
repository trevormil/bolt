import { Database } from "bun:sqlite";

/**
 * Persistent set of Telegram chat ids the bot has interacted with. Persisted so
 * the principal allowlist (#28) survives a restart. Stores only the chat id
 * (metadata), never message content.
 *
 * Vellum is a PERSONAL agent serving one principal — the human who runs it. The
 * principal is the first chat to interact (TOFU); only that chat is authorized
 * to drive the bot (principal()), so a stranger who happens to /start it can't
 * issue commands to the shared persona.
 */
export class Recipients {
  private db: Database;

  constructor(dbPath = ":memory:") {
    this.db = new Database(dbPath);
    this.db.run(
      "CREATE TABLE IF NOT EXISTS tg_recipients (chat_id INTEGER PRIMARY KEY, first_seen INTEGER NOT NULL)",
    );
  }

  record(chatId: number): void {
    this.db
      .query(
        "INSERT OR IGNORE INTO tg_recipients (chat_id, first_seen) VALUES (?, ?)",
      )
      .run(chatId, Date.now());
  }

  all(): number[] {
    return (
      this.db.query("SELECT chat_id FROM tg_recipients").all() as {
        chat_id: number;
      }[]
    ).map((r) => r.chat_id);
  }

  /** The principal: the first chat to interact (the owner). Only this chat is
   *  authorized to drive the bot (#28). */
  principal(): number | null {
    const r = this.db
      .query(
        "SELECT chat_id FROM tg_recipients ORDER BY first_seen, chat_id LIMIT 1",
      )
      .get() as { chat_id: number } | null;
    return r?.chat_id ?? null;
  }

  close(): void {
    this.db.close();
  }
}
