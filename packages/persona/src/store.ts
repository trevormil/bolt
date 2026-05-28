import { Database } from "bun:sqlite";
import { createLogger } from "@vellum/shared";
import { scanForInjection } from "./injection.ts";
import type {
  Embedder,
  MemoryRecord,
  Persona,
  RetrievalHit,
  SoulIdentity,
} from "./types.ts";

const log = createLogger("persona");
const RRF_K = 60; // Reciprocal Rank Fusion constant (standard default)

interface MemoryRow {
  id: number;
  persona_id: string;
  text: string;
  source: string;
  meta: string;
  embedding: Uint8Array | null;
  created: number;
}

function toRecord(r: MemoryRow): MemoryRecord {
  return {
    id: r.id,
    personaId: r.persona_id,
    text: r.text,
    source: r.source,
    meta: safeParse(r.meta),
    created: r.created,
  };
}
function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// FTS5 MATCH from arbitrary user text: quote each word token as a phrase and OR
// them. Quoting neutralizes FTS operators so a query can never be an injection
// or a syntax error. Empty if the query has no word tokens.
function ftsMatch(query: string): string {
  const toks = [...query.toLowerCase().matchAll(/[a-z0-9]+/g)].map((m) => m[0]);
  return toks.map((t) => `"${t}"`).join(" OR ");
}

function blobToVec(b: Uint8Array): Float32Array {
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
}
function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}

/**
 * The compartment core. Each persona owns a hard-walled slice of memory: every
 * read and write is scoped by `persona_id` inside the SQL itself, so there is no
 * code path that returns another persona's rows. Retrieval is hybrid (FTS5 BM25
 * + brute-force dense cosine, fused via RRF) — see docs/decisions/0001.
 *
 * A thin global layer (`globals`) holds only shared essentials (principal
 * identity, a few prefs); it is deliberately NOT persona memory.
 */
export class PersonaStore {
  private db: Database;
  private embedder: Embedder | null;

  constructor(dbPath = ":memory:", embedder: Embedder | null = null) {
    this.db = new Database(dbPath);
    this.db.run("PRAGMA journal_mode = WAL");
    this.embedder = embedder;
    this.migrate();
  }

  private migrate(): void {
    this.db.run(`CREATE TABLE IF NOT EXISTS personas (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, soul TEXT NOT NULL, created INTEGER NOT NULL)`);
    this.db.run(`CREATE TABLE IF NOT EXISTS memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      persona_id TEXT NOT NULL,
      text TEXT NOT NULL,
      source TEXT NOT NULL,
      meta TEXT NOT NULL,
      embedding BLOB,
      created INTEGER NOT NULL)`);
    this.db.run(
      "CREATE INDEX IF NOT EXISTS idx_memory_persona ON memory(persona_id)",
    );
    this.db.run(
      `CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        text, persona_id UNINDEXED, mem_id UNINDEXED)`,
    );
    this.db.run(
      "CREATE TABLE IF NOT EXISTS globals (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
  }

  // ---- Personas -----------------------------------------------------------

  createPersona(id: string, name: string, soul: SoulIdentity): Persona {
    const created = Date.now();
    this.db
      .query(
        "INSERT INTO personas (id, name, soul, created) VALUES (?, ?, ?, ?)",
      )
      .run(id, name, JSON.stringify(soul), created);
    log.info(`persona created · ${id}`);
    return { id, name, soul, created };
  }

  getPersona(id: string): Persona | null {
    const row = this.db
      .query("SELECT id, name, soul, created FROM personas WHERE id = ?")
      .get(id) as {
      id: string;
      name: string;
      soul: string;
      created: number;
    } | null;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      soul: JSON.parse(row.soul),
      created: row.created,
    };
  }

