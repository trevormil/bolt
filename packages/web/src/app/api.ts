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

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`);
  return body;
}

export const api = {
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
    fetch(`/api/personas/${id}/budget`).then((r) =>
      json<{
        llm: {
          spentUsd: number;
          capUsd: number;
          remainingUsd: number;
          ok: boolean;
        };
        freeform: {
          balanceUsd: number;
          capUsd: number;
          headroomUsd: number;
          atCap: boolean;
        };
      }>(r),
    ),

  listVaults: (id: string) =>
    fetch(`/api/personas/${id}/vaults`)
      .then((r) => json<{ vaults: Vault[] }>(r))
      .then((b) => b.vaults),

  createVault: (
    id: string,
    input: { name: string; symbol: string; dailyWithdrawLimit?: number },
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
    }).then((r) => json<PaymentRequest>(r)),
};

export interface PaymentRequest {
  id: string;
  personaId: string;
  toAddress: string;
  denom: string;
  amount: string; // base µUSDC
  memo: string;
  status: "pending" | "paid";
  txHash: string | null;
  created: number;
  paidAt: number | null;
}

export interface Vault {
  personaId: string;
  collectionId: string;
  backingAddress: string;
  withdrawApprovalId: string;
  symbol: string;
  name: string;
  created: number;
}
