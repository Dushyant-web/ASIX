"use client";
/** Run workflow — the demo. One button drives the real router; falls back to mock. */
import { useCallback, useState } from "react";
import { api } from "../lib/api.ts";
import { useRunStream, useMockRun } from "../lib/useRunStream.ts";
import { ProtocolRail, WorkflowGraph, PolicyPanel, GroupPanel, ReceiptStrip, Outcome, EventLog } from "../components/RunView.tsx";
import { isTerminal } from "../lib/state-machine.ts";

const DEMO_AGENT = process.env.NEXT_PUBLIC_DEMO_AGENT ?? "NG5SZZ3U6XOB4L5N4CPZ7SLIZRDIEK2CM4XMB5WDPLAWSCIRCIJTTKYOPQ";

export default function Home() {
  const [runId, setRunId] = useState<string | null>(null);
  const [mockTick, setMockTick] = useState(0);
  const [useMock, setUseMock] = useState(false);
  const [busy, setBusy] = useState(false);
  const live = useRunStream(runId);
  const mock = useMockRun("happy", mockTick);
  const view = useMock ? mock : live;

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const quote = await api.quote(DEMO_AGENT, { diff: "- timeout: 10\n+ timeout: 60", commitMessage: "fix stuff" });
      setUseMock(false); setRunId(quote.runId);
      await api.execute(quote.quoteId, quote.runId);
    } catch { setUseMock(true); setMockTick((t) => t + 1); }
    finally { setBusy(false); }
  }, []);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 32, display: "grid", gap: 16 }}>
      <header>
        <h1 style={{ fontSize: 28, margin: 0 }}>Run workflow</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>&quot;Should I merge this PR?&quot; — four paid providers, one atomic payment, one receipt.</p>
      </header>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? "Running…" : "Should I merge this PR?"}</button>
        {useMock && <span className="muted" style={{ fontSize: 12 }}>demo mode (router offline)</span>}
      </div>
      <Outcome view={view} />
      <ProtocolRail view={view} />
      <PolicyPanel view={view} />
      <WorkflowGraph view={view} />
      <GroupPanel view={view} />
      <ReceiptStrip view={view} />
      <EventLog view={view} />
      {isTerminal(view) && view.receiptId && <a href={`/receipts/${view.receiptId}`}>open the full unified receipt →</a>}
    </main>
  );
}
