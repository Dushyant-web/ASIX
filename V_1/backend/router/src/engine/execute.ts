/**
 * The execute path. Phase 4 — the submission's core claim.
 *
 * Takes a signed quote and: verifies it → single-use guards → pre-flight →
 * composes ONE atomic group across N payees → simulate gate → settle → persist.
 *
 * Every failure before settlement costs the agent exactly zero. That is the
 * whole promise, and each guard below returns a typed error with costedNothing.
 */
import { eq, and } from "drizzle-orm";
import { AxisError, formatUSDC, microUSDC, MAX_GROUP_SIZE } from "@axis/shared";
import { verifyQuoteSignature, type Quote } from "./quote.ts";
import type { Config } from "../config.ts";
import { db } from "../db/client.ts";
import { quotes, runs, legs as legsTable } from "../db/schema.ts";
import { agentAccount } from "../chain/client.ts";
import { preflight, composeGroup, type Leg } from "./compose.ts";
import { simulate, settleWithRetry } from "./settle.ts";
import { runWorkflow } from "./run.ts";
import { emit } from "../bus.ts";
import { randomUUID } from "node:crypto";

interface StoredLeg {
  stepId: string; provider: string; payTo: string;
  priceMicro: string; asset: string; challenge: Record<string, unknown>;
}

export interface ExecuteResult {
  runId: string;
  groupId: string;
  confirmedRound: number;
  txids: { stepId: string; provider: string; payTo: string; txid: string; amountUSDC: string; explorerUrl: string }[];
  status?: "SETTLED" | "PARTIAL";
  refundedUSDC?: string;
}

const explorer = (t: string) => `https://lora.algokit.io/testnet/transaction/${t}`;

