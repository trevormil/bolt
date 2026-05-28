import { createInterface } from "node:readline";
import { chat, grantDefaultCapabilities, type Engine } from "@vellum/engine";

// Interactive terminal chat (#34) — the OpenClaw-style REPL. Each line is a turn
// against the held persona, run through the shared engine (so memory, tools,
// vaults, budget, ledger all apply exactly as on the other surfaces). Slash
// commands manage the session; everything else is a message.
const HELP = `commands: /personas  /switch <id>  /new <name>  /help  /exit`;

export async function repl(
  engine: Engine,
  startPersona?: string,
): Promise<void> {
  const initial = startPersona ?? engine.store.listPersonas()[0]?.id;
  let personaId: string;
  if (!initial) {
    engine.store.createPersona("assistant", "Bolt", {
      name: "Bolt",
      role: "payment-first personal agent",
      voice: "warm, concise, plain-English",
    });
    await engine.wallets.ensureWallet("assistant");
    grantDefaultCapabilities(engine.capabilities, "assistant");
    personaId = "assistant";
  } else if (!engine.store.getPersona(initial)) {
    throw new Error(`unknown persona: ${initial}`);
  } else {
    personaId = initial;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`Bolt · talking to "${personaId}". ${HELP}`);
  const reprompt = () => {
    rl.setPrompt(`${personaId} › `);
    rl.prompt();
  };
  reprompt();

  rl.on("line", async (raw) => {
    const line = raw.trim();
    try {
      if (!line) {
        // nothing
      } else if (line === "/exit" || line === "/quit") {
        rl.close();
        return;
      } else if (line === "/help") {
        console.log(HELP);
      } else if (line === "/personas") {
        console.log(
          engine.store
            .listPersonas()
            .map((p) => `${p.id === personaId ? "*" : " "} ${p.id}  ${p.name}`)
            .join("\n") || "(none)",
        );
      } else if (line.startsWith("/switch ")) {
        const id = line.slice(8).trim();
        if (engine.store.getPersona(id)) {
          personaId = id;
          console.log(`→ ${id}`);
        } else console.log(`unknown persona: ${id}`);
      } else if (line.startsWith("/new ")) {
        const name = line.slice(5).trim();
        const id = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        if (!id) console.log("usage: /new <name>");
        else if (engine.store.getPersona(id)) console.log(`exists: ${id}`);
        else {
          engine.store.createPersona(id, name, {
            name,
            role: "personal assistant",
            voice: "friendly and concise",
          });
          await engine.wallets.ensureWallet(id);
          grantDefaultCapabilities(engine.capabilities, id);
          personaId = id;
          console.log(`created + switched to ${id}`);
        }
      } else {
        const r = await chat(engine, {
          conversationId: `cli:${personaId}`,
          personaId,
          message: line,
        });
        console.log(`\n${r.reply}\n`);
        if (r.budgetExceeded) console.log("(budget reached)");
        else console.log(`($${r.costUsd.toFixed(4)} · ${r.tokens} tok)`);
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
    }
    reprompt();
  });

  await new Promise<void>((resolve) => rl.on("close", resolve));
}
