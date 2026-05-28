import { join } from "node:path";
import { generateWallet } from "@vellum/chain";
import { verifyOpenRouterKey } from "@vellum/llm";
import { env, workspaceDir } from "@vellum/shared";
import { runSetup } from "./setup.ts";
import {
  banner,
  step,
  gold,
  goldBright,
  copper,
  fg,
  dim,
  bold,
  check,
  warn,
} from "./term.ts";

// The interactive install + onboarding wizard (#19) — the I/O shell over the
// pure runSetup(). Zero → a running local agent: collect the LLM key, the agent
// signer wallet (generate or import), the first persona, and the daemon-exposure
// choice, then write .env + create the persona, and optionally install the
// macOS background daemon. Cross-platform autostart is a later extension.

// Gold prompt caret so every question reads as part of the brand.
function ask(q: string, fallback = ""): string {
  const a = (prompt(`   ${gold("›")} ${q}`) ?? "").trim();
  return a || fallback;
}

function yesno(q: string, def = false): boolean {
  const hint = dim(def ? "[Y/n]" : "[y/N]");
  const a = (prompt(`   ${gold("›")} ${q} ${hint}`) ?? "").trim().toLowerCase();
  if (!a) return def;
  return a === "y" || a === "yes";
}

export async function initWizard(
  opts: { envPath?: string } = {},
): Promise<void> {
  const envPath = opts.envPath ?? join(process.cwd(), ".env");
  console.log(banner());
  console.log(
    "  " + dim("Nothing is hosted; only OpenRouter is ever contacted."),
  );

  // 1) LLM key — REQUIRED + health-checked (#60). Chat is dead without a valid
  // key, so block here (matches the web onboarding) rather than warn later.
  console.log(
    step(1, "OpenRouter API key", "powers the agent's LLM — required"),
  );
  let openRouterKey = "";
  for (;;) {
    const entered = ask("key " + dim("(openrouter.ai/keys)") + ": ");
    if (!entered) {
      console.log(`   ${warn} a key is required to continue.`);
      continue;
    }
    console.log(`   ${dim("verifying…")}`);
    if (await verifyOpenRouterKey(entered)) {
      openRouterKey = entered;
      console.log(`   ${check} key validated`);
      break;
    }
    console.log(
      `   ${warn} that key didn't validate — check it and try again.`,
    );
  }

  // 2) Agent signer wallet — always generated fresh (#59, no import); all persona
  // wallets derive from it. Back it up later via the app's Settings → Export.
  console.log(step(2, "Agent signer wallet"));
  const { mnemonic } = await generateWallet();
  console.log(
    `   ${check} generated a new mnemonic ${dim("— saved to .env,")} ${copper("BACK IT UP")}${dim(":")}`,
  );
  console.log("\n     " + gold(mnemonic) + "\n");

  // 3) First persona.
  console.log(step(3, "Your first persona"));
  const personaName = ask("name " + dim("[Assistant]") + ": ", "Assistant");

  // YOLO dev capability disclosure (#52) — the informed opt-in. Be HONEST (!56):
  // files are workspace-confined, but command execution is FULL HOST access (not
  // sandboxed) — and a shell can read the signing key from disk + move funds, so
  // it is full trust, NOT money-rule-bound. Don't claim otherwise.
  console.log(
    "\n   " +
      copper("⚡ Full local access (YOLO).") +
      " " +
      dim("By default this agent can:"),
  );
  console.log(
    "   " +
      dim("• read & write files in its workspace:") +
      " " +
      gold(workspaceDir()),
  );
  console.log(
    "   " +
      dim("• run ANY shell command on this machine") +
      " " +
      copper("(full host access — not sandboxed)") +
      dim(", starting in that workspace."),
  );
  console.log(
    "   " +
      copper("Full trust:") +
      " " +
      dim(
        "a command can read the signing key + move funds — only for an agent you trust.",
      ),
  );
  console.log(
    "   " +
      dim(
        "(Vault/spend rules gate the agent's money TOOLS; raw commands bypass them.)",
      ),
  );
  console.log(
    "   " +
      dim("Revoke fs.read / fs.write / exec per-persona to lock down.") +
      "\n",
  );

  // 4) Expose the daemon beyond loopback? (default no — local-first).
  console.log(step(4, "Network exposure"));
  let apiToken: string | undefined;
  if (
    yesno(
      "Expose the daemon beyond this machine? " + dim("(No = loopback only)"),
    )
  ) {
    apiToken = crypto.randomUUID().replace(/-/g, "");
    console.log(
      `   ${check} generated ${gold("VELLUM_API_TOKEN")} ${dim("(required to bind non-loopback).")}`,
    );
  }

  const res = await runSetup(
    { openRouterKey, mnemonic, personaName, apiToken },
    { envPath },
  );

  console.log("\n  " + goldBright("Setup complete"));
  console.log(
    res.card
      .split("\n")
      .map((l, i) =>
        i === 0
          ? "   " + gold(l)
          : "   " + dim(l.replace(/^( *\S+:)/, (m) => m)),
      )
      .join("\n"),
  );
  console.log(`   ${dim("• data dir")}  ${fg(res.dataDir)}`);
  console.log(
    `   ${dim("• secrets")}   ${fg(res.envPath)} ${dim("(" + res.wroteKeys.join(", ") + ")")}`,
  );

  // 5) Run Bolt — seamlessly. The user shouldn't have to run any command: the
  // wizard starts the daemon for them (gated by y/n) and only ever points them at
  // the URL. If a daemon is already serving the configured port, we don't start a
  // second one (that would just fail on the bound port).
  const url = `http://127.0.0.1:${env.WEB_PORT}`;
  console.log(step(5, "Run Bolt"));
  const alreadyUp = await fetch(`${url}/api/health`, {
    signal: AbortSignal.timeout(800),
  })
    .then((r) => r.ok)
    .catch(() => false);

  if (alreadyUp) {
    console.log(`   ${check} Bolt is already running.`);
    printTryList(res.personaId, url);
    return;
  }

  if (!yesno("Start Bolt now?", true)) {
    console.log(`   OK — start it any time with  ${gold("bun run daemon")}`);
    printTryList(res.personaId, url);
    return;
  }

  // Offer to keep it running across logins (macOS launchd); otherwise run it in
  // the foreground and hand the terminal to the server.
  if (
    process.platform === "darwin" &&
    yesno("Keep it running at login (background)?")
  ) {
    const r = Bun.spawnSync(
      ["bash", join(process.cwd(), "scripts/install-daemon.sh"), "install"],
      { stdout: "inherit", stderr: "inherit" },
    );
    if (r.exitCode === 0) {
      console.log(`   ${check} installed and running in the background.`);
      printTryList(res.personaId, url);
      return;
    }
    console.log(
      `   ${warn} background install failed — starting in the foreground.`,
    );
  }

  // Foreground: spawn the daemon and block on it so `bun run setup` ends with a
  // live server. The SPA was already built by quickstart, so the dashboard is
  // real. Ctrl-C stops it.
  printTryList(res.personaId, url);
  console.log(`  ${gold("Starting Bolt…")} ${dim("(Ctrl-C to stop)")}\n`);
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
  console.log(
    `\n  Open ${goldBright(url)} ${dim("and try, in")} ${gold(personaId)}${dim(":")}`,
  );
  const item = (s: string) => console.log(`   ${gold("›")} ${dim(s)}`);
  item('Chat — ask anything, or "remember …" to teach it.');
  item(
    "Vaults → create one with a spending limit; watch the gating badges + escrow.",
  );
  item(
    "Activity — every action lands on the timeline with its cost + tx hash.",
  );
  console.log("");
}