export async function execute(quoteId: string, cfg: Config, runId: string, chaosStep?: string, projectId?: string): Promise<ExecuteResult> {
  const database = db(cfg.DATABASE_URL);

  // ── 1. Load the quote ──────────────────────────────────────────────────
  const row = (await database.select().from(quotes).where(eq(quotes.id, quoteId)))[0];
  if (!row) throw new AxisError("QUOTE_NOT_FOUND", `no quote ${quoteId}`);

  // ── 2. Single-use + expiry guards, BEFORE anything moves ───────────────
  if (row.status !== "OPEN") {
    throw new AxisError("QUOTE_CONSUMED", `quote ${quoteId} is ${row.status}`);
  }
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    throw new AxisError("QUOTE_EXPIRED", `quote ${quoteId} expired at ${row.expiresAt.toISOString()}`);
  }
  const verdict = row.policyVerdict as { verdict?: string; violations?: string[] };
  if (verdict?.verdict === "FAIL") {
    throw new AxisError("POLICY_VIOLATION",
      verdict.violations?.[0] ?? "spend policy rejected this workflow", { violations: verdict.violations });
  }

  // ── 3. Verify the router's own signature (tamper guard) ────────────────
  const stored: StoredLeg[] = row.legs as StoredLeg[];
  const reconstructed: Quote = {
    quoteId: row.id,
    workflow: row.workflow,
    agentAddress: row.agentAddress,
    network: cfg.NETWORK,
    dag: row.dag as Quote["dag"],
    legs: stored.map((l) => ({
      stepId: l.stepId, provider: l.provider, payTo: l.payTo,
      priceMicro: microUSDC(BigInt(l.priceMicro)), asset: l.asset, challenge: l.challenge,
    })),
    subtotalMicro: microUSDC(row.subtotalMicro),
    routingFeeMicro: microUSDC(row.routingFeeMicro),
    totalMicro: microUSDC(row.totalMicro),
    expiresAt: row.expiresAt.toISOString(),
    policy: row.policyVerdict as never,
    signature: row.signature,
  };
  if (!verifyQuoteSignature(reconstructed, cfg.QUOTE_SIGNING_KEY)) {
    throw new AxisError("SIGNATURE_INVALID", `quote ${quoteId} failed signature check`);
  }

  // ── 4. Atomically flip OPEN → CONSUMED. This is the replay guard: two
  //       concurrent executes cannot both pass, because only one UPDATE that
  //       still sees OPEN succeeds. ─────────────────────────────────────────
  const claimed = await database.update(quotes)
    .set({ status: "CONSUMED" })
    .where(and(eq(quotes.id, quoteId), eq(quotes.status, "OPEN")))
    .returning({ id: quotes.id });
  if (claimed.length === 0) {
    throw new AxisError("QUOTE_CONSUMED", `quote ${quoteId} was consumed concurrently`);
  }

  const chainLegs: Leg[] = stored.map((l) => ({
    stepId: l.stepId, provider: l.provider, payTo: l.payTo, priceMicro: microUSDC(BigInt(l.priceMicro)),
  }));
  const usdcAsaId = BigInt(cfg.USDC_ASA_ID);

  // Open the run row now so a crash mid-settle is recoverable.
  const runRow = { id: runId, quoteId, workflow: row.workflow, agentAddress: row.agentAddress,
    totalMicro: row.totalMicro, status: "PENDING" as const, ...(projectId ? { projectId } : {}) };
  await database.insert(runs).values(runRow);

  const { algo, agent } = agentAccount(cfg);

  try {
    // ── 5. Pre-flight: opt-in + balance. Still free. ─────────────────────
    await preflight(algo, String(agent.addr), chainLegs, usdcAsaId, row.subtotalMicro);

    // ── 6. Compose ONE group, N payees ───────────────────────────────────
    const group = composeGroup(algo, { addr: agent.addr, signer: agent.signer }, chainLegs, usdcAsaId);
    emit(runId, {
      type: "group.composed", step: "compose",
      slots: chainLegs.map((l, i) => ({ index: i, kind: "payment" as const, stepId: l.stepId, payTo: l.payTo, amountUSDC: formatUSDC(l.priceMicro) })),
      groupSize: chainLegs.length, maxGroupSize: MAX_GROUP_SIZE,
    });

    // ── 7. Simulate — HARD GATE. Failure means nothing submits. ──────────
    const simStart = Date.now();
    await simulate(group);
    emit(runId, { type: "group.simulated", step: "simulate", passed: true, durationMs: Date.now() - simStart });

    // ── 8. One signature (the agent signs its N legs as one group). ──────
    emit(runId, { type: "group.signed", step: "sign", signatureCount: 1, legCount: chainLegs.length });

    // ── 9. Settle. All-or-nothing on chain, with automatic retry. ─────────
    const settleStart = Date.now();
    const result = await settleWithRetry(group, (attempt, maxAttempts, message) => {
      emit(runId, { type: "settle.retry", step: "settle", attempt, maxAttempts, message: message.split("\n")[0] });
    });
    const txids = result.txids.map((txid, i) => ({
      stepId: chainLegs[i]!.stepId, provider: chainLegs[i]!.provider, payTo: chainLegs[i]!.payTo,
      txid, amountUSDC: formatUSDC(chainLegs[i]!.priceMicro), explorerUrl: explorer(txid),
    }));
    emit(runId, {
      type: "group.settled", step: "settle", groupId: result.groupId,
      confirmedRound: result.confirmedRound, durationMs: Date.now() - settleStart, txids,
    });

    // ── 10. Persist run + legs ───────────────────────────────────────────
    await database.update(runs).set({
      groupId: result.groupId, status: "PENDING", confirmedRound: BigInt(result.confirmedRound),
    }).where(eq(runs.id, runId));
    await database.insert(legsTable).values(chainLegs.map((l, i) => ({
      id: `leg_${randomUUID().slice(0, 10)}`, runId, stepId: l.stepId, provider: l.provider,
      payTo: l.payTo, priceMicro: l.priceMicro, groupIndex: i, txid: result.txids[i], status: "PAID" as const,
    })));

    // ── 11. Phase 5: paid retries, compensation, receipt ─────────────────
    const settled = { runId, groupId: result.groupId, confirmedRound: result.confirmedRound, txids };
    const final = await runWorkflow(settled, cfg, (row.inputs ?? {}) as Record<string, unknown>, chaosStep);
    return { ...settled, status: final.status, refundedUSDC: formatUSDC(final.refundedMicro) };
  } catch (e) {
    const err = e instanceof AxisError ? e : new AxisError("INTERNAL", (e as Error).message);
    await database.update(runs).set({ status: "FAILED", error: err.toJSON().error, finishedAt: new Date() }).where(eq(runs.id, runId));
    emit(runId, { type: "run.error", code: err.code, message: err.message, costedNothing: err.costedNothing });
    throw err;
  }
}
