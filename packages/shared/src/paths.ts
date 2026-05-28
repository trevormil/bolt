import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

// Filesystem-first local home (ADR-0002): all Vellum state lives here, never
// cwd-relative. Resolution precedence: $VELLUM_HOME → $XDG_DATA_HOME/vellum →
// ~/.vellum. PURE (no fs side effects) so importing env at parse time never
// touches disk — entrypoints call ensureDataDir() explicitly at startup.
export function dataDir(): string {
  const explicit = process.env.VELLUM_HOME?.trim();
  if (explicit) return explicit;
  const xdg = process.env.XDG_DATA_HOME?.trim();
  if (xdg) return join(xdg, "vellum");
  return join(homedir(), ".vellum");
}

/** A path inside the data dir (does not create anything). */
export function dataPath(...segments: string[]): string {
  return join(dataDir(), ...segments);
}

/** Create the data dir (idempotent). Call once at process startup. */
export function ensureDataDir(): string {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

// The agent's working directory (#52) — the single root the YOLO filesystem +
// command-execution tools operate in. $VELLUM_WORKSPACE wins; default is
// `<dataDir>/workspace`. PURE (no fs side effects); ensureWorkspaceDir() creates
// it. Returns an absolute path (resolve) so it matches the canonical form the
// exec/fs grants are scoped to.
export function workspaceDir(): string {
  const explicit = process.env.VELLUM_WORKSPACE?.trim();
  return resolve(explicit || join(dataDir(), "workspace"));
}

/** Create the workspace dir (idempotent). Returns its absolute path. */
export function ensureWorkspaceDir(): string {
  const dir = workspaceDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * One-time migration off the old cwd-relative `./vellum.db`. If the target DB
 * (in the data dir) doesn't exist yet but a legacy `./vellum.db` does, copy it
 * (plus its -wal/-shm sidecars) over. Best-effort + non-fatal: a fresh install
 * has no legacy DB, and an explicit VELLUM_DB_PATH override is left alone.
 */
export function migrateLegacyDb(
  targetDbPath: string,
  legacyPath = "./vellum.db",
): boolean {
  const legacy = resolve(legacyPath);
  const target = resolve(targetDbPath);
  if (target === legacy) return false; // still using the legacy location
  if (existsSync(target) || !existsSync(legacy)) return false;
  try {
    mkdirSync(resolve(targetDbPath, ".."), { recursive: true });
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(legacy + suffix))
        copyFileSync(legacy + suffix, target + suffix);
    }
    return true;
  } catch {
    return false; // non-fatal — worst case the app starts with a fresh DB
  }
}
