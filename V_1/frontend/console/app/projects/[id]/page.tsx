"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api, type ProjectDetail } from "../../../lib/api.ts";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [p, setP] = useState<ProjectDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.project(id).then((d) => {
      if ((d as unknown as { error?: unknown }).error) throw new Error("not found");
      setP(d);
    }).catch((e) => setErr(String(e)));
  }, [id]);

  if (err) return <main><p>project {id}: {err}</p></main>;
  if (!p) return <main><p>loading project…</p></main>;

  return (
    <main>
      <h1>Project · {p.name}</h1>
      <p><Link href="/projects">← all projects</Link></p>
      <p><b>{p.totals.runs}</b> runs · net spent <b>${p.totals.netUSDC}</b> (gross ${p.totals.grossUSDC}, refunded ${p.totals.refundedUSDC}).</p>

      {p.runs.length === 0 ? <p>No runs tagged to this project yet.</p> : (
        <table border={1} cellPadding={4}>
          <thead><tr><th>receipt</th><th>workflow</th><th>status</th><th>total</th><th>refunded</th><th>when</th></tr></thead>
          <tbody>
            {p.runs.map((r) => (
              <tr key={r.receiptId}>
                <td><Link href={`/receipts/${r.receiptId}`}>{r.receiptId}</Link></td>
                <td>{r.workflow}</td>
                <td>{r.status}</td>
                <td>${r.totalUSDC}</td>
                <td>{Number(r.refundedUSDC) > 0 ? `$${r.refundedUSDC}` : "—"}</td>
                <td>{new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
