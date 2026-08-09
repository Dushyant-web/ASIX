"use client";
import { useCallback, useState } from "react";
import { api } from "../lib/api.ts";
import { useRunStream, useMockRun } from "../lib/useRunStream.ts";
import { ProtocolRail, WorkflowGraph, PolicyPanel, GroupPanel, ReceiptStrip, Outcome, EventLog } from "../components/RunView.tsx";
import { ProjectPicker } from "../components/ProjectPicker.tsx";
import { isTerminal } from "../lib/state-machine.ts";

const DEMO_AGENT = process.env.NEXT_PUBLIC_DEMO_AGENT ?? "NG5SZZ3U6XOB4L5N4CPZ7SLIZRDIEK2CM4XMB5WDPLAWSCIRCIJTTKYOPQ";

export default function Home() {
  const [runId, setRunId] = useState<string | null>(null);
  const [mockTick, setMockTick] = useState(0);
  const [useMock, setUseMock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [projectId, setProjectId] = useState("");
  const live = useRunStream(runId);
  const mock = useMockRun("happy", mockTick);
  const view = useMock ? mock : live;

  // The core plan: every provider runs at once in ONE atomic group. You don't
  // pick a service — the workflow fans out to all of them, one signature,
  // all-or-nothing, and any provider that fails to deliver is refunded on chain.
  const run = useCallback(async () => {
    setBusy(true);
    try {
      const quote = await api.quote(DEMO_AGENT, { diff: "- const timeout = 10\n+ const timeout = 60", commitMessage: "fix stuff" }, "deep-review");
      setUseMock(false); setRunId(quote.runId);
      await api.execute(quote.quoteId, quote.runId, projectId || undefined);
    } catch { setUseMock(true); setMockTick((t) => t + 1); }
    finally { setBusy(false); }
  }, [projectId]);

  return (
    <main>
      <h1>Run workflow</h1>
      <p>&quot;Should I merge this PR?&quot; — <b>seven paid providers</b> run at once in ONE atomic payment to seven different payees. One signature, all-or-nothing. Each is paid, and any that fails to deliver is refunded on chain. You never pick a service — the workflow fans out to all of them.</p>
      <p>Project (optional): <ProjectPicker value={projectId} onChange={setProjectId} /></p>
      <button onClick={run} disabled={busy}>{busy ? "Running..." : "Should I merge this PR?"}</button>
      {useMock ? <span> demo mode (router offline)</span> : null}
      <Outcome view={view} />
      <ProtocolRail view={view} />
      <PolicyPanel view={view} />
      <WorkflowGraph view={view} />
      <GroupPanel view={view} />
      <ReceiptStrip view={view} />
      <EventLog view={view} />
      {isTerminal(view) && view.receiptId ? <p><a href={`/receipts/${view.receiptId}`}>open the full unified receipt</a></p> : null}
    </main>
  );
}
