"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export default function Receipts() {
  const [id, setId] = useState("");
  const router = useRouter();
  return (
    <main>
      <h1>Receipts</h1>
      <p>Every run has a unified receipt: group id, N txids, per-leg status, total, refunds. Look one up.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (id.trim()) router.push(`/receipts/${id.trim()}`); }}>
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder="run_... / receipt id" />
        <button type="submit">open</button>
      </form>
      <p>A receipt renders standalone — a judge can open one cold, hours later, and every txid still links to the explorer.</p>
    </main>
  );
}
