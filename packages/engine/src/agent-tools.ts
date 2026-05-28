import { CapabilityDeniedError } from "@vellum/capabilities";
import type { ToolInvoker, ToolSpec } from "@vellum/agent";
import { env } from "@vellum/shared";
import type { Engine } from "./engine.ts";

// Format a µ-denom integer string as a 2dp USDC figure (6 dp denom).
function fmtUsdc(micro: string): string {
  return (Number(micro) / 1e6).toFixed(2);
}

// Validate + convert an LLM-supplied USDC amount to a positive integer µUSDC
// string, or null if it's not a finite number > 0 (so 0/negative/NaN/Infinity
// never reach the tx lifecycle — !58). The caller returns a clean tool message
// on null rather than throwing into the agent loop.
function microOrNull(amountUsdc: unknown): string | null {
  const n = Number(amountUsdc);
  if (!Number.isFinite(n) || n <= 0) return null;
  const micro = Math.round(n * 1e6);
  return micro > 0 ? String(micro) : null;
}

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
    {
      name: "pay_from_vault",
      description:
        "Pay USDC from a vault DIRECTLY to a recipient address, within the vault's on-chain limits (amount cap / time lock / multi-sig). Over-limit, locked, or unsigned-off pays are rejected on-chain — money never leaves. Use this to pay a vendor/person from earmarked vault funds.",
      parameters: {
        type: "object",
        properties: {
          collectionId: {
            type: "string",
            description: "The vault's collectionId",
          },
          amountUsdc: { type: "number", description: "USDC to pay" },
          to: {
            type: "string",
            description: "Recipient's bb1 wallet address",
          },
        },
        required: ["collectionId", "amountUsdc", "to"],
      },
    },
  ];

  // VaultService gates create/withdraw at the chokepoint (#37) and throws
  // CapabilityDeniedError on deny — caught here so the agent gets a clean message.
  // tool_call telemetry (#42): each value-moving vault tool call lands on the
  // activity timeline with ok/err (metadata only).
  const emitVaultTool = (tool: string, ok: boolean) =>
    engine.events.emit({
      personaId,
      kind: "tool_call",
      summary: `vault:${tool}`,
      ok,
      meta: { tool, source: "vault" },
    });

  const invoke: ToolInvoker = async (name, args) => {
    try {
      if (name === "create_vault") {
        const v = await engine.vaults.create(personaId, {
          name: String(args.name),
          symbol: String(args.symbol),
          dailyWithdrawLimit:
            args.dailyWithdrawLimit != null
              ? Number(args.dailyWithdrawLimit)
              : undefined,
        });
        emitVaultTool("create_vault", true);
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
        const micro = microOrNull(args.amountUsdc);
        if (!micro) return "Amount must be a positive number of USDC.";
        const p = await engine.vaults.withdraw(
          personaId,
          String(args.collectionId),
          micro,
        );
        emitVaultTool("withdraw_from_vault", true);
        return `Withdrawal of ${args.amountUsdc} USDC submitted (tx ${(p.hash ?? p.id).slice(0, 10)}); confirming on-chain.`;
      }
      if (name === "pay_from_vault") {
        const micro = microOrNull(args.amountUsdc);
        if (!micro) return "Amount must be a positive number of USDC.";
        const p = await engine.vaults.pay(
          personaId,
          String(args.collectionId),
          micro,
          String(args.to),
        );
        emitVaultTool("pay_from_vault", true);
        return `Payment of ${args.amountUsdc} USDC to ${args.to} submitted (tx ${(p.hash ?? p.id).slice(0, 10)}); confirming on-chain. It is rejected if it exceeds the vault's limits.`;
      }
      return `unknown tool: ${name}`;
    } catch (e) {
      if (e instanceof CapabilityDeniedError) {
        emitVaultTool(name, false); // gate denied → record the blocked attempt
        return `Denied: ${e.action.summary}.`;
      }
      throw e;
    }
  };

  return { tools, invoke };
}

// Read-only balance/escrow tool (#51). The agent must know what it has before it
// acts (pay/withdraw), so this is exposed in EVERY run — including read-only /
// proactive runs (T-13) — because it moves no value. Reads are chain truth: the
// persona's own wallet USDC + its per-vault escrow (the agent's holding of each
// vault's tokens). Scoped to ONE persona via the closure.
export function balanceTools(
  engine: Engine,
  personaId: string,
): { tools: ToolSpec[]; invoke: ToolInvoker } {
  const tools: ToolSpec[] = [
    {
      name: "check_balance",
      description:
        "Read this persona's own funds: free USDC in the wallet plus the USDC escrowed in each vault. Use before paying or withdrawing so you know what is available. Read-only.",
      parameters: { type: "object", properties: {} },
    },
  ];

  const invoke: ToolInvoker = async (name) => {
    if (name !== "check_balance") return `unknown tool: ${name}`;
    const coins = await engine.wallets.balanceFor(personaId);
    const walletMicro =
      coins.find((c) => c.denom === env.VELLUM_DENOM)?.amount ?? "0";
    const vaults = engine.vaults.list(personaId);
    const escrows = await Promise.all(
      vaults.map(async (v) => ({
        symbol: v.symbol,
        collectionId: v.collectionId,
        escrowedMicro: (await engine.vaults.escrow(personaId, v.collectionId))
          .escrowedMicro,
      })),
    );
    // tool_call telemetry (#42): record the read happened (metadata only).
    engine.events.emit({
      personaId,
      kind: "tool_call",
      summary: "balance:check_balance",
      ok: true,
      meta: { tool: "check_balance", source: "balance" },
    });
    const vaultLines = escrows.length
      ? escrows
          .map(
            (e) =>
              `${e.symbol} (collection ${e.collectionId}): ${fmtUsdc(e.escrowedMicro)} USDC escrowed`,
          )
          .join("; ")
      : "no vaults";
    return `Wallet: ${fmtUsdc(walletMicro)} USDC free. Vaults: ${vaultLines}.`;
  };

  return { tools, invoke };
}
