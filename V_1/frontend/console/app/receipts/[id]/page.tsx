"use client";
import { use, useEffect, useState } from "react";

const BASE = process.env.NEXT_PUBLIC_ROUTER_URL ?? "http://localhost:8080";

interface Leg {
  stepId: string;
  provider: string;
  priceUSDC: string;
  txid: string;
  explorerUrl: string;
  status: string;
  result?: unknown;
  latencyMs?: number;
  compensationExplorerUrl?: string;
}
interface Receipt {
  receiptId: string; workflow: string; status: string; groupId: string;
  confirmedRound?: number; totalUSDC: string; refundedUSDC: string; legs: Leg[];
}

/** Pull the human-readable text out of a provider result, whatever its shape. */
function resultText(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string") return result;
  if (typeof result === "object") {
    const o = result as Record<string, unknown>;
    const inner = (o.result ?? o) as Record<string, unknown>;
    for (const k of ["summary", "explanation", "text", "roast", "verdict", "output"]) {
      if (typeof inner[k] === "string") return inner[k] as string;
    }
    return JSON.stringify(result, null, 2);
  }
  return String(result);
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

  if (err) return <main><p>receipt {id}: {err}</p></main>;
  if (!r) return <main><p>loading receipt {id}…</p></main>;

  return (
    <main>
      <h1>Receipt · {r.status}</h1>
      <p>group {r.groupId} · round {r.confirmedRound ?? "—"}</p>
      <p>total ${r.totalUSDC}{Number(r.refundedUSDC) > 0 && ` · refunded $${r.refundedUSDC}`}</p>

      {r.legs.map((l) => (
        <section key={l.txid || l.stepId}>
          <h2>{l.provider} — {l.status} — ${l.priceUSDC}{l.latencyMs != null && ` — ${l.latencyMs}ms`}</h2>
          <p>
            {l.explorerUrl && <a href={l.explorerUrl} target="_blank" rel="noreferrer">payment txid</a>}
            {l.compensationExplorerUrl && <> · <a href={l.compensationExplorerUrl} target="_blank" rel="noreferrer">refund txid</a></>}
          </p>
          {/* The FULL result — no truncation. This is what "YE ADHA HAIN" was: */}
          {l.result != null
            ? <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{resultText(l.result)}</pre>
            : <p>(no result — {l.status.toLowerCase()})</p>}
        </section>
      ))}
    </main>
  );
}
