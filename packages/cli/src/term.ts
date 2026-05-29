// Aurum terminal styling (#53) — ANSI truecolor gold/copper for the install
// wizard, matching the web app's black-and-gold brand. No deps (raw escapes);
// auto-disabled when stdout isn't a TTY or NO_COLOR is set, so piped/CI output
// stays clean.
const useColor =
  !process.env.NO_COLOR &&
  (!!process.stdout.isTTY || !!process.env.FORCE_COLOR);
const wrap =
  (open: string) =>
  (s: string): string =>
    useColor ? `\x1b[${open}m${s}\x1b[0m` : s;

export const gold = wrap("38;2;212;175;55"); // #D4AF37
export const goldBright = wrap("1;38;2;236;202;110"); // bold bright gold
export const copper = wrap("38;2;184;115;51"); // #B87333
export const fg = wrap("38;2;242;237;224"); // parchment
export const dim = wrap("2");
export const bold = wrap("1");
export const danger = wrap("38;2;229;96;77");

export const check = gold("✓");
export const warn = copper("!");

/** Numbered step header: a gold index + a bright title + a dim aside. */
export function step(n: number, title: string, aside = ""): string {
  return `\n${gold(bold(`${n}`))}  ${bold(title)}${aside ? "  " + dim("— " + aside) : ""}`;
}

/** The Bolt wordmark banner — shown once at the top of the wizard. */
export function banner(): string {
  return [
    "",
    "  " + goldBright("⚡ B O L T"),
    "  " + gold("the agent with a wallet") + dim("  ·  local-first"),
    "  " + dim("──────────────────────────────────────────"),
  ].join("\n");
}