  listPersonas(): Persona[] {
    const rows = this.db
      .query("SELECT id, name, soul, created FROM personas ORDER BY created")
      .all() as { id: string; name: string; soul: string; created: number }[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      soul: JSON.parse(r.soul),
      created: r.created,
    }));
  }

  private assertPersona(id: string): void {
    const ok = this.db.query("SELECT 1 FROM personas WHERE id = ?").get(id);
    if (!ok) throw new Error(`unknown persona: ${id}`);
  }

  // ---- Memory (hard-walled per persona) -----------------------------------

  async remember(
    personaId: string,
    text: string,
    opts: { source?: string; meta?: Record<string, unknown> } = {},
  ): Promise<MemoryRecord> {
    this.assertPersona(personaId);
    const created = Date.now();
    const source = opts.source ?? "memory";
    // Tag ingested content that carries override-style instructions (#24 T-02)
    // so recall can render it as untrusted data, not trusted context.
    const metaObj: Record<string, unknown> = { ...(opts.meta ?? {}) };
    if (scanForInjection(text)) metaObj.injectionRisk = true;
    const meta = JSON.stringify(metaObj);

    let embedding: Uint8Array | null = null;
    if (this.embedder) {
      const [vec] = await this.embedder.embed([text]);
      if (vec) embedding = new Uint8Array(vec.buffer.slice(0));
    }

    const info = this.db
      .query(
        "INSERT INTO memory (persona_id, text, source, meta, embedding, created) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(personaId, text, source, meta, embedding, created);
    const id = Number(info.lastInsertRowid);
    this.db
      .query(
        "INSERT INTO memory_fts (text, persona_id, mem_id) VALUES (?, ?, ?)",
      )
      .run(text, personaId, id);

    return { id, personaId, text, source, meta: metaObj, created };
  }

  /**
   * Hybrid recall, scoped to ONE persona. BM25 (FTS5) + dense cosine candidate
   * lists fused via RRF. Both paths filter on persona_id in SQL — a query for
   * persona B can never surface persona A's memory.
   */
  async recall(
    personaId: string,
    query: string,
    k = 5,
  ): Promise<RetrievalHit[]> {
    this.assertPersona(personaId);
    const pool = Math.max(k * 4, 20);
    const ranks = new Map<number, number>(); // mem_id -> fused score

    const fuse = (orderedIds: number[]) => {
      orderedIds.forEach((id, i) => {
        ranks.set(id, (ranks.get(id) ?? 0) + 1 / (RRF_K + i + 1));
      });
    };

    fuse(this.bm25(personaId, query, pool));
    fuse(await this.dense(personaId, query, pool));

    const ordered = [...ranks.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, k);
    return ordered
      .map(([id, score]) => {
        const row = this.db
          .query("SELECT * FROM memory WHERE id = ? AND persona_id = ?")
          .get(id, personaId) as MemoryRow | null;
        return row ? { record: toRecord(row), score } : null;
      })
      .filter((h): h is RetrievalHit => h !== null);
  }

  private bm25(personaId: string, query: string, limit: number): number[] {
    const match = ftsMatch(query);
    if (!match) return [];
    const rows = this.db
      .query(
        `SELECT mem_id FROM memory_fts
         WHERE memory_fts MATCH ? AND persona_id = ?
         ORDER BY bm25(memory_fts) ASC LIMIT ?`,
      )
      .all(match, personaId, limit) as { mem_id: number }[];
    return rows.map((r) => r.mem_id);
  }

  private async dense(
    personaId: string,
    query: string,
    limit: number,
  ): Promise<number[]> {
    if (!this.embedder) return [];
    const [qvec] = await this.embedder.embed([query]);
    if (!qvec) return [];
    const rows = this.db
      .query(
        "SELECT id, embedding FROM memory WHERE persona_id = ? AND embedding IS NOT NULL",
      )
      .all(personaId) as { id: number; embedding: Uint8Array }[];
    return rows
      .map((r) => ({ id: r.id, score: dot(qvec, blobToVec(r.embedding)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.id);
  }

  /**
   * Optional document ingestion into a persona's walled corpus. Naive
   * paragraph/length chunking — enough to ground answers; smarter chunking is a
   * later concern. Each chunk becomes a memory row sourced `doc:<docId>`.
   */
  async ingestDocument(
    personaId: string,
    docId: string,
    text: string,
    chunkSize = 800,
  ): Promise<number> {
    this.assertPersona(personaId);
    const chunks = chunkText(text, chunkSize);
    for (const chunk of chunks) {
      await this.remember(personaId, chunk, {
        source: `doc:${docId}`,
        meta: { docId },
      });
    }
    return chunks.length;
  }

  // ---- Thin global layer (shared essentials only) -------------------------

  setGlobal(key: string, value: string): void {
    this.db
      .query(
        "INSERT INTO globals (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
      )
      .run(key, value, value);
  }
  getGlobal(key: string): string | null {
    const row = this.db
      .query("SELECT value FROM globals WHERE key = ?")
      .get(key) as { value: string } | null;
    return row?.value ?? null;
  }
  listGlobals(): Record<string, string> {
    const rows = this.db.query("SELECT key, value FROM globals").all() as {
      key: string;
      value: string;
    }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  close(): void {
    this.db.close();
  }
}

// Split on blank lines, then hard-wrap any paragraph longer than `max` chars.
function chunkText(text: string, max: number): string[] {
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of paras) {
    if (p.length <= max) {
      out.push(p);
    } else {
      for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max));
    }
  }
  return out;
}
