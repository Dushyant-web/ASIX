/**
 * The AXIS router — Hono app.
 *
 * Phase 3 surface: quote (price discovery, zero payments) + the SSE event
 * stream that drives the console + health. Execute/receipt land in Phase 4/5.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { AxisError } from "@axis/shared";
import type { Config } from "./config.ts";
import { WORKFLOWS } from "./workflows/pr-review.ts";
import { buildQuote, quoteToJson, persistQuote } from "./engine/quote.ts";
import { subscribe } from "./bus.ts";
import { execute } from "./engine/execute.ts";
import { buildReceipt } from "./engine/receipt.ts";
import { randomUUID } from "node:crypto";

export function createApp(cfg: Config) {
  const app = new Hono();

  // The console (browser) calls quote/execute and opens the SSE stream.
  app.use("*", cors({ origin: "*", allowHeaders: ["content-type", "idempotency-key"], allowMethods: ["GET", "POST", "OPTIONS"] }));

  app.get("/healthz", (c) => c.json({ ok: true }));

  app.get("/readyz", async (c) => {
    // Ready = every configured provider answers its /health.
    const steps = WORKFLOWS["pr-review"]?.steps ?? [];
    const checks = await Promise.allSettled(
      steps.map(async (step) => {
        const base = cfg[step.endpointEnv as keyof Config] as string;
        const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(4000) });
        if (!r.ok) throw new Error(`${step.provider} ${r.status}`);
      }),
    );
    const down = checks
      .map((r, i) => (r.status === "rejected" ? steps[i]!.provider : null))
      .filter(Boolean);
    return c.json({ ok: down.length === 0, ...(down.length ? { down } : {}) }, down.length ? 503 : 200);
  });

  /**
   * POST /v1/workflow/quote — fan out unpaid probes, return a signed quote.
   * No payment occurs. A runId is minted so the console can stream the probes
   * and challenges live via GET /v1/runs/:id/events.
   */
  app.post("/v1/workflow/quote", async (c) => {
    let body: { workflow?: string; agentAddress?: string; inputs?: Record<string, unknown> };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { code: "INVALID_WORKFLOW", message: "body must be JSON" } }, 400);
    }

    const workflow = WORKFLOWS[body.workflow ?? "pr-review"];
    if (!workflow) {
      return c.json({ error: { code: "INVALID_WORKFLOW", message: `unknown workflow ${body.workflow}` } }, 400);
    }
    if (!body.agentAddress || body.agentAddress.length !== 58) {
      return c.json({ error: { code: "INVALID_WORKFLOW", message: "agentAddress must be a 58-char Algorand address" } }, 400);
    }

    const runId = `run_${randomUUID().slice(0, 12)}`;
    try {
      const quote = await buildQuote(workflow, body.agentAddress, body.inputs ?? {}, cfg, runId);
      await persistQuote(quote, body.inputs ?? {}, cfg.DATABASE_URL);
      // A policy FAIL is returned with the quote (402) so the console can show
      // exactly which rule blocked it — but it is a hard block: execute will
      // refuse a quote whose stored verdict is FAIL.
      const status = quote.policy.verdict === "FAIL" ? 402 : 200;
      return c.json({ runId, ...quoteToJson(quote) }, status);
    } catch (e) {
      if (e instanceof AxisError) {
        return c.json({ runId, ...e.toJSON() }, e.http as 400 | 402 | 502);
      }
      return c.json({ runId, error: { code: "INTERNAL", message: (e as Error).message } }, 500);
    }
  });

  /**
   * POST /v1/workflow/execute — compose, simulate, settle the atomic group.
   * The one endpoint where money actually moves. Requires an Idempotency-Key.
   */
  app.post("/v1/workflow/execute", async (c) => {
    let body: { quoteId?: string; chaos?: string; runId?: string };
    try { body = await c.req.json(); } catch {
      return c.json({ error: { code: "INVALID_WORKFLOW", message: "body must be JSON" } }, 400);
    }
    if (!body.quoteId) {
      return c.json({ error: { code: "INVALID_WORKFLOW", message: "quoteId required" } }, 400);
    }
    // Reuse the runId minted at quote time so the console — already subscribed
    // to that run's SSE stream — sees the settle and execute events too. Only
    // mint a fresh one if the client did not carry it through.
    const runId = body.runId ?? `run_${crypto.randomUUID().slice(0, 12)}`;
    try {
      const result = await execute(body.quoteId, cfg, runId, body.chaos);
      return c.json(result);
    } catch (e) {
      if (e instanceof AxisError) return c.json({ runId, ...e.toJSON() }, e.http as 400 | 402 | 409 | 500);
      return c.json({ runId, error: { code: "INTERNAL", message: (e as Error).message } }, 500);
    }
  });

  /** GET /v1/receipt/:id — the unified receipt. Renders standalone. */
  app.get("/v1/receipt/:id", async (c) => {
    const receipt = await buildReceipt(c.req.param("id"), cfg.DATABASE_URL);
    if (!receipt) return c.json({ error: { code: "NOT_FOUND", message: "no such receipt" } }, 404);
    return c.json(receipt);
  });

  /** GET /v1/runs/:id/events — the live SSE stream the console renders. */
  app.get("/v1/runs/:id/events", (c) => {
    const runId = c.req.param("id");
    return new Response(
      new ReadableStream({
        start(controller) {
          const enc = new TextEncoder();
          const send = (data: string) => controller.enqueue(enc.encode(data));
          send(`: connected\n\n`);
          const unsub = subscribe(runId, (e) => {
            send(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
          });
          const ping = setInterval(() => send(`: ping\n\n`), 15_000);
          c.req.raw.signal.addEventListener("abort", () => {
            clearInterval(ping);
            unsub();
            try { controller.close(); } catch { /* already closed */ }
          });
        },
      }),
      { headers: { "content-type": "text/event-stream", "cache-control": "no-store", "connection": "keep-alive" } },
    );
  });

  return app;
}
