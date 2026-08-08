"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Receipts() {
  const [id, setId] = useState("");
  const router = useRouter();
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 32, display: "grid", gap: 16 }}>
      <header>
        <h1 style={{ fontSize: 28, margin: 0 }}>Receipts</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>Every run has a unified receipt: group id, N txids, per-leg status, total, refunds. Look one up.</p>
      </header>
      <form className="panel" onSubmit={(e) => { e.preventDefault(); if (id.trim()) router.push(`/receipts/${id.trim()}`); }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="run_… / receipt id"
            style={{ flex: 1, background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)", padding: 10, borderRadius: 6, font: "inherit" }} />
          <button className="btn btn-primary" type="submit">open</button>
        </div>
      </form>
      <p className="muted" style={{ fontSize: 12 }}>A receipt renders standalone — a judge can open one cold, hours later, and every txid still links to the explorer.</p>
    </main>
  );
}
