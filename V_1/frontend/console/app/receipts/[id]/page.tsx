"use client";
import { use, useEffect, useState } from "react";

const BASE = process.env.NEXT_PUBLIC_ROUTER_URL ?? "http://localhost:8080";

interface Receipt {
  receiptId: string; workflow: string; status: string; groupId: string;
  confirmedRound?: number; totalUSDC: string; refundedUSDC: string;
  legs: { provider: string; priceUSDC: string; txid: string; explorerUrl: string; status: string; compensationExplorerUrl?: string }[];
}

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [r, setR] = useState<Receipt | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/v1/receipt/${id}`).then(async (res) => {
      if (!res.ok) throw new Error(`${res.status}`);
      setR(await res.json());
    }).catch((e) => setErr(String(e)));
  }, [id]);

  if (err) return <main className="p-8 font-mono text-red-400">receipt {id}: {err} (Phase 5 endpoint)</main>;
  if (!r) return <main className="p-8 font-mono text-neutral-500">loading receipt {id}…</main>;

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8 font-mono">
      <h1 className="text-xl font-bold">Receipt · {r.status}</h1>
      <div className="break-all text-xs text-neutral-400">group {r.groupId} · round {r.confirmedRound}</div>
      <table className="w-full text-xs">
        <tbody>
          {r.legs.map((l) => (
            <tr key={l.txid} className="border-t border-neutral-800">
              <td className="py-2">{l.provider}</td>
              <td>${l.priceUSDC}</td>
              <td className={l.status === "COMPENSATED" ? "text-orange-400" : "text-emerald-400"}>{l.status}</td>
              <td><a className="underline" href={l.explorerUrl} target="_blank" rel="noreferrer">tx ↗</a></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-sm">total ${r.totalUSDC}{Number(r.refundedUSDC) > 0 && ` · refunded $${r.refundedUSDC}`}</div>
    </main>
  );
}
