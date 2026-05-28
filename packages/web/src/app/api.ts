// Thin typed client over the Hono API. Mirrors the server response shapes.

export interface Soul {
  name: string;
  role: string;
  voice: string;
  values?: string[];
}
export interface Persona {
  id: string;
  name: string;
  soul: Soul;
  created: number;
  address: string | null;
}
export interface LedgerEntry {
  id: number;
  ts: number;
  personaId: string;
  kind: string;
  summary: string;
  authority: string;
  costUsd: number;
  tokens: number;
  txHash: string | null;
}
export interface LedgerSummary {
  entries: number;
  totalCostUsd: number;
  totalTokens: number;
  byKind: Record<string, number>;
}
export interface ChatReply {
  reply: string;
  personaId: string;
  costUsd: number;
  tokens: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok)
    throw new ApiError(
      res.status,
      body.error || `${res.status} ${res.statusText}`,
    );
  return body;
}

export const api = {
  // Auth (#27 boundary): authRequired=false on loopback dev (open). The session
  // cookie is httpOnly, so login/logout go through the server, not page JS.
  authStatus: () =>
    fetch("/api/auth").then((r) =>
      json<{ authRequired: boolean; authed: boolean }>(r),
    ),
  login: (token: string) =>
    fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }).then((r) => json<{ ok: boolean }>(r)),
  logout: () =>
    fetch("/api/logout", { method: "POST" }).then((r) =>
      json<{ ok: boolean }>(r),
    ),

  // Public chain config + the approved-models allowlist (#43) for the UI.
  config: () =>
    fetch("/api/config").then((r) =>
      json<{
        chainId: string;
        rpc: string;
        lcd: string;
        denom: string;
        models: string[];
      }>(r),
    ),

  // Onboarding setup status (#19) — what's configured, so the UI can guide a
  // from-scratch user through web onboarding.
  setupStatus: () =>
    fetch("/api/setup-status").then((r) => json<SetupStatus>(r)),

  // First-run web setup (#54): persist the LLM key + agent wallet (generate
  // server-side, or import) so the running daemon adopts them. Returns the
  // generated mnemonic ONCE (to back up) when no mnemonic was supplied.
  setup: (input: {
    openRouterKey?: string;
    mnemonic?: string;
    apiToken?: string;
  }) =>
    fetch("/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<{ ok: boolean; generatedMnemonic: string | null }>(r)),

  listPersonas: () =>
    fetch("/api/personas")
      .then((r) => json<{ personas: Persona[] }>(r))
      .then((b) => b.personas),

  createPersona: (input: { name: string; role?: string; voice?: string }) =>
    fetch("/api/personas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<{ persona: Persona; address: string }>(r)),

  wallet: (id: string) =>
    fetch(`/api/personas/${id}/wallet`).then((r) =>
      json<{ address: string; usdc: string }>(r),
    ),

  faucet: (id: string) =>
    fetch(`/api/personas/${id}/faucet`, { method: "POST" }).then((r) =>
      json<{ txHash?: string; amount?: string; denom?: string }>(r),
    ),

  ledger: (id: string) =>
    fetch(`/api/personas/${id}/ledger`).then((r) =>
      json<{ entries: LedgerEntry[]; summary: LedgerSummary }>(r),
    ),

  chat: (input: {
    conversationId: string;
    personaId: string;
    message: string;
  }) =>
    fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<ChatReply>(r)),

  budget: (id: string) =>
    fetch(`/api/personas/${id}/budget`).then((r) => json<BudgetResponse>(r)),

  setBudgetLimits: (id: string, limits: BudgetLimits) =>
    fetch(`/api/personas/${id}/budget-limits`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(limits),
    }).then((r) => json<Resolved<BudgetLimits>>(r)),

  // Per-persona model override (#43).
  getModel: (id: string) =>
    fetch(`/api/personas/${id}/model`).then((r) =>
      json<Resolved<string | null>>(r),
    ),
  setModel: (id: string, model: string | null) =>
    fetch(`/api/personas/${id}/model`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model }),
    }).then((r) => json<Resolved<string | null>>(r)),

  // Observability event timeline + window summary (#42).
  events: (id: string, limit = 100) =>
    fetch(`/api/personas/${id}/events?limit=${limit}`).then((r) =>
      json<{ summary: EventSummary; events: EventItem[] }>(r),
    ),

  // PUBLIC multisig sign-off info for a vault (#45 slice 3) — for the /vote page.
  vaultSignoff: (collectionId: string) =>
    fetch(`/api/vaults/${collectionId}/signoff`).then((r) =>
      json<{
        collectionId: string;
        name: string;
        symbol: string;
        approvalId: string;
        proposalId: string;
        threshold: number;
        signers: { address: string; weight?: number }[];
      }>(r),
    ),

  // Vault escrow — locked backing balance (#45).
  vaultEscrow: (id: string, collectionId: string) =>
    fetch(`/api/personas/${id}/vaults/${collectionId}/escrow`).then((r) =>
      json<EscrowInfo>(r),
    ),

  // Scheduled tasks (#36) over HTTP.
  tasks: (id: string) =>
    fetch(`/api/personas/${id}/tasks`)
      .then((r) => json<{ tasks: Task[] }>(r))
      .then((b) => b.tasks),
  createTask: (
    id: string,
    input: { prompt: string; everyMinutes: number; armed: boolean },
  ) =>
    fetch(`/api/personas/${id}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<Task>(r)),
  cancelTask: (id: string, taskId: string) =>
    fetch(`/api/personas/${id}/tasks/${taskId}`, { method: "DELETE" }).then(
      (r) => json<{ ok: boolean }>(r),
    ),

  listVaults: (id: string) =>
    fetch(`/api/personas/${id}/vaults`)
      .then((r) => json<{ vaults: Vault[] }>(r))
      .then((b) => b.vaults),

  createVault: (
    id: string,
    input: {
      name: string;
      symbol: string;
      dailyWithdrawLimit?: number;
      gating?: VaultGating;
    },
  ) =>
    fetch(`/api/personas/${id}/vaults`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<Vault>(r)),

  vaultWithdraw: (id: string, collectionId: string, amountMicro: string) =>
    fetch(`/api/personas/${id}/vaults/${collectionId}/withdraw`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: amountMicro }),
    }).then((r) => json<{ hash: string; status: string }>(r)),

  createPaymentRequest: (
    id: string,
    input: { amountUsdc: number; memo?: string },
  ) =>
    fetch(`/api/personas/${id}/payment-requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<PaymentRequest>(r)),

  listPaymentRequests: (id: string) =>
    fetch(`/api/personas/${id}/payment-requests`)
      .then((r) => json<{ requests: PaymentRequest[] }>(r))
      .then((b) => b.requests),

  getPaymentRequest: (reqId: string) =>
    fetch(`/api/payment-requests/${reqId}`).then((r) =>
      json<{ request: PaymentRequest; personaName: string }>(r),
    ),

  confirmPaymentRequest: (reqId: string, txHash: string) =>
    fetch(`/api/payment-requests/${reqId}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ txHash }),
    }).then((r) => json<{ ok: boolean; txHash: string; amount: string }>(r)),

  dismissPaymentRequest: (reqId: string) =>
    fetch(`/api/payment-requests/${reqId}`, { method: "DELETE" }).then((r) =>
      json<{ ok: boolean }>(r),
    ),
};

// A pending (outstanding) payment request. Filled ones are deleted — the ledger
// keeps the permanent funding trail — so any request the API returns is pending.
export interface PaymentRequest {
  id: string;
  personaId: string;
  toAddress: string;
  denom: string;
  amount: string; // base µUSDC
  memo: string;
  created: number;
}

// Vault withdrawal gating (#45 slice 2): amount cap per rolling period + a time
// unlock. (Multi-sig via votingChallenges is slice 3.)
export type GatingPeriod = "daily" | "weekly" | "monthly";
export interface VaultGating {
  amount?: { limitUsd: number; period: GatingPeriod };
  time?: { unlockAt?: number }; // epoch ms
  multisig?: {
    signers: { address: string; weight?: number }[];
    threshold: number;
    challengeDelayMs?: number;
  };
}

export interface Vault {
  personaId: string;
  collectionId: string;
  backingAddress: string;
  withdrawApprovalId: string;
  symbol: string;
  name: string;
  gating: VaultGating | null;
  managerAddress: string;
  created: number;
}

// A resolved setting value + where it came from (#40).
export interface Resolved<T> {
  value: T;
  source: "persona" | "global" | "default";
}

// Per-persona budget limits (#44) — any subset; absent = no cap for that window.
export interface BudgetLimits {
  dailyUsd?: number;
  weeklyUsd?: number;
  monthlyUsd?: number;
}
export interface BudgetWindow {
  spentUsd: number;
  capUsd: number;
  remainingUsd: number;
  ok: boolean;
}
export interface BudgetResponse {
  llm: BudgetWindow;
  evaluation: {
    windows: Partial<Record<"daily" | "weekly" | "monthly", BudgetWindow>>;
    ok: boolean;
    breached?: "daily" | "weekly" | "monthly";
  };
  limits: Resolved<BudgetLimits>;
}

// Observability events (#42).
export interface EventItem {
  id: number;
  ts: number;
  kind: string;
  summary: string;
  latencyMs: number;
  costUsd: number;
  tokens: number;
  ok: boolean;
  meta: Record<string, unknown>;
}
export interface EventSummaryWindow {
  events: number;
  costUsd: number;
  tokens: number;
  errors: number;
}
export interface EventSummary {
  byKind: Record<string, number>;
  last24h: EventSummaryWindow;
  last7d: EventSummaryWindow;
  last30d: EventSummaryWindow;
}

// Onboarding setup status (#19). Booleans/counts only — never secret values or
// local path material (the route is unauthenticated).
export interface SetupStatus {
  hasLlmKey: boolean;
  hasWallet: boolean;
  personaCount: number;
  daemonExposed: boolean;
}

export interface EscrowInfo {
  collectionId: string;
  backingAddress: string;
  denom: string;
  escrowedMicro: string;
}

// Scheduled task (#36) — armed=false runs read-only (#24/T-13).
export interface Task {
  id: string;
  personaId: string;
  prompt: string;
  intervalMs: number;
  nextRun: number;
  enabled: boolean;
  armed: boolean;
  created: number;
}
