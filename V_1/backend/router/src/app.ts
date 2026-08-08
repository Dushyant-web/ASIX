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
import { subscribe, latestRunId } from "./bus.ts";
import { execute } from "./engine/execute.ts";
import { buildReceipt, listReceipts, listRefunds, usageSummary, createProject, listProjects, projectDetail } from "./engine/receipt.ts";
import { signup, login } from "./engine/auth.ts";
import { getStored, store } from "./middleware/idempotency.ts";
import { allow } from "./middleware/ratelimit.ts";
import { runAttack, primePayment } from "./engine/redteam.ts";
import { runAgentInline } from "./engine/agent.ts";
import { randomUUID } from "node:crypto";

export function createApp(cfg: Config) {
  const app = new Hono();

  // The console (browser) calls quote/execute and opens the SSE stream.
  app.use("*", cors({ origin: "*", allowHeaders: ["content-type", "idempotency-key", "authorization"], allowMethods: ["GET", "POST", "OPTIONS"] }));

  app.get("/healthz", (c) => c.json({ ok: true }));

  // ── Auth. Plain JWT, no third-party provider. Off the money path entirely. ──
  const authHandler = (fn: typeof signup | typeof login) => async (c: import("hono").Context) => {
    let body: { email?: string; password?: string };
    try { body = await c.req.json(); } catch {
      return c.json({ error: { code: "INVALID_INPUT", message: "body must be JSON" } }, 400);
    }
    try {
      const out = await fn(body.email ?? "", body.password ?? "", cfg.DATABASE_URL, cfg.JWT_SECRET);
      return c.json(out);
    } catch (e) {
      if (e instanceof AxisError) return c.json({ ...e.toJSON() }, e.http as 400 | 401 | 409);
      return c.json({ error: { code: "INTERNAL", message: (e as Error).message } }, 500);
    }
  };
  app.post("/v1/auth/signup", authHandler(signup));
  app.post("/v1/auth/login", authHandler(login));

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
    let body: { quoteId?: string; chaos?: string; runId?: string; projectId?: string };
    try { body = await c.req.json(); } catch {
      return c.json({ error: { code: "INVALID_WORKFLOW", message: "body must be JSON" } }, 400);
    }
    if (!body.quoteId) {
      return c.json({ error: { code: "INVALID_WORKFLOW", message: "quoteId required" } }, 400);
    }
    // Reuse the runId minted at quote time so the console — already subscribed
    // to that run's SSE stream — sees the settle and execute events too. Only
    // mint a fresh one if the client did not carry it through.
    // Rate limit per caller (IP). Keying on the idempotency key would defeat
    // the limit, since each key is unique per request.
    const idemKey = c.req.header("Idempotency-Key");
    const caller = c.req.header("x-forwarded-for") ?? c.req.header("cf-connecting-ip") ?? "local";
    if (!allow(caller)) return c.json({ error: { code: "RATE_LIMITED", message: "too many requests" } }, 429);

    // Idempotent replay: a retry with the same key returns the stored response.
    if (idemKey) {
      const prior = await getStored(idemKey, cfg);
      if (prior) return c.json(prior as object);
    }

    const runId = body.runId ?? `run_${crypto.randomUUID().slice(0, 12)}`;
    try {
      const result = await execute(body.quoteId, cfg, runId, body.chaos, body.projectId);
      if (idemKey) await store(idemKey, runId, result, cfg);
      return c.json(result);
    } catch (e) {
      if (e instanceof AxisError) return c.json({ runId, ...e.toJSON() }, e.http as 400 | 402 | 409 | 500);
      return c.json({ runId, error: { code: "INTERNAL", message: (e as Error).message } }, 500);
    }
  });

  /** POST /v1/redteam/prime — pre-settle a real payment so the attack click is
   *  instant (the ~4s on-chain settle happens here, in the background). */
  app.post("/v1/redteam/prime", async (c) => {
    try {
      return c.json({ proof: await primePayment(cfg) });
    } catch (e) {
      return c.json({ error: { code: "PRIME_FAILED", message: (e as Error).message } }, 500);
    }
  });

  /** POST /v1/redteam/:id — fire an attack at our own endpoints, report the block.
   *  An optional { proof } (from /prime) skips the on-chain settle on the click. */
  app.post("/v1/redteam/:id", async (c) => {
    let proof: string | undefined;
    try { proof = (await c.req.json())?.proof; } catch { /* no body is fine */ }
    try {
      return c.json(await runAttack(c.req.param("id"), cfg, { proof }));
    } catch (e) {
      return c.json({ fired: 0, granted: 0, blocked: 0, mitigation: "", detail: (e as Error).message }, 500);
    }
  });

  /**
   * POST /v1/agent/run — the autonomous agent from the console. An LLM picks a
   * workflow from the goal; it settles atomically only within budget. Returns a
   * runId immediately and streams the whole run on it (the console + extension
   * animate it live); the agent finishes in the background.
   */
  app.post("/v1/agent/run", async (c) => {
    let body: { goal?: string; budgetUSDC?: number; projectId?: string };
    try { body = await c.req.json(); } catch {
      return c.json({ error: { code: "INVALID_INPUT", message: "body must be JSON" } }, 400);
    }
    const goal = String(body.goal ?? "").trim();
    const budgetUSDC = Number(body.budgetUSDC);
    if (!goal) return c.json({ error: { code: "INVALID_INPUT", message: "goal is required" } }, 400);
    if (!Number.isFinite(budgetUSDC) || budgetUSDC <= 0) {
      return c.json({ error: { code: "INVALID_INPUT", message: "budgetUSDC must be a positive number" } }, 400);
    }
    const runId = `run_${randomUUID().slice(0, 12)}`;
    void runAgentInline(runId, goal, budgetUSDC, cfg, body.projectId); // fire-and-forget; streams on runId
    return c.json({ runId });
  });

  /** GET /v1/refunds — every run that got money back on chain. */
  app.get("/v1/refunds", async (c) => c.json({ refunds: await listRefunds(cfg.DATABASE_URL) }));

  /** GET /v1/usage — spend totals, optionally for one agent (?agent=ADDR). */
  app.get("/v1/usage", async (c) => c.json(await usageSummary(cfg.DATABASE_URL, c.req.query("agent") || undefined)));

  /** Projects — group runs and see per-project spend. */
  app.post("/v1/projects", async (c) => {
    let body: { name?: string; agentAddress?: string };
    try { body = await c.req.json(); } catch { return c.json({ error: { code: "INVALID_INPUT", message: "body must be JSON" } }, 400); }
    const name = String(body.name ?? "").trim();
    if (!name) return c.json({ error: { code: "INVALID_INPUT", message: "name is required" } }, 400);
    return c.json(await createProject(cfg.DATABASE_URL, name, body.agentAddress));
  });
  app.get("/v1/projects", async (c) => c.json({ projects: await listProjects(cfg.DATABASE_URL) }));
  app.get("/v1/projects/:id", async (c) => {
    const detail = await projectDetail(cfg.DATABASE_URL, c.req.param("id"));
    if (!detail) return c.json({ error: { code: "NOT_FOUND", message: "no such project" } }, 404);
    return c.json(detail);
  });

  /** GET /v1/workflows — the workflows an agent can run (id + provider steps). */
  app.get("/v1/workflows", (c) => {
    return c.json({
      workflows: Object.values(WORKFLOWS).map((w) => ({
        id: w.id,
        steps: w.steps.map((s) => ({ id: s.id, provider: s.provider, path: s.path })),
        inputs: [...new Set(w.steps.flatMap((s) =>
          Object.values(s.input).flatMap((t) =>
            typeof t === "string" ? [...t.matchAll(/\$\{\s*inputs\.([A-Za-z0-9_]+)\s*\}/g)].map((m) => m[1]!) : []),
        ))],
      })),
    });
  });

  /** GET /v1/receipts — every run in the DB, newest first. The receipts index. */
  app.get("/v1/receipts", async (c) => {
    return c.json({ receipts: await listReceipts(cfg.DATABASE_URL) });
  });

  /** GET /v1/receipt/:id — the unified receipt. Renders standalone. */
  app.get("/v1/receipt/:id", async (c) => {
    const receipt = await buildReceipt(c.req.param("id"), cfg.DATABASE_URL);
    if (!receipt) return c.json({ error: { code: "NOT_FOUND", message: "no such receipt" } }, 404);
    return c.json(receipt);
  });

  /** GET /v1/runs/latest — the most recently started run, for the monitor to follow. */
  app.get("/v1/runs/latest", (c) => c.json({ runId: latestRunId() }));

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
