import { CapabilityDeniedError } from "@vellum/capabilities";
import type { ToolInvoker, ToolSpec } from "@vellum/agent";
import { isBb1Address } from "@vellum/tx";
import type { VaultGating } from "@vellum/tokenization";
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

// A withdrawal period accepted by the amount-cap gating, derived from the
// tokenization type so it can't drift ("daily" | "weekly" | "monthly").
type GatingPeriod = NonNullable<VaultGating["amount"]>["period"];
const PERIODS: GatingPeriod[] = ["daily", "weekly", "monthly"];

// Parse a friendly date input to epoch ms: a number (ms if ≥1e12, else seconds),
// an ISO date/datetime string (e.g. "2026-06-01"), or a relative offset like
// "+7d" / "+24h" / "+2w". Returns null if unparseable. Runtime engine code, so
// Date is available here (the Workflow-script Date restriction does NOT apply).
function toEpochMs(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input))
    return input >= 1e12 ? input : input >= 1e9 ? input * 1000 : null;
  const s = String(input).trim();
  const rel = /^\+(\d+)\s*([hdw])$/i.exec(s);
  if (rel) {
    const unit = { h: 3_600_000, d: 86_400_000, w: 604_800_000 }[
      rel[2]!.toLowerCase() as "h" | "d" | "w"
    ];
    return Date.now() + Number(rel[1]) * unit;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

// Plain-English suffix summarizing a gating policy, for the create_vault reply.
function describeGating(g: VaultGating): string {
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const parts: string[] = [];
  if (g.amount)
    parts.push(`limit ${g.amount.limitUsd} USDC/${g.amount.period}`);
  if (g.time?.unlockAt) parts.push(`unlocks ${iso(g.time.unlockAt)}`);
  if (g.time?.expiresAt) parts.push(`expires ${iso(g.time.expiresAt)}`);
  if (g.multisig)
    parts.push(
      `${g.multisig.threshold}-of-${g.multisig.signers.length} sign-off`,
    );
  return parts.length ? ` (${parts.join(", ")})` : "";
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
        "Create a 1:1 USDC-backed vault for this persona, with optional withdrawal rules that constrain YOU (the agent) — the human is always the manager. Earmark funds to a purpose and set how you're allowed to take them out: a spend cap per period, a time window, and/or multi-sig sign-off. Omit all rules for an ungated vault.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Vault name, e.g. 'Groceries'" },
          symbol: { type: "string", description: "Short symbol, e.g. vUSDC" },
          withdrawLimit: {
            type: "number",
            description:
              "Max USDC you may withdraw per period (a rolling cap). Pair with withdrawPeriod.",
          },
          withdrawPeriod: {
            type: "string",
            enum: ["daily", "weekly", "monthly"],
            description: "Period for withdrawLimit. Defaults to daily.",
          },
          unlockAt: {
            type: "string",
            description:
              "Withdrawals invalid BEFORE this time. ISO date (e.g. 2026-06-01) or a relative offset like +7d / +24h / +2w.",
          },
          expiresAt: {
            type: "string",
            description:
              "Withdrawals invalid AFTER this time. Same formats as unlockAt.",
          },
          signers: {
            type: "array",
            items: { type: "string" },
            description:
              "Multi-sig: bb1 addresses whose one-time approval UNLOCKS the vault for you. It's a one-time authorization to operate the vault (not per-withdrawal sign-off); once enough approve, you withdraw freely within the other limits. Requires threshold.",
          },
          threshold: {
            type: "number",
            description:
              "How many of the signers must approve to unlock (the N in N-of-M). Requires signers.",
          },
          dailyWithdrawLimit: {
            type: "number",
            description:
              "Deprecated shorthand for withdrawLimit with a daily period. Prefer withdrawLimit + withdrawPeriod.",
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
        const gating: VaultGating = {};

        // Amount cap. withdrawLimit + period is the full form; dailyWithdrawLimit
        // is the legacy shorthand (→ daily). Either maps to gating.amount so it's
        // persisted on the vault record (the record only stores `gating`).
        const rawLimit = args.withdrawLimit ?? args.dailyWithdrawLimit;
        if (rawLimit != null) {
          const limitUsd = Number(rawLimit);
          if (!Number.isFinite(limitUsd) || limitUsd <= 0)
            return "Withdraw limit must be a positive number of USDC.";
          const period = args.withdrawPeriod
            ? (String(args.withdrawPeriod).toLowerCase() as GatingPeriod)
            : "daily";
          if (!PERIODS.includes(period))
            return "Withdraw period must be daily, weekly, or monthly.";
          gating.amount = { limitUsd, period };
        }

        // Time window. unlockAt = start, expiresAt = end (epoch ms).
        const unlockAt =
          args.unlockAt != null ? toEpochMs(args.unlockAt) : undefined;
        if (args.unlockAt != null && unlockAt == null)
          return "Could not parse unlockAt — use an ISO date (2026-06-01) or a relative offset like +7d.";
        const expiresAt =
          args.expiresAt != null ? toEpochMs(args.expiresAt) : undefined;
        if (args.expiresAt != null && expiresAt == null)
          return "Could not parse expiresAt — use an ISO date or a relative offset like +30d.";
        if (unlockAt != null && expiresAt != null && unlockAt >= expiresAt)
          return "The unlock time must be before the expiry time.";
        if (unlockAt != null || expiresAt != null)
          gating.time = {
            unlockAt: unlockAt ?? undefined,
            expiresAt: expiresAt ?? undefined,
          };

        // Multi-sig. Signer bb1 addresses + an N-of-M threshold.
        const signers = Array.isArray(args.signers)
          ? args.signers.map((s) => String(s).trim()).filter(Boolean)
          : [];
        if (signers.length) {
          if (!signers.every((s) => isBb1Address(s)))
            return "Every multi-sig signer must be a valid bb1 address.";
          const threshold = Number(args.threshold);
          if (
            !Number.isInteger(threshold) ||
            threshold < 1 ||
            threshold > signers.length
          )
            return `Multi-sig threshold must be a whole number between 1 and ${signers.length} (the number of signers).`;
          gating.multisig = {
            signers: signers.map((address) => ({ address })),
            threshold,
          };
        } else if (args.threshold != null) {
          return "Provide signer addresses to use a multi-sig threshold.";
        }

        const hasGating = !!(gating.amount || gating.time || gating.multisig);
        const v = await engine.vaults.create(personaId, {
          name: String(args.name),
          symbol: String(args.symbol),
          gating: hasGating ? gating : undefined,
        });
        emitVaultTool("create_vault", true);
        return `Created vault ${v.symbol} (collection ${v.collectionId})${describeGating(gating)}; the human is the manager. Fund it from your wallet to start.`;
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

// Free-form spend tool (#65): MsgSend USDC from the persona's OWN wallet to any
// bb1 address, through the gated `txManager.spend` chokepoint (capability
// "spend", ledgered). This is the "send USDC" surface — and the second half of
// "withdraw from a vault, then send it somewhere"; pay_from_vault stays the
// atomic vault→recipient path. Withheld from read-only runs (registered only in
// the full tool set, like the vault/exec tools). Scoped to ONE persona.
export function spendTools(
  engine: Engine,
  personaId: string,
): { tools: ToolSpec[]; invoke: ToolInvoker } {
  const tools: ToolSpec[] = [
    {
      name: "send_usdc",
      description:
        "Send USDC from this persona's own wallet to a recipient bb1 address — a plain on-chain transfer. Use to pay someone from your free wallet balance, e.g. after withdrawing from a vault. Gated by the 'spend' capability and recorded in the ledger. To pay directly out of a vault's earmarked funds instead, use pay_from_vault.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient's bb1 wallet address" },
          amountUsdc: { type: "number", description: "USDC to send" },
        },
        required: ["to", "amountUsdc"],
      },
    },
  ];

  const invoke: ToolInvoker = async (name, args) => {
    if (name !== "send_usdc") return `unknown tool: ${name}`;
    const micro = microOrNull(args.amountUsdc);
    if (!micro) return "Amount must be a positive number of USDC.";
    const to = String(args.to).trim();
    if (!isBb1Address(to))
      return "Recipient must be a valid bb1 wallet address.";
    // Unlike the vault tools (which rethrow non-capability errors), send_usdc
    // returns a clean message for ALL failures: txManager.spend() runs a
    // SYNCHRONOUS insufficient-funds pre-check that throws, and that's a normal,
    // agent-recoverable condition — surfacing it as a tool result lets the agent
    // adjust or tell the user rather than aborting the whole turn.
    try {
      const p = await engine.txManager.spend({ personaId, to, amount: micro });
      engine.events.emit({
        personaId,
        kind: "tool_call",
        summary: "spend:send_usdc",
        ok: true,
        meta: { tool: "send_usdc", source: "spend" },
      });
      return `Sent ${args.amountUsdc} USDC to ${to} (tx ${(p.hash ?? p.id).slice(0, 10)}); confirming on-chain.`;
    } catch (e) {
      engine.events.emit({
        personaId,
        kind: "tool_call",
        summary: "spend:send_usdc",
        ok: false,
        meta: { tool: "send_usdc", source: "spend" },
      });
      if (e instanceof CapabilityDeniedError)
        return `Denied: ${e.action.summary}.`;
      return `Send failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  };

  return { tools, invoke };
}
