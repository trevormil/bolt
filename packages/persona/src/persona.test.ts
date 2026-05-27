import { describe, expect, test } from "bun:test";
import { PersonaStore, hashEmbedder, renderSoul } from "./index.ts";
import type { Embedder, SoulIdentity } from "./index.ts";

const SOUL_A: SoulIdentity = {
  name: "Atlas",
  role: "finance copilot",
  voice: "terse",
  values: ["never overspend"],
};
const SOUL_B: SoulIdentity = {
  name: "Echo",
  role: "travel planner",
  voice: "warm",
};

// Scripted embedder: maps exact text → vector so dense ranking is deterministic
// and independent of lexical overlap (lets us prove the dense path in isolation).
function scriptEmbedder(map: Record<string, number[]>, dim = 3): Embedder {
  return {
    dim,
    async embed(texts) {
      return texts.map((t) =>
        Float32Array.from(map[t] ?? new Array(dim).fill(0)),
      );
    },
  };
}

describe("renderSoul", () => {
  test("renders identity fields", () => {
    const s = renderSoul(SOUL_A);
    expect(s).toContain("You are Atlas.");
    expect(s).toContain("Role: finance copilot");
    expect(s).toContain("Voice: terse");
    expect(s).toContain("never overspend");
  });
});

describe("personas + isolated memory", () => {
  test("create a persona; it has its own memory", async () => {
    const store = new PersonaStore(":memory:", hashEmbedder());
    store.createPersona("a", "Atlas", SOUL_A);
    expect(store.getPersona("a")?.soul.name).toBe("Atlas");
    await store.remember("a", "the budget for groceries is 200 ubadge");
    const hits = await store.recall("a", "grocery budget");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.record.text).toContain("groceries");
    store.close();
  });

  test("remembering for an unknown persona throws", async () => {
    const store = new PersonaStore(":memory:", hashEmbedder());
    await expect(store.remember("ghost", "x")).rejects.toThrow(
      "unknown persona",
    );
    store.close();
  });
});

describe("HARD WALL — persona A memory is invisible to persona B", () => {
  test("B can never recall A's secret, by any query", async () => {
    const store = new PersonaStore(":memory:", hashEmbedder());
    store.createPersona("a", "Atlas", SOUL_A);
    store.createPersona("b", "Echo", SOUL_B);

    const SECRET = "vault seed phrase correct horse battery staple";
    await store.remember("a", SECRET, { meta: { sensitive: true } });
    await store.remember("b", "remember to book a hotel in lisbon");

    // Query B with the exact secret text — must surface nothing of A's.
    const leak = await store.recall("b", SECRET, 10);
    expect(leak.every((h) => !h.record.text.includes("seed phrase"))).toBe(
      true,
    );
    expect(leak.every((h) => h.record.personaId === "b")).toBe(true);

    // A still recalls its own secret; B recalls only its own memory.
    const own = await store.recall("a", "seed phrase");
    expect(own.some((h) => h.record.text === SECRET)).toBe(true);
    const bOwn = await store.recall("b", "hotel lisbon");
    expect(bOwn.every((h) => h.record.personaId === "b")).toBe(true);
    expect(bOwn.some((h) => h.record.text.includes("lisbon"))).toBe(true);
    store.close();
  });
});

describe("hybrid retrieval (BM25 + dense)", () => {
  test("BM25 path: lexical match found even with a zero embedding", async () => {
    const store = new PersonaStore(":memory:", scriptEmbedder({}));
    store.createPersona("a", "Atlas", SOUL_A);
    await store.remember("a", "alpha apple");
    await store.remember("a", "bravo banana");
    const hits = await store.recall("a", "alpha");
    expect(hits[0]!.record.text).toBe("alpha apple");
    store.close();
  });

  test("dense path: semantic match found when BM25 has no token overlap", async () => {
    const map = {
      "alpha apple": [1, 0, 0],
      "bravo banana": [0, 1, 0],
      "charlie cherry": [0, 0, 1],
      zzz: [0, 1, 0], // query token; embeds closest to "bravo banana"
    };
    const store = new PersonaStore(":memory:", scriptEmbedder(map));
    store.createPersona("a", "Atlas", SOUL_A);
    for (const t of ["alpha apple", "bravo banana", "charlie cherry"]) {
      await store.remember("a", t);
    }

    // Query shares NO word with any doc → BM25 returns nothing; dense decides.
    const hits = await store.recall("a", "zzz");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.record.text).toBe("bravo banana");
    store.close();
  });

  test("degrades to BM25-only when no embedder is configured", async () => {
    const store = new PersonaStore(":memory:", null);
    store.createPersona("a", "Atlas", SOUL_A);
    await store.remember("a", "wallet balance is 100 ubadge");
    const hits = await store.recall("a", "wallet balance");
    expect(hits[0]!.record.text).toContain("wallet");
    store.close();
  });
});

describe("thin global layer", () => {
  test("set/get/list globals; upsert overwrites", () => {
    const store = new PersonaStore(":memory:", null);
    store.setGlobal("principal", "trevor");
    store.setGlobal("tz", "America/Denver");
    expect(store.getGlobal("principal")).toBe("trevor");
    store.setGlobal("principal", "trev");
    expect(store.getGlobal("principal")).toBe("trev");
    expect(store.listGlobals()).toEqual({
      principal: "trev",
      tz: "America/Denver",
    });
    expect(store.getGlobal("missing")).toBeNull();
    store.close();
  });
});

describe("document ingestion (optional, walled)", () => {
  test("ingest chunks a doc into a persona's corpus and retrieves from it", async () => {
    const store = new PersonaStore(":memory:", hashEmbedder());
    store.createPersona("a", "Atlas", SOUL_A);
    const doc =
      "Refund policy: returns accepted within 30 days.\n\nShipping is free over fifty dollars.\n\nWarranty covers defects for one year.";
    const n = await store.ingestDocument("a", "policy", doc);
    expect(n).toBe(3);
    const hits = await store.recall("a", "warranty defects");
    expect(hits[0]!.record.text).toContain("Warranty");
    expect(hits[0]!.record.source).toBe("doc:policy");
    store.close();
  });
});
