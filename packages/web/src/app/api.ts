// Thin typed client over the Hono API. Mirrors the server response shapes.

export interface Soul {
  name: string;
  role: string;
  voice: string;
  values?: string[];
  // PERSONA.md (#87): freeform instructions appended to every request; supersedes
  // role/voice when set.
  instructions?: string;
}
export interface Persona {
  id: string;
  name: string;
  soul: Soul;
  created: number;
  address: string | null;
}
export interface ChatReply {
  reply: string;
  personaId: string;
  costUsd: number;
  tokens: number;
}

// A chat session (#72) — one of possibly many conversations under a persona.
export interface Conversation {
  id: string;
  personaId: string;
  title: string;
  created: number;
  updated: number;
  // Origin surface (#78): "telegram" threads sync in from the bot; "web" is the app.
  source: "web" | "telegram";
}
export interface ConversationMessage {
  id: number;
  conversationId: string;
  role: "user" | "agent";
  text: string;
  created: number;
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

// Multisig vault sign-off progress (#83), mirrored from the server's voteTally.
export interface VoteTally {
  threshold: number;
  totalWeight: number;
  yesWeight: number;
  signedCount: number;
  totalSigners: number;
  quorumMet: boolean;
  signers: {
    address: string;
    weight: number;
    vote: "yes" | "no" | "pending";
  }[];
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

  // First-run web setup (#19): persist the LLM key (REQUIRED + health-checked,
  // #60) + auto-generate the agent wallet (#59, no import) so the running daemon
  // adopts them. The generated phrase is the agent's key — NEVER returned to the
  // browser (reveal it deliberately from Settings → Export, #57).
  setup: (input: {
    openRouterKey: string;
    apiToken?: string;
    // Optional Telegram remote control (#49) — the bot polls OUT, so no daemon
    // exposure is needed. Blank = no bot. Takes effect on the next daemon start.
    telegramBotToken?: string;
    telegramPrincipalChatId?: string;
  }) =>
    fetch("/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) =>
      json<{
        ok: boolean;
        telegramEnabled?: boolean;
        telegramUsername?: string;
      }>(r),
    ),

  // Set / change / reset the OpenRouter key after onboarding (#60). Validated
  // server-side before it's persisted.
  setOpenRouterKey: (key: string) =>
    fetch("/api/settings/openrouter-key", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    }).then((r) => json<{ ok: boolean }>(r)),

