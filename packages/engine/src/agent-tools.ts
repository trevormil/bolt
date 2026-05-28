import type { ToolInvoker, ToolSpec } from "@vellum/agent";
import type { Engine } from "./engine.ts";

// Vault tools the persona's agent can call in chat (plain-English create/spend).
// The agent does the heavy tx lifting; the human is the manager. Scoped to ONE
// persona via the closure — an agent can only touch its own persona's vaults.
export function vaultTools(
  engine: Engine,
  personaId: string,
): { tools: ToolSpec[]; invoke: ToolInvoker } {
  const tools: ToolSpec[] = [
    {
      name: "create_vault",
      description:
        "Create a 1:1 USDC-backed vault for this persona. The human is the manager; you (the agent) can withdraw within the daily limit. Use for earmarking funds to a purpose.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Vault name, e.g. 'Groceries'" },
          symbol: { type: "string", description: "Short symbol, e.g. vUSDC" },
          dailyWithdrawLimit: {
            type: "number",
            description: "Max USDC you may withdraw per day (0 = unlimited)",
          },
        },
        required: ["name", "symbol"],
      },
    },
    {
      name: "list_vaults",
      description: "List this persona's vaults (symbol + collectionId).",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "withdraw_from_vault",
      description:
        "Withdraw USDC from a vault into this persona's wallet (within the vault's daily limit). The base USDC can then be spent.",
      parameters: {
        type: "object",
        properties: {
          collectionId: {
            type: "string",
            description: "The vault's collectionId",
          },
          amountUsdc: { type: "number", description: "USDC to withdraw" },
        },
        required: ["collectionId", "amountUsdc"],
      },
    },
  ];

  const invoke: ToolInvoker = async (name, args) => {
    if (name === "create_vault") {
      if (
        !(await engine.authorizer.authorize(personaId, {
          capability: "vault.create",
          summary: `create vault ${String(args.symbol)}`,
        }))
      )
        return "Denied: no permission to create vaults.";
      const v = await engine.vaults.create(personaId, {
        name: String(args.name),
        symbol: String(args.symbol),
        dailyWithdrawLimit:
          args.dailyWithdrawLimit != null
            ? Number(args.dailyWithdrawLimit)
            : undefined,
      });
      return `Created vault ${v.symbol} (collection ${v.collectionId}); the human is the manager. Fund it from your wallet to start.`;
    }
    if (name === "list_vaults") {
      const vs = engine.vaults.list(personaId);
      return vs.length
        ? vs
            .map(
              (v) => `${v.symbol} — collection ${v.collectionId} (${v.name})`,
            )
            .join("; ")
        : "No vaults yet.";
    }
    if (name === "withdraw_from_vault") {
      const micro = String(Math.round(Number(args.amountUsdc) * 1e6));
      if (
        !(await engine.authorizer.authorize(personaId, {
          capability: "vault.withdraw",
          target: String(args.collectionId),
          summary: `withdraw ${args.amountUsdc} USDC from vault ${String(args.collectionId)}`,
        }))
      )
        return "Denied: no permission to withdraw from vaults.";
      const p = await engine.vaults.withdraw(
        personaId,
        String(args.collectionId),
        micro,
      );
      return `Withdrawal of ${args.amountUsdc} USDC submitted (tx ${(p.hash ?? p.id).slice(0, 10)}); confirming on-chain.`;
    }
    return `unknown tool: ${name}`;
  };

  return { tools, invoke };
}
