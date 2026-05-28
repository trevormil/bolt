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

  // 5) Optional background daemon (macOS launchd). Cross-platform later.
  console.log("\n5) Background daemon (runs Vellum at login).");
  let daemonRunning = false;
  if (yesno("   Install the background daemon now?")) {
    if (process.platform !== "darwin") {
      console.log(
        "   skipped — autostart currently supports macOS only (cross-platform is an extension).",
      );
    } else {
      const r = Bun.spawnSync(
        ["bash", join(process.cwd(), "scripts/install-daemon.sh"), "install"],
        { stdout: "inherit", stderr: "inherit" },
      );
      if (r.exitCode === 0) {
        daemonRunning = true;
        console.log("   ✓ daemon installed and running");
      } else {
        console.log(
          "   ! daemon install failed — start it yourself with `bun run daemon`.",
        );
      }
    }
  }

  // Land the user IN the product (#25): where it's running + what to try first,
  // using the real configured port (not a hardcoded one).
  const url = `http://127.0.0.1:${env.WEB_PORT}`;
  console.log("\n  You're set 🎉");
  if (daemonRunning) {
    console.log(`   Vellum is running → open ${url}`);
  } else {
    console.log("   Start Vellum, then open the dashboard:");
    console.log("     bun run daemon        # web + schedulers");
    console.log(`     open ${url}`);
    console.log("   …or stay in the terminal:  vellum   (interactive chat)");
  }
  console.log(`\n  First things to try with ${res.personaId}:`);
  console.log('   • Chat — ask anything, or "remember …" to teach it.');
  console.log(
    "   • Vaults → create one with a spending limit; watch the gating badges + escrow.",
  );
  console.log(
    "   • Activity — every action lands on the timeline with its cost + tx hash.",
  );
  console.log("");
}
