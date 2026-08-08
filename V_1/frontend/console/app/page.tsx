"use client";
/**
 * The demo screen. One button runs the real workflow through the live router.
 * Falls back to the mock stream if the router is unreachable, so the UI is
 * always demonstrable.
 */
import { useCallback, useState } from "react";
import { api } from "../lib/api.ts";
import { useRunStream, useMockRun } from "../lib/useRunStream.ts";
import { ProtocolRail, WorkflowGraph, PolicyPanel, GroupPanel, Outcome, EventLog } from "../components/RunView.tsx";
import { isTerminal } from "../lib/state-machine.ts";

// A funded demo agent address can be injected at build time; the router also
// has its own agent, so this is only the "who is asking" field.
const DEMO_AGENT = process.env.NEXT_PUBLIC_DEMO_AGENT ?? "NG5SZZ3U6XOB4L5N4CPZ7SLIZRDIEK2CM4XMB5WDPLAWSCIRCIJTTKYOPQ";

export default function Home() {
  const [runId, setRunId] = useState<string | null>(null);
  const [mockTick, setMockTick] = useState(0);
  const [useMock, setUseMock] = useState(false);
  const [busy, setBusy] = useState(false);
  const live = useRunStream(runId);
  const mock = useMockRun("partial", mockTick);
  const view = useMock ? mock : live;

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const quote = await api.quote(DEMO_AGENT, { diff: "- timeout: 10\n+ timeout: 60", commitMessage: "fix stuff" });
      setUseMock(false);
      setRunId(quote.runId);
      await api.execute(quote.quoteId, quote.runId); // same runId → one stream
    } catch {
      // Router unreachable — show the mock so the demo never dies.
      setUseMock(true);
      setMockTick((t) => t + 1);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-8 font-mono">
      <header>
        <h1 className="text-3xl font-bold">AXIS</h1>
        <p className="text-neutral-400">N paid API calls · one atomic payment · one receipt</p>
      </header>

      <button onClick={run} disabled={busy}
        className="rounded bg-emerald-600 px-5 py-3 font-semibold disabled:opacity-40">
        {busy ? "Running…" : "Should I merge this PR?"}
      </button>
      {useMock && <span className="ml-3 text-xs text-amber-500">demo mode (router offline)</span>}

      <Outcome view={view} />
      <ProtocolRail view={view} />
      <PolicyPanel view={view} />
      <WorkflowGraph view={view} />
      <GroupPanel view={view} />
      <EventLog view={view} />

      {isTerminal(view) && view.receiptId && (
        <a href={`/receipts/${view.receiptId}`} className="inline-block text-sm text-sky-400 underline">
          view unified receipt →
        </a>
      )}
    </main>
  );
}
