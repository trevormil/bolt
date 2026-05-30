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

  /**
   * Atomic test-and-set for the TOFU principal claim (#109 §2). The previous
   * shape — read principal(), then record(chatId) if null — is structurally
   * a race even though Bun's single-thread JS makes the current sync path
   * safe in practice; any future refactor that inserts an `await` between
   * the two opens the door for two simultaneous chats to both claim the
   * slot. Collapsing into one BEGIN IMMEDIATE transaction means the
   * principal slot is decided by SQLite, not by event-loop interleaving,
   * and a concurrent claimer reads the row that the winner just wrote.
   *
   * Returns the principal chat id (the winner — either this chatId on a
   * fresh claim, or the already-recorded principal otherwise) plus whether
   * THIS chatId is the principal.
   */
  claimPrincipal(chatId: number): { principal: number; isPrincipal: boolean } {
    // BEGIN IMMEDIATE acquires the write lock up front so the read sees the
    // committed state — no concurrent claimer can race in between.
    this.db.run("BEGIN IMMEDIATE");
    try {
      const current = this.principal();
      if (current === null) {
        this.db
          .query(
            "INSERT INTO tg_recipients (chat_id, first_seen) VALUES (?, ?)",
          )
          .run(chatId, Date.now());
        this.db.run("COMMIT");
        return { principal: chatId, isPrincipal: true };
      }
      this.db.run("COMMIT");
      return { principal: current, isPrincipal: chatId === current };
    } catch (e) {
      this.db.run("ROLLBACK");
      throw e;
    }
  }

  close(): void {
    this.db.close();
  }
}
