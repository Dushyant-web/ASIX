/** Build the unified receipt from runs + legs. The artifact that proves it all. */
import { eq, desc, gt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { formatUSDC, microUSDC } from "@axis/shared";
import { db } from "../db/client.ts";
import { runs, legs as legsTable, projects } from "../db/schema.ts";

const explorer = (t: string) => `https://lora.algokit.io/testnet/transaction/${t}`;

export async function buildReceipt(runId: string, databaseUrl: string) {
  const database = db(databaseUrl);
  const run = (await database.select().from(runs).where(eq(runs.id, runId)))[0];
  if (!run) return null;
  const legRows = await database.select().from(legsTable).where(eq(legsTable.runId, runId));

  const legs = legRows.map((l) => ({
    stepId: l.stepId, provider: l.provider, payTo: l.payTo,
    priceUSDC: formatUSDC(microUSDC(l.priceMicro)),
    txid: l.txid ?? "", explorerUrl: l.txid ? explorer(l.txid) : "",
    status: l.status,
    // The FULL provider output, so the receipt shows the actual result — not a
    // 120-char preview cut off mid-sentence.
    result: l.result ?? null,
    ...(l.compensationTxid ? { compensationTxid: l.compensationTxid, compensationExplorerUrl: explorer(l.compensationTxid) } : {}),
    ...(l.latencyMs != null ? { latencyMs: l.latencyMs } : {}),
  }));

  const totalMicro = legRows.reduce((a, l) => a + l.priceMicro, 0n);
  return {
    receiptId: run.id,
    workflow: run.workflow,
    status: run.status,
    groupId: run.groupId ?? "",
    confirmedRound: run.confirmedRound != null ? Number(run.confirmedRound) : undefined,
    agentAddress: run.agentAddress,
    signatureCount: 1 as const,
    legs,
    totalUSDC: formatUSDC(microUSDC(totalMicro)),
    refundedUSDC: formatUSDC(microUSDC(run.refundedMicro)),
    createdAt: run.startedAt.toISOString(),
  };
}

/** Every run in the DB, newest first — the "all receipts" index. */
export async function listReceipts(databaseUrl: string, limit = 100) {
  const database = db(databaseUrl);
  const rows = await database
    .select()
    .from(runs)
    .orderBy(desc(runs.startedAt))
    .limit(limit);
  return rows.map((r) => ({
    receiptId: r.id,
    workflow: r.workflow,
    status: r.status,
    agentAddress: r.agentAddress,
    groupId: r.groupId ?? "",
    projectId: r.projectId ?? null,
    totalUSDC: formatUSDC(microUSDC(r.totalMicro)),
    refundedUSDC: formatUSDC(microUSDC(r.refundedMicro)),
    createdAt: r.startedAt.toISOString(),
  }));
}

/** Every run that got money back on chain — the refunds view. */
export async function listRefunds(databaseUrl: string, limit = 100) {
  const database = db(databaseUrl);
  const rows = await database.select().from(runs)
    .where(gt(runs.refundedMicro, 0n))
    .orderBy(desc(runs.startedAt)).limit(limit);
  return rows.map((r) => ({
    receiptId: r.id,
    workflow: r.workflow,
    status: r.status,
    refundedUSDC: formatUSDC(microUSDC(r.refundedMicro)),
    totalUSDC: formatUSDC(microUSDC(r.totalMicro)),
    projectId: r.projectId ?? null,
    createdAt: r.startedAt.toISOString(),
  }));
}

/** Aggregate spend for a user (by agent address) or across everything. */
export async function usageSummary(databaseUrl: string, agentAddress?: string) {
  const database = db(databaseUrl);
  const rows = agentAddress
    ? await database.select().from(runs).where(eq(runs.agentAddress, agentAddress))
    : await database.select().from(runs);
  let gross = 0n, refunded = 0n, settled = 0, partial = 0, failed = 0;
  for (const r of rows) {
    if (r.status === "SETTLED" || r.status === "PARTIAL") { gross += r.totalMicro; refunded += r.refundedMicro; }
    if (r.status === "SETTLED") settled++;
    else if (r.status === "PARTIAL") partial++;
    else if (r.status === "FAILED") failed++;
  }
  return {
    runs: rows.length, settled, partial, failed,
    grossUSDC: formatUSDC(microUSDC(gross)),
    refundedUSDC: formatUSDC(microUSDC(refunded)),
    netUSDC: formatUSDC(microUSDC(gross - refunded)),
  };
}

const projectTotals = (rs: { status: string; totalMicro: bigint; refundedMicro: bigint }[]) => {
  let gross = 0n, refunded = 0n;
  for (const r of rs) if (r.status === "SETTLED" || r.status === "PARTIAL") { gross += r.totalMicro; refunded += r.refundedMicro; }
  return {
    runs: rs.length,
    grossUSDC: formatUSDC(microUSDC(gross)),
    refundedUSDC: formatUSDC(microUSDC(refunded)),
    netUSDC: formatUSDC(microUSDC(gross - refunded)),
  };
};

/** Create a named project to group runs under. */
export async function createProject(databaseUrl: string, name: string, agentAddress?: string) {
  const database = db(databaseUrl);
  const id = `proj_${randomUUID().slice(0, 12)}`;
  await database.insert(projects).values({ id, name, agentAddress: agentAddress ?? null });
  return { id, name, agentAddress: agentAddress ?? null, createdAt: new Date().toISOString() };
}

/** Every project with its rolled-up spend + refunds. */
export async function listProjects(databaseUrl: string) {
  const database = db(databaseUrl);
  const projs = await database.select().from(projects).orderBy(desc(projects.createdAt));
  const allRuns = await database.select().from(runs);
  return projs.map((p) => ({
    id: p.id, name: p.name, createdAt: p.createdAt.toISOString(),
    ...projectTotals(allRuns.filter((r) => r.projectId === p.id)),
  }));
}

/** One project with its runs and totals — the per-project detail view. */
export async function projectDetail(databaseUrl: string, id: string) {
  const database = db(databaseUrl);
  const p = (await database.select().from(projects).where(eq(projects.id, id)))[0];
  if (!p) return null;
  const rs = await database.select().from(runs).where(eq(runs.projectId, id)).orderBy(desc(runs.startedAt));
  return {
    id: p.id, name: p.name, createdAt: p.createdAt.toISOString(),
    totals: projectTotals(rs),
    runs: rs.map((r) => ({
      receiptId: r.id, workflow: r.workflow, status: r.status,
      totalUSDC: formatUSDC(microUSDC(r.totalMicro)),
      refundedUSDC: formatUSDC(microUSDC(r.refundedMicro)),
      createdAt: r.startedAt.toISOString(),
    })),
  };
}