  // Set / rotate / clear the Telegram bot token after onboarding (#63).
  // getMe-validated server-side; empty token clears it. Returns the bot @username
  // on success so the UI can confirm the connection.
  setTelegramToken: (input: { token: string; principalChatId?: string }) =>
    fetch("/api/settings/telegram", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) =>
      json<{ ok: boolean; configured: boolean; username?: string }>(r),
    ),

  // Reveal the agent's master mnemonic for backup (#57). Loopback + authed; the
  // one place the phrase travels to the browser, fetched only on a deliberate
  // Settings → Export action.
  agentMnemonic: () =>
    fetch("/api/agent/mnemonic").then((r) => json<{ mnemonic: string }>(r)),

  listPersonas: () =>
    fetch("/api/personas")
      .then((r) => json<{ personas: Persona[] }>(r))
      .then((b) => b.personas),

  createPersona: (input: {
    name: string;
    role?: string;
    voice?: string;
    // PERSONA.md (#87) — the freeform instructions doc for this persona.
    instructions?: string;
  }) =>
    fetch("/api/personas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<{ persona: Persona; address: string }>(r)),

  // Update a persona's PERSONA.md instructions (#87). Empty string clears it.
  updatePersonaInstructions: (id: string, instructions: string) =>
    fetch(`/api/personas/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instructions }),
    }).then((r) => json<{ persona: Persona }>(r)),

  wallet: (id: string) =>
    fetch(`/api/personas/${id}/wallet`).then((r) =>
      json<{ address: string; usdc: string }>(r),
    ),

  faucet: (id: string) =>
    fetch(`/api/personas/${id}/faucet`, { method: "POST" }).then((r) =>
      json<{ txHash?: string; amount?: string; denom?: string }>(r),
    ),

  // Send USDC from this persona's wallet (#65). Server-signed through the gated
  // txManager.spend chokepoint — the same path the agent's send_usdc tool and
  // Telegram /spend use. `amount` is a base-unit (µUSDC) integer string.
  spend: (id: string, body: { to: string; amount: string }) =>
    fetch(`/api/personas/${id}/spend`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) =>
      json<{ id: string; hash: string | null; status: string }>(r),
    ),

  chat: (input: {
    conversationId: string;
    personaId: string;
    message: string;
    // The connected Keplr address (#73) — sent so the agent knows "my wallet".
    humanAddress?: string;
  }) =>
    fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<ChatReply>(r)),

  // Chat sessions per persona (#72) — list / create / rename / delete + the
  // persisted transcript. Scoped per persona server-side (memory wall).
  listConversations: (personaId: string) =>
    fetch(`/api/personas/${personaId}/conversations`)
      .then((r) => json<{ conversations: Conversation[] }>(r))
      .then((b) => b.conversations),

  createConversation: (personaId: string, title?: string) =>
    fetch(`/api/personas/${personaId}/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(title ? { title } : {}),
    }).then((r) => json<Conversation>(r)),

  renameConversation: (personaId: string, cid: string, title: string) =>
    fetch(`/api/personas/${personaId}/conversations/${cid}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    }).then((r) => json<Conversation>(r)),

  deleteConversation: (personaId: string, cid: string) =>
    fetch(`/api/personas/${personaId}/conversations/${cid}`, {
      method: "DELETE",
    }).then((r) => json<{ ok: boolean }>(r)),

  conversationMessages: (personaId: string, cid: string) =>
    fetch(`/api/personas/${personaId}/conversations/${cid}/messages`)
      .then((r) => json<{ messages: ConversationMessage[] }>(r))
      .then((b) => b.messages),

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

  // Unified observability feed (#95) — merged events + ledger, summary, latency
  // breakdown, budget windows + month-end burn-down. Replaces the separate
  // events + ledger reads the Activity and Ledger screens used.
  observability: (id: string, limit = 200) =>
    fetch(`/api/personas/${id}/observability?limit=${limit}`).then((r) =>
      json<ObservabilityResponse>(r),
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
        // Live on-chain sign-off progress (#83); null + tallyError when the chain
        // read failed (distinct from a genuine zero).
        tally: VoteTally | null;
        tallyError: boolean;
        // Scope context (#126) — render the powers the signer is authorizing.
        personaName: string;
        agentAddress: string;
        managerAddress: string;
        gating: VaultGating;
      }>(r),
    ),

  // Vault escrow — locked backing balance (#45).
  vaultEscrow: (id: string, collectionId: string) =>
    fetch(`/api/personas/${id}/vaults/${collectionId}/escrow`).then((r) =>
      json<EscrowInfo>(r),
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
      // The human manager (#75) — the connected Keplr address.
      managerAddress?: string;
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
    }).then((r) =>
      json<{ id: string; hash: string | null; status: string }>(r),
    ),

  // Poll a submitted tx toward its terminal state (#81) so a withdrawal shows
  // pending → confirmed/failed instead of appearing to hang.
  txStatus: (id: string, txId: string) =>
    fetch(`/api/personas/${id}/tx/${txId}`).then((r) =>
      json<{
        id: string;
        hash: string | null;
        status: "submitting" | "pending" | "confirmed" | "failed";
        height: number | null;
        error: string | null;
      }>(r),
    ),

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

  // Vault deposit requests (#62) — the "fund this vault" analog, mirroring the
  // payment-request methods above.
  createDepositRequest: (
    id: string,
    input: { collectionId: string; amountUsdc: number; memo?: string },
  ) =>
    fetch(`/api/personas/${id}/deposit-requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<DepositRequest>(r)),

  listDepositRequests: (id: string) =>
    fetch(`/api/personas/${id}/deposit-requests`)
      .then((r) => json<{ requests: DepositRequest[] }>(r))
      .then((b) => b.requests),

  getDepositRequest: (reqId: string) =>
    fetch(`/api/deposit-requests/${reqId}`).then((r) =>
      json<{ request: DepositRequest; personaName: string }>(r),
    ),

  // No confirm method (#62): a third-party funder just signs the deposit; the
  // persona owner dismisses the (authed) request once the vault shows funded.
  dismissDepositRequest: (reqId: string) =>
    fetch(`/api/deposit-requests/${reqId}`, { method: "DELETE" }).then((r) =>
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

// A pending vault deposit request (#62) — the "fund this vault" analog. Carries
// the vault context the /deposit page needs to build `vaultDepositMsg`. Filled
// ones are deleted (the deposit is on-chain), so any request returned is pending.
export interface DepositRequest {
  id: string;
  personaId: string;
  collectionId: string;
  vaultSymbol: string;
  vaultName: string;
  backingAddress: string;
  agentAddress: string; // recipient of the minted vault tokens (the persona)
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
  time?: { unlockAt?: number; expiresAt?: number }; // epoch ms; start / end
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

// Unified observability feed (#95) — one timeline merging operational events with
// proof-of-action ledger settlement (authority + on-chain tx).
export type ObservabilitySource = "event" | "ledger";
export interface UnifiedRow {
  id: string;
  ts: number;
  kind: string;
  summary: string;
  source: ObservabilitySource;
  latencyMs?: number;
  costUsd: number;
  tokens: number;
  ok?: boolean;
  authority?: string;
  txHash?: string | null;
  meta: Record<string, unknown>;
}
export interface Burndown {
  projectedUsd: number;
  capUsd?: number;
  willBreach: boolean;
}
export interface ObservabilityResponse {
  summary: EventSummary;
  latencyByKind: Record<string, number>;
  rows: UnifiedRow[];
  budget: {
    llm: BudgetWindow;
    evaluation: BudgetResponse["evaluation"];
    burndown: Burndown;
  };
}

// Onboarding setup status (#19). Booleans/counts only — never secret values or
// local path material (the route is unauthenticated).
export interface SetupStatus {
  hasLlmKey: boolean;
  hasWallet: boolean;
  personaCount: number;
  daemonExposed: boolean;
  telegramConfigured?: boolean;
}

export interface EscrowInfo {
  collectionId: string;
  backingAddress: string;
  denom: string;
  // null when the chain LCD read failed (#104 §1). The UI surfaces "unknown"
  // rather than coercing to 0, which would mislead the user into a duplicate
  // deposit.
  escrowedMicro: string | null;
}
