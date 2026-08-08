/**
 * Typed API client. Phase F1.4.
 *
 * The ONLY place the console talks to the router. Every shape is imported from
 * @axis/shared or mirrors the router's response — the UI never re-declares a
 * type, so backend and frontend cannot drift.
 */
const BASE = process.env.NEXT_PUBLIC_ROUTER_URL ?? "http://localhost:8080";

export interface QuoteResponse {
  runId: string;
  quoteId: string;
  workflow: string;
  network: string;
  dag: { batches: string[][]; edges: { from: string; to: string }[] };
  legs: { stepId: string; provider: string; payTo: string; priceUSDC: string; asset: string }[];
  subtotalUSDC: string;
  routingFeeUSDC: string;
  totalUSDC: string;
  expiresAt: string;
  signature: string;
}

export interface ExecuteResponse {
  runId: string;
  groupId: string;
  confirmedRound: number;
  txids: { stepId: string; provider: string; payTo: string; txid: string; amountUSDC: string; explorerUrl: string }[];
}

export interface ApiError {
  error: { code: string; message: string; costedNothing?: boolean };
}

export interface ReceiptSummary {
  receiptId: string;
  workflow: string;
  status: string;
  agentAddress: string;
  groupId: string;
  totalUSDC: string;
  refundedUSDC: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: { id: string; email: string };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw json as ApiError;
  return json as T;
}

export const api = {
  quote: (agentAddress: string, inputs: Record<string, unknown>, workflow = "pr-review") =>
    post<QuoteResponse>("/v1/workflow/quote", { workflow, agentAddress, inputs }),

  execute: (quoteId: string, runId?: string) =>
    post<ExecuteResponse>("/v1/workflow/execute", { quoteId, runId }),

  /** Demo: force a named step to fail after payment (compensation path). */
  executeChaos: (quoteId: string, runId: string, chaos: string) =>
    post<ExecuteResponse>("/v1/workflow/execute", { quoteId, runId, chaos }),

  /** Pre-settle a real payment so the next attack fires instantly (~2s not ~7s). */
  primeAttack: () => post<{ proof: string }>("/v1/redteam/prime", {}),

  /** Fire a red-team attack against our own endpoints; returns the block result.
   *  Pass a primed proof to skip the on-chain settle on the click. */
  attack: (id: string, proof?: string) => post<{ fired: number; blocked: number; granted: number; mitigation: string; detail: string; sample?: string[] }>(`/v1/redteam/${id}`, { proof }),

  /** Every run/receipt in the DB, newest first. */
  receipts: () => fetch(`${BASE}/v1/receipts`).then((r) => r.json() as Promise<{ receipts: ReceiptSummary[] }>),

  /** JWT auth — plain email + password, no third-party provider. */
  signup: (email: string, password: string) => post<AuthResponse>("/v1/auth/signup", { email, password }),
  login: (email: string, password: string) => post<AuthResponse>("/v1/auth/login", { email, password }),

  /** SSE endpoint URL for a run — consumed by useRunStream. */
  eventsUrl: (runId: string) => `${BASE}/v1/runs/${runId}/events`,
};

// ── Client-side session (localStorage). No secrets — just the JWT + email. ──
export const session = {
  save: (a: AuthResponse) => {
    if (typeof window === "undefined") return;
    localStorage.setItem("axis_token", a.token);
    localStorage.setItem("axis_email", a.user.email);
  },
  email: () => (typeof window === "undefined" ? null : localStorage.getItem("axis_email")),
  token: () => (typeof window === "undefined" ? null : localStorage.getItem("axis_token")),
  clear: () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem("axis_token");
    localStorage.removeItem("axis_email");
  },
};
