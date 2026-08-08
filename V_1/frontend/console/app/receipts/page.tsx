"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, type ReceiptSummary } from "../../lib/api";

export default function Receipts() {
  const [id, setId] = useState("");
  const [rows, setRows] = useState<ReceiptSummary[] | null>(null);
  const [projMap, setProjMap] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    api.receipts()
      .then((r) => setRows(r.receipts))
      .catch((e) => setErr(String(e)));
    api.projects()
      .then((r) => setProjMap(Object.fromEntries(r.projects.map((p) => [p.id, p.name]))))
      .catch(() => {});
  }, []);

  return (
    <main>
      <h1>Receipts</h1>
      <p>Every run has a unified receipt: group id, N txids, per-leg status, total, refunds. Look one up, or open any below.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (id.trim()) router.push(`/receipts/${id.trim()}`); }}>
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder="run_... / receipt id" />
        <button type="submit">open</button>
      </form>

      <h2>All receipts in the database</h2>
      {err && <p>could not load receipts: {err}</p>}
      {!rows && !err && <p>loading…</p>}
      {rows && rows.length === 0 && <p>No runs yet. Run a workflow and it will appear here.</p>}
      {rows && rows.length > 0 && (
        <table border={1} cellPadding={4}>
          <thead>
            <tr>
              <th>receipt</th><th>project</th><th>workflow</th><th>status</th><th>total</th><th>refunded</th><th>when</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.receiptId}>
                <td><Link href={`/receipts/${r.receiptId}`}>{r.receiptId}</Link></td>
                <td>{r.projectId ? <Link href={`/projects/${r.projectId}`}>{projMap[r.projectId] ?? r.projectId}</Link> : "—"}</td>
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

      <p>A receipt renders standalone — a judge can open one cold, hours later, and every txid still links to the explorer.</p>
    </main>
  );
}
