import { Database } from "bun:sqlite";

/**
 * Persistent set of Telegram chat ids the bot has interacted with — the targets
 * for proactive check-ins (0018). Persisted so nudges survive a restart (the
 * point of a proactive agent is it reaches you when you're NOT chatting). Stores
 * only the chat id (metadata), never message content.
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

  close(): void {
    this.db.close();
  }
}
