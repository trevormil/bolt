import { join } from "node:path";
import { generateWallet, addressOf } from "@vellum/chain";
import { env } from "@vellum/shared";
import { runSetup } from "./setup.ts";

// The interactive install + onboarding wizard (#19) — the I/O shell over the
// pure runSetup(). Zero → a running local agent: collect the LLM key, the agent
// signer wallet (generate or import), the first persona, and the daemon-exposure
// choice, then write .env + create the persona, and optionally install the
// macOS background daemon. Cross-platform autostart is a later extension.

function ask(q: string, fallback = ""): string {
  const a = (prompt(q) ?? "").trim();
  return a || fallback;
}

function yesno(q: string, def = false): boolean {
  const a = (prompt(`${q} ${def ? "[Y/n]" : "[y/N]"}`) ?? "")
    .trim()
    .toLowerCase();
  if (!a) return def;
  return a === "y" || a === "yes";
}

export async function initWizard(
  opts: { envPath?: string } = {},
): Promise<void> {
  const envPath = opts.envPath ?? join(process.cwd(), ".env");
  console.log("\n  Vellum — local-first setup");
  console.log("  Nothing is hosted; only OpenRouter is ever contacted.\n");

  // 1) LLM key (optional — boots offline-of-cloud, just can't think yet).
  console.log("1) OpenRouter API key — powers the agent's LLM.");
  const openRouterKey = ask("   key (blank to skip for now): ") || undefined;

  // 2) Agent signer wallet — all persona wallets derive from one mnemonic.
  console.log("\n2) Agent signer wallet.");
  let mnemonic: string;
  if (yesno("   Import an existing 24-word mnemonic? (No = generate fresh)")) {
    mnemonic = ask("   paste mnemonic: ");
    const addr = await addressOf(mnemonic); // throws on an invalid phrase
    console.log(`   ✓ imported · ${addr}`);
  } else {
    const w = await generateWallet();
    mnemonic = w.mnemonic;
    console.log("   ✓ generated a new mnemonic — saved to .env, BACK IT UP:");
    console.log(`\n     ${mnemonic}\n`);
  }

  // 3) First persona.
  console.log("3) Your first persona.");
  const personaName = ask("   name [Assistant]: ", "Assistant");

  // 4) Expose the daemon beyond loopback? (default no — local-first).
  console.log("\n4) Network exposure.");
  let apiToken: string | undefined;
  if (yesno("   Expose the daemon beyond this machine? (No = loopback only)")) {
    apiToken = crypto.randomUUID().replace(/-/g, "");
    console.log(
      "   ✓ generated VELLUM_API_TOKEN (required to bind non-loopback).",
    );
  }

  const res = await runSetup(
    { openRouterKey, mnemonic, personaName, apiToken },
    { envPath },
  );

  console.log("\n  Setup complete:");
  console.log(
    res.card
      .split("\n")
      .map((l) => `   ${l}`)
      .join("\n"),
  );
  console.log(`   • data dir  ${res.dataDir}`);
  console.log(`   • secrets   ${res.envPath} (${res.wroteKeys.join(", ")})`);
  if (!openRouterKey)
    console.log(
      "   ! no LLM key set — add OPENROUTER_API_KEY to .env to enable chat.",
    );

  // 5) Run Vellum — seamlessly. The user shouldn't have to run any command: the
  // wizard starts the daemon for them (gated by y/n) and only ever points them at
  // the URL. If a daemon is already serving the configured port, we don't start a
  // second one (that would just fail on the bound port).
  const url = `http://127.0.0.1:${env.WEB_PORT}`;
  console.log("\n5) Run Vellum");
  const alreadyUp = await fetch(`${url}/api/health`, {
    signal: AbortSignal.timeout(800),
  })
    .then((r) => r.ok)
    .catch(() => false);

  if (alreadyUp) {
    console.log("   ✓ Vellum is already running.");
    printTryList(res.personaId, url);
    return;
  }

  if (!yesno("   Start Vellum now?", true)) {
    console.log("   OK — start it any time with:  bun run daemon");
    printTryList(res.personaId, url);
    return;
  }

  // Offer to keep it running across logins (macOS launchd); otherwise run it in
  // the foreground and hand the terminal to the server.
  if (
    process.platform === "darwin" &&
    yesno("   Keep it running at login (background)?")
  ) {
    const r = Bun.spawnSync(
      ["bash", join(process.cwd(), "scripts/install-daemon.sh"), "install"],
      { stdout: "inherit", stderr: "inherit" },
    );
    if (r.exitCode === 0) {
      console.log("   ✓ installed and running in the background.");
      printTryList(res.personaId, url);
      return;
    }
    console.log("   ! background install failed — starting in the foreground.");
  }

  // Foreground: spawn the daemon and block on it so `bun run setup` ends with a
  // live server. The SPA was already built by quickstart, so the dashboard is
  // real. Ctrl-C stops it.
  printTryList(res.personaId, url);
  console.log("  Starting Vellum… (Ctrl-C to stop)\n");
  const proc = Bun.spawn(["bun", "run", "daemon"], {
    cwd: process.cwd(),
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  await proc.exited;
}

// The post-setup "open it + try this" guidance (#25), shown on every exit path.
function printTryList(personaId: string, url: string): void {
  console.log(`\n  Open ${url} and try, in ${personaId}:`);
  console.log('   • Chat — ask anything, or "remember …" to teach it.');
  console.log(
    "   • Vaults → create one with a spending limit; watch the gating badges + escrow.",
  );
  console.log(
    "   • Activity — every action lands on the timeline with its cost + tx hash.",
  );
  console.log("");
}
