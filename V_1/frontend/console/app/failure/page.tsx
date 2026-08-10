"use client";
import { useCallback, useState } from "react";
import { api } from "../../lib/api.ts";
import { useRunStream, useMockRun } from "../../lib/useRunStream.ts";
import { ProtocolRail, WorkflowGraph, GroupPanel, ReceiptStrip, Outcome, EventLog } from "../../components/RunView.tsx";
import { ProjectPicker } from "../../components/ProjectPicker.tsx";
import { isTerminal, refundedNodes } from "../../lib/state-machine.ts";

const DEMO_AGENT = process.env.NEXT_PUBLIC_DEMO_AGENT ?? "NG5SZZ3U6XOB4L5N4CPZ7SLIZRDIEK2CM4XMB5WDPLAWSCIRCIJTTKYOPQ";
// deep-review = 7 services in one atomic group; any one can be forced to fail.
const STEPS = [
  ["diff","diff-explainer"],["guardrail","guardrail-checker"],["roast","commit-roaster"],
  ["bugsum","bug-summarizer"],["summary","summarizer"],["tests","test-writer"],["suggest","code-generator"],
];

export default function Failure() {
  const [runId, setRunId] = useState<string | null>(null);
  const [mockTick, setMockTick] = useState(0);
  const [useMock, setUseMock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chaos, setChaos] = useState("roast");
  const [projectId, setProjectId] = useState("");
  const live = useRunStream(runId);
  const mock = useMockRun("partial", mockTick);
  const view = useMock ? mock : live;

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const quote = await api.quote(DEMO_AGENT, { diff: "- const t = 10\n+ const t = 60", commitMessage: "bump timeout" }, "deep-review");
      setUseMock(false); setRunId(quote.runId);
      await api.executeChaos(quote.quoteId, quote.runId, chaos, projectId || undefined);
    } catch { setUseMock(true); setMockTick((t) => t + 1); }
    finally { setBusy(false); }
  }, [chaos, projectId]);

  const refunds = refundedNodes(view);
  return (
    <main>
      <h1>Test failure</h1>
      <p>Payment atomicity is not delivery. A provider can take the money and then die. This forces exactly that, and shows the money coming back on chain.</p>
      <p>Which provider should fail after being paid?</p>
      <div>
        {STEPS.map(([id, label]) => (
          <label key={id}>
            <input type="radio" name="chaos" checked={chaos === id} onChange={() => setChaos(id)} /> {label}
          </label>
        ))}
      </div>
      <p>Project (optional): <ProjectPicker value={projectId} onChange={setProjectId} /></p>
      <button onClick={run} disabled={busy}>{busy ? "Running..." : `Run with ${chaos} failing`}</button>
      {useMock ? <span> demo mode (router offline)</span> : null}
      <h3>What happens, in order</h3>
      <ol>
        <li>All seven providers are paid atomically in one group.</li>
        <li>Three deliver. The one you picked returns 502 after taking payment.</li>
        <li>AXIS reverses that provider&apos;s leg on chain — a real refund transaction.</li>
        <li>The run is marked PARTIAL; the receipt records the refund txid.</li>
      </ol>
      <Outcome view={view} />
      {refunds.length > 0 ? (
        <div>
          <h3>Reversal on chain</h3>
          {refunds.map((n) => (
            <p key={n.stepId}>{n.provider} took ${n.priceUSDC}, failed, refunded — <a href={n.compensationExplorerUrl} target="_blank" rel="noreferrer">refund txid</a></p>
          ))}
        </div>
      ) : null}
      <ProtocolRail view={view} />
      <WorkflowGraph view={view} />
      <GroupPanel view={view} />
      <ReceiptStrip view={view} />
      <EventLog view={view} />
      {isTerminal(view) && view.receiptId ? <p><a href={`/receipts/${view.receiptId}`}>open the receipt</a></p> : null}
    </main>
  );
}
