"use client";
import { useCallback, useState } from "react";
import { api } from "../../lib/api.ts";
import { useRunStream, useMockRun } from "../../lib/useRunStream.ts";
import { ProtocolRail, WorkflowGraph, GroupPanel, ReceiptStrip, Outcome, EventLog } from "../../components/RunView.tsx";
import { isTerminal, refundedNodes } from "../../lib/state-machine.ts";

const DEMO_AGENT = process.env.NEXT_PUBLIC_DEMO_AGENT ?? "NG5SZZ3U6XOB4L5N4CPZ7SLIZRDIEK2CM4XMB5WDPLAWSCIRCIJTTKYOPQ";
const STEPS = [
  { id: "diff", label: "diff-explainer" }, { id: "guardrail", label: "guardrail-checker" },
  { id: "roast", label: "commit-roaster" }, { id: "bugsum", label: "bug-summarizer" },
];

export default function Failure() {
  const [runId, setRunId] = useState<string | null>(null);
  const [mockTick, setMockTick] = useState(0);
  const [useMock, setUseMock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chaos, setChaos] = useState("roast");
  const live = useRunStream(runId);
  const mock = useMockRun("partial", mockTick);
  const view = useMock ? mock : live;

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const quote = await api.quote(DEMO_AGENT, { diff: "x", commitMessage: "y" });
      setUseMock(false); setRunId(quote.runId);
      await api.executeChaos(quote.quoteId, quote.runId, chaos);
    } catch { setUseMock(true); setMockTick((t) => t + 1); }
    finally { setBusy(false); }
  }, [chaos]);

  const refunds = refundedNodes(view);
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 32, display: "grid", gap: 16 }}>
      <header>
        <h1 style={{ fontSize: 28, margin: 0 }}>Test failure</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>Payment atomicity is not delivery. A provider can take the money and then die. This forces exactly that — and shows the money coming back on chain.</p>
      </header>
      <div className="panel">
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Which provider should fail after being paid?</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {STEPS.map((s) => (
            <button key={s.id} className="btn" onClick={() => setChaos(s.id)} style={{ borderColor: chaos === s.id ? "var(--strong)" : "var(--border)" }}>{s.label}</button>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? "Running…" : `Run with ${chaos} failing`}</button>
          {useMock && <span className="muted" style={{ fontSize: 12, marginLeft: 12 }}>demo mode (router offline)</span>}
        </div>
      </div>
      <div className="panel">
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>What happens, in order</div>
        <ol className="muted" style={{ fontSize: 12, margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li>All four providers are paid atomically in one group (real settlement).</li>
          <li>Three deliver. The one you picked returns 502 <span className="strong">after</span> taking payment.</li>
          <li>AXIS reverses that provider&apos;s leg on chain — a real refund transaction.</li>
          <li>The run is marked <span className="strong">PARTIAL</span>; the receipt records the refund txid.</li>
        </ol>
      </div>
      <Outcome view={view} />
      {refunds.length > 0 && (
        <div className="panel">
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Reversal on chain</div>
          {refunds.map((n) => (
            <div key={n.stepId} style={{ fontSize: 12 }}>{n.provider} took ${n.priceUSDC}, failed, refunded → <a href={n.compensationExplorerUrl} target="_blank" rel="noreferrer">refund txid ↗</a></div>
          ))}
        </div>
      )}
      <ProtocolRail view={view} />
      <WorkflowGraph view={view} />
      <GroupPanel view={view} />
      <ReceiptStrip view={view} />
      <EventLog view={view} />
      {isTerminal(view) && view.receiptId && <a href={`/receipts/${view.receiptId}`}>open the receipt →</a>}
    </main>
  );
}
