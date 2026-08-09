"use client";
import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import type { RunView } from "../lib/state-machine.ts";

/** Shows ALL services in the catalogue; the ones this run used get their status
 *  and price, the rest are ✕ (not called, not paid). */
export function AllServices({ view }: { view: RunView }) {
  const [catalogue, setCatalogue] = useState<string[]>([]);

  useEffect(() => {
    api.workflows().then((r) => {
      const set: string[] = [];
      for (const w of r.workflows) for (const s of w.steps) if (!set.includes(s.provider)) set.push(s.provider);
      setCatalogue(set);
    }).catch(() => {});
  }, []);

  if (!catalogue.length) return null;

  const byProvider: Record<string, RunView["nodes"][string]> = {};
  for (const n of Object.values(view.nodes)) byProvider[n.provider] = n;
  const usedCount = Object.keys(byProvider).length;

  const status = (n: RunView["nodes"][string]): string => {
    if (n.compensationTxid) return "refunded ↩";
    if (n.preview || n.state === "delivered") return "delivered ✓";
    if (n.txid || n.state === "paid") return "paid";
    return n.state ?? "used";
  };

  return (
    <section>
      <h2>All services — {usedCount} of {catalogue.length} used</h2>
      <ul>
        {catalogue.map((p) => {
          const n = byProvider[p];
          if (!n) return <li key={p}>✕ {p} — not used · $0</li>;
          return <li key={p}>✓ {p} — {status(n)}{n.priceUSDC ? ` · $${n.priceUSDC}` : ""}</li>;
        })}
      </ul>
    </section>
  );
}
