/**
 * Boot reconciliation. Phase 8.
 *
 * If the router crashed mid-run, a run row can be stuck PENDING with a group id
 * that actually settled on chain. On startup, find those and finalize them by
 * querying the indexer — so a receipt is never permanently wrong just because a
 * process died at the wrong moment.
 */
import { eq } from "drizzle-orm";
import { db } from "./db/client.ts";
import { runs } from "./db/schema.ts";
import type { Config } from "./config.ts";

const INDEXER = "https://testnet-idx.algonode.cloud";

export async function reconcilePending(cfg: Config): Promise<number> {
  const database = db(cfg.DATABASE_URL);
  // Runs left PENDING with a group id but no finish time = interrupted.
  const stuck = await database.select().from(runs).where(eq(runs.status, "PENDING"));
  let fixed = 0;
  for (const run of stuck) {
    if (!run.groupId || run.finishedAt) continue;
    // A settled group means the payment happened; mark it SETTLED so the receipt
    // resolves. (A fuller version would re-run undelivered legs; here we just
    // stop it being stuck.)
    try {
      const r = await fetch(`${INDEXER}/v2/transactions?group-id=${encodeURIComponent(run.groupId)}`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const body = (await r.json()) as { transactions?: unknown[] };
        if ((body.transactions?.length ?? 0) > 0) {
          await database.update(runs).set({ status: "SETTLED", finishedAt: new Date() }).where(eq(runs.id, run.id));
          fixed++;
        }
      }
    } catch { /* indexer flaky; leave it for the next boot */ }
  }
  return fixed;
}
