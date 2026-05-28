import { env } from "./env.ts";

// Thin leveled wrapper around console (per house style — no logging dep).
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const threshold = LEVELS[env.LOG_LEVEL];

function log(level: Level, scope: string, msg: string, meta?: unknown) {
  if (LEVELS[level] < threshold) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase()} [${scope}] ${msg}`;
  // All diagnostics go to STDERR — stdout is reserved for program output (e.g.
  // the CLI's command results) so piping `vellum personas` stays clean.
  meta === undefined ? console.error(line) : console.error(line, meta);
}

export function createLogger(scope: string) {
  return {
    debug: (msg: string, meta?: unknown) => log("debug", scope, msg, meta),
    info: (msg: string, meta?: unknown) => log("info", scope, msg, meta),
    warn: (msg: string, meta?: unknown) => log("warn", scope, msg, meta),
    error: (msg: string, meta?: unknown) => log("error", scope, msg, meta),
  };
}
