/** Build the unified receipt from runs + legs. The artifact that proves it all. */
import { eq } from "drizzle-orm";
import { formatUSDC, microUSDC } from "@axis/shared";
import { db } from "../db/client.ts";
import { runs, legs as legsTable } from "../db/schema.ts";

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
