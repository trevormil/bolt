import {
  chat,
  grantDefaultCapabilities,
  renderPersonaCard,
  DEFAULT_PERSONA_INSTRUCTIONS,
  Model,
  APPROVED_MODELS,
  isApprovedModel,
  type Engine,
} from "@vellum/engine";
import { env } from "@vellum/shared";
import { runKeysCommand } from "./keys.ts";

const fmtUsdc = (micro: string) => (Number(micro) / 1e6).toFixed(2);

export function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "persona"
  );
}

async function usdcBalance(engine: Engine, personaId: string): Promise<string> {
  const balances = await engine.wallets.balanceFor(personaId);
  return balances.find((b) => b.denom === env.VELLUM_DENOM)?.amount ?? "0";
}

const USAGE = `vellum — local-first agent CLI

  vellum init                     first-time setup wizard (LLM key, wallet, persona, daemon)
  vellum                          interactive chat (REPL)
  vellum chat <persona> <msg…>    one-shot message to a persona
  vellum personas                 list personas
  vellum new <name>               create a persona (+ wallet)
  vellum balance <persona>        USDC balance
  vellum faucet <persona>         claim devnet USDC
  vellum ledger <persona>         recent proof-of-action entries
  vellum model <persona> [id]     show / set the persona's model (id, "inherit", or list)
  vellum keys <status|migrate>    agent seed at rest: status, or migrate .env → OS keychain
  vellum help                     this help`;

/**
 * Non-interactive subcommand dispatch — returns text to print. Pure over the
 * engine (no stdin/stdout), so it's unit-testable; the interactive REPL lives
 * in repl.ts. Throws on bad usage; the entry point renders the error.
 */
export async function runCommand(
  engine: Engine,
  argv: string[],
): Promise<string> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      return USAGE;

    case "personas": {
      const ps = engine.store.listPersonas();
      if (!ps.length) return "No personas yet. Create one: vellum new <name>";
      return ps
        .map(
          (p) =>
            `${p.id}\t${p.name}\t${engine.wallets.addressFor(p.id) ?? "—"}`,
        )
        .join("\n");
    }

    case "new": {
      const name = rest.join(" ").trim();
      if (!name) throw new Error("usage: vellum new <name>");
      const id = slug(name);
      if (engine.store.getPersona(id)) throw new Error(`persona exists: ${id}`);
      engine.store.createPersona(id, name, {
        name,
        role: "",
        voice: "",
        instructions: DEFAULT_PERSONA_INSTRUCTIONS,
      });
      const w = await engine.wallets.ensureWallet(id);
      grantDefaultCapabilities(engine.capabilities, id); // #37 baseline policy
      const persona = engine.store.getPersona(id)!;
      // #25: show the personality card at creation, not just a terse line.
      return renderPersonaCard(persona.soul, w.address);
    }

    case "balance": {
      const id = requirePersona(engine, rest[0]);
      return `${fmtUsdc(await usdcBalance(engine, id))} USDC`;
    }

    case "faucet": {
      const id = requirePersona(engine, rest[0]);
      const { address } = await engine.wallets.ensureWallet(id);
      const r = await engine.claimFaucet(address);
      return `faucet: ${r.txHash ?? "submitted"}`;
    }

    case "ledger": {
      const id = requirePersona(engine, rest[0]);
      const entries = engine.ledger.list({ personaId: id, limit: 20 });
      if (!entries.length) return "(no entries yet)";
      return entries
        .map(
          (e) =>
            `${new Date(e.ts).toISOString().slice(0, 16)}  ${e.kind.padEnd(8)} ${e.summary} [${e.authority}]`,
        )
        .join("\n");
    }

    case "model": {
      const id = requirePersona(engine, rest[0]);
      const arg = rest[1]?.trim();
      if (!arg) {
        // Show current + the approved list.
        const r = Model.get(engine.settings, id);
        return [
          `model: ${r.value ?? "(inherit tier router)"} [${r.source}]`,
          `approved: ${APPROVED_MODELS.join(", ")}`,
        ].join("\n");
      }
      if (arg === "inherit" || arg === "none" || arg === "reset") {
        Model.reset(engine.settings, id);
        return `model: (inherit tier router)`;
      }
      if (!isApprovedModel(arg))
        throw new Error(
          `model not approved: ${arg}\napproved: ${APPROVED_MODELS.join(", ")}`,
        );
      Model.setPersona(engine.settings, id, arg);
      return `model: ${arg} [persona]`;
    }

    case "chat": {
      const id = requirePersona(engine, rest[0]);
      const message = rest.slice(1).join(" ").trim();
      if (!message) throw new Error("usage: vellum chat <persona> <message…>");
      const r = await chat(engine, {
        conversationId: `cli:${id}`,
        personaId: id,
        message,
      });
      return r.reply;
    }

    case "keys":
      return runKeysCommand(rest);

    default:
      throw new Error(`unknown command: ${cmd}\n\n${USAGE}`);
  }
}

function requirePersona(engine: Engine, id: string | undefined): string {
  if (!id) throw new Error("a persona id is required (see: vellum personas)");
  if (!engine.store.getPersona(id)) throw new Error(`unknown persona: ${id}`);
  return id;
}
