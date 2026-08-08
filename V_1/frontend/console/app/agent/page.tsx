"use client";
import { useState } from "react";
import { api } from "../../lib/api.ts";
import { useRunStream } from "../../lib/useRunStream.ts";
import { ProtocolRail, WorkflowGraph, PolicyPanel, GroupPanel, ReceiptStrip, Outcome, EventLog } from "../../components/RunView.tsx";
import { isTerminal } from "../../lib/state-machine.ts";

export default function AgentPage() {
  const [goal, setGoal] = useState(
    "Should I merge this pull request? The change increases the request timeout from 10 seconds to 60 seconds.",
  );
  const [budget, setBudget] = useState("1.00");
  const [runId, setRunId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const view = useRunStream(runId);

  const streaming = !!runId && !isTerminal(view);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setRunId(null);
    try {
      const res = await api.runAgent(goal, Number(budget));
      setRunId(res.runId);
    } catch (x) {
      setErr((x as { error?: { message?: string } })?.error?.message ?? "could not start the agent");
    }
  }

  return (
    <main>
      <h1>Autonomous agent</h1>
      <p>Type a task in plain English and set a spending limit. An AI agent then does the buying for you — and it can never spend more than the limit you set.</p>
      <p><b>What it can do right now:</b> the only service available is a <b>code-review pipeline</b> — give it a code change, diff, or pull request to review. Ask for anything else (e.g. &quot;create an image&quot;) and it will <b>refuse and pay nothing</b>, because no service can do that job.</p>

      <p><b>What happens when you click Run agent:</b></p>
      <ol>
        <li>It reads your <b>goal</b> and decides which paid services it needs.</li>
        <li>It asks each service its price and adds them up (nothing is paid yet).</li>
        <li>It compares the total to your <b>budget</b>. If it&apos;s too expensive, it stops and pays <b>nothing</b>.</li>
        <li>If it fits, it pays every service in <b>one single payment</b> and shows you their answers.</li>
      </ol>

      <form onSubmit={run}>
        <p>
          <label><b>Goal</b> — describe the task in plain English:<br />
            <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} cols={70} required />
          </label>
        </p>
        <p>
          <label><b>Budget</b> — the most it may spend (USDC):{" "}
            <input type="number" step="0.01" min="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} required />
          </label>
        </p>
        <button type="submit" disabled={streaming}>{streaming ? "agent working…" : "Run agent"}</button>
      </form>
      {err ? <p>error: {err}</p> : null}

      <p>This task costs about <b>$0.14</b>. Set the budget to <b>$0.05</b> and it will refuse (too expensive); set it to <b>$1.00</b> and it will pay and show the results.</p>

      {runId ? (
        <>
          <Outcome view={view} />
          <ProtocolRail view={view} />
          <PolicyPanel view={view} />
          <WorkflowGraph view={view} />
          <GroupPanel view={view} />
          <ReceiptStrip view={view} />
          <EventLog view={view} />
          {isTerminal(view) && view.status === "FAILED" && view.error
            ? <p><b>Agent stopped — you paid nothing.</b> {view.error.message}</p>
            : null}
          {isTerminal(view) && view.receiptId && view.status !== "FAILED"
            ? <p><a href={`/receipts/${view.receiptId}`}>open the full unified receipt</a></p>
            : null}
        </>
      ) : null}
    </main>
  );
}
