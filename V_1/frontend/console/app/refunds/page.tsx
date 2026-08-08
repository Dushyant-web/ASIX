"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type RefundSummary } from "../../lib/api.ts";

export default function Refunds() {
  const [rows, setRows] = useState<RefundSummary[] | null>(null);
  const [projMap, setProjMap] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.refunds().then((r) => setRows(r.refunds)).catch((e) => setErr(String(e)));
    api.projects().then((r) => setProjMap(Object.fromEntries(r.projects.map((p) => [p.id, p.name])))).catch(() => {});
  }, []);

  const total = rows?.reduce((a, r) => a + Number(r.refundedUSDC), 0) ?? 0;

  return (
    <main>
      <h1>Refunds</h1>
      <p>Every run where a provider took payment but failed to deliver — its leg was reversed on chain and the money came back. This is the differentiator: payment atomicity is not execution atomicity, and AXIS handles the gap.</p>
      {err && <p>could not load: {err}</p>}
      {!rows && !err && <p>loading…</p>}
      {rows && (
        <>
          <p><b>{rows.length}</b> refunded runs · <b>${total.toFixed(2)}</b> returned on chain in total.</p>
          {rows.length === 0 ? <p>No refunds yet.</p> : (
            <table border={1} cellPadding={4}>
              <thead><tr><th>receipt</th><th>project</th><th>workflow</th><th>status</th><th>refunded</th><th>of total</th><th>when</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.receiptId}>
                    <td><Link href={`/receipts/${r.receiptId}`}>{r.receiptId}</Link></td>
                    <td>{r.projectId ? <Link href={`/projects/${r.projectId}`}>{projMap[r.projectId] ?? r.projectId}</Link> : "—"}</td>
                    <td>{r.workflow}</td>
                    <td>{r.status}</td>
                    <td>${r.refundedUSDC}</td>
                    <td>${r.totalUSDC}</td>
                    <td>{new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  );
}
