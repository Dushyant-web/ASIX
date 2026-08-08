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

  /** SSE endpoint URL for a run — consumed by useRunStream. */
  eventsUrl: (runId: string) => `${BASE}/v1/runs/${runId}/events`,
};
