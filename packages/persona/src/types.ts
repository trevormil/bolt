// SOUL-style identity for a persona: who it is and how it speaks. Rendered into
// the system preamble (soul.ts). Kept small + declarative on purpose.
export interface SoulIdentity {
  name: string;
  role: string; // one line: what this persona is for
  voice: string; // how it talks
  values?: string[]; // optional guiding principles
}

export interface Persona {
  id: string;
  name: string;
  soul: SoulIdentity;
  created: number; // epoch ms
}

// A single hard-walled memory row, scoped to one persona.
export interface MemoryRecord {
  id: number;
  personaId: string;
  text: string;
  source: string; // "memory" | "doc:<docId>" | caller-defined
  meta: Record<string, unknown>;
  created: number;
}

export interface RetrievalHit {
  record: MemoryRecord;
  score: number; // fused RRF score (higher = more relevant)
}

// Turns text into vectors. Injectable so the store is hermetic in tests and the
// embedding provider is a swap, not a hard dependency.
export interface Embedder {
  dim: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}
