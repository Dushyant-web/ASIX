/**
 * The generic paid-endpoint pipeline. Every provider is this plus a prompt.
 *
 * Order is the security property:
 *   validate input -> VERIFY PAYMENT -> call the model -> return
 * The model is never invoked for an unpaid or malformed request.
 */
import type { Context } from "hono";
import { z } from "zod";
import { challenge402, verifyPayment, type ProviderConfig, type ProviderEnv } from "./x402.ts";

/** Cap request size so a caller cannot run up our token bill on one call. */
const MAX_INPUT_CHARS = 24_000;

export interface HandlerDeps<I, O> {
  cfg: ProviderConfig;
  input: z.ZodType<I>;
  run: (input: I, env: ProviderEnv) => Promise<O>;
}

export async function paidHandler<I, O>(
  c: Context,
  { cfg, input, run }: HandlerDeps<I, O>,
): Promise<Response> {
  const env = c.env as ProviderEnv;

  // 1. No payment header at all -> issue the challenge. This is the x402 entry.
  const header = c.req.header("X-PAYMENT");
  if (!header) return challenge402(c, cfg, env);

  // 2. Validate the body BEFORE spending anything on verification.
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: "INVALID_INPUT", message: "body must be JSON" } }, 400);
  }

  const raw = JSON.stringify(body);
  if (raw.length > MAX_INPUT_CHARS) {
    // Reject rather than silently truncate: a caller who paid deserves either
    // a real answer or a clear refusal, never a quietly degraded one.
    return c.json(
      {
        error: {
          code: "INPUT_TOO_LARGE",
          message: `input is ${raw.length} chars; limit is ${MAX_INPUT_CHARS}`,
        },
      },
      400,
    );
  }

  const parsed = input.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "invalid" } },
      400,
    );
  }

  // 3. Verify payment. Still no model call.
  const payment = await verifyPayment(header, cfg, env, c.req.url);
  if (!payment.ok) {
    return c.json({ error: { code: "PAYMENT_INVALID", message: payment.error } }, 402);
  }

  // 4. Paid and valid — now do the work.
  const started = Date.now();
  try {
    const result = await run(parsed.data, env);
    c.header("X-PAYMENT-RESPONSE", btoa(JSON.stringify({ txid: payment.txid ?? null })));
    return c.json({ provider: cfg.name, result, latencyMs: Date.now() - started });
  } catch (e) {
    // Payment settled but we failed to deliver. 502 is the signal the router
    // uses to issue a compensation leg and mark the run PARTIAL.
    return c.json(
      {
        error: {
          code: "PROVIDER_EXECUTION_FAILED",
          message: (e as Error).message,
          paid: true,
        },
      },
      502,
    );
  }
}
