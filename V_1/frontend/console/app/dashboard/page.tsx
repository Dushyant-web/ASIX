"use client";
import { useCallback, useEffect, useState } from "react";
import { api, type WorkflowInfo } from "../../lib/api.ts";
import { useRunStream, useMockRun } from "../../lib/useRunStream.ts";
import { ProtocolRail, WorkflowGraph, PolicyPanel, GroupPanel, ReceiptStrip, Outcome, EventLog } from "../../components/RunView.tsx";
import { ProjectPicker } from "../../components/ProjectPicker.tsx";
import { isTerminal } from "../../lib/state-machine.ts";

const DEMO_AGENT = process.env.NEXT_PUBLIC_DEMO_AGENT ?? "NG5SZZ3U6XOB4L5N4CPZ7SLIZRDIEK2CM4XMB5WDPLAWSCIRCIJTTKYOPQ";

/** Sensible example inputs per workflow, so any service is one click to try. */
const DEFAULTS: Record<string, Record<string, string>> = {
  "pr-review": { diff: "- const timeout = 10\n+ const timeout = 60", commitMessage: "bump request timeout to 60s" },
  "security-scan": { text: "const q = `SELECT * FROM users WHERE id = ${req.query.id}`" },
  "bug-hunt": { diff: "- if (user) return user.name\n+ return user.name" },
  "commit-polish": { commitMessage: "fix stuff" },
  "generate-code": { task: "a Python function that reverses a string" },
  "debug-error": { error: "TypeError: cannot read property 'name' of undefined" },
  "write-tests": { code: "function add(a, b) { return a + b }" },
  "translate-text": { text: "good morning, how are you?", language: "Spanish" },
  "summarize-text": { text: "Paste any long paragraph here and the service returns a 3-5 sentence summary." },
};

export default function Home() {
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([]);
  const [workflowId, setWorkflowId] = useState("pr-review");
  const [inputs, setInputs] = useState<Record<string, string>>(DEFAULTS["pr-review"]!);
  const [runId, setRunId] = useState<string | null>(null);
  const [mockTick, setMockTick] = useState(0);
  const [useMock, setUseMock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [projectId, setProjectId] = useState("");
  const live = useRunStream(runId);
  const mock = useMockRun("happy", mockTick);
  const view = useMock ? mock : live;

  useEffect(() => { api.workflows().then((r) => setWorkflows(r.workflows)).catch(() => {}); }, []);

  const selected = workflows.find((w) => w.id === workflowId);

  // When you switch workflow, load its example inputs (or blanks for its keys).
  function pickWorkflow(id: string) {
    setWorkflowId(id);
    const keys = workflows.find((w) => w.id === id)?.inputs ?? Object.keys(DEFAULTS[id] ?? {});
    setInputs(DEFAULTS[id] ?? Object.fromEntries(keys.map((k) => [k, ""])));
  }

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const quote = await api.quote(DEMO_AGENT, inputs, workflowId);
      setUseMock(false); setRunId(quote.runId);
      await api.execute(quote.quoteId, quote.runId, projectId || undefined);
    } catch { setUseMock(true); setMockTick((t) => t + 1); }
    finally { setBusy(false); }
  }, [inputs, workflowId, projectId]);

  const keys = selected?.inputs ?? Object.keys(inputs);

  return (
    <main>
      <span className="hero-eyebrow">◆ N paid calls · one atomic payment · one receipt</span>
      <h1>Run workflow</h1>
      <p>Pick a service, fill its inputs, and run it — the router fans out to N paid providers, settles them in a single atomic group on Algorand, and returns one unified receipt.</p>

      <div className="card stack" style={{ marginTop: 8 }}>
        <div>
          <label>Service</label>
          <div className="row" style={{ marginTop: 6 }}>
            <select value={workflowId} onChange={(e) => pickWorkflow(e.target.value)}>
              {(workflows.length ? workflows.map((w) => w.id) : ["pr-review"]).map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
            {selected ? (
              <span className="dim mono" style={{ fontSize: 12 }}>
                {selected.steps.map((s) => s.provider).join(" · ")}
              </span>
            ) : null}
          </div>
        </div>

        {keys.map((k) => (
          <div key={k}>
            <label>{k}</label>
            <textarea rows={2} value={inputs[k] ?? ""} onChange={(e) => setInputs({ ...inputs, [k]: e.target.value })} />
          </div>
        ))}

        <div>
          <label>Project <span className="dim">(optional)</span></label>
          <div style={{ marginTop: 6 }}><ProjectPicker value={projectId} onChange={setProjectId} /></div>
        </div>

        <div className="row">
          <button onClick={run} disabled={busy}>{busy ? "Running…" : `▶  Run ${workflowId}`}</button>
          {useMock ? <span className="pill pill-warn">demo mode · router offline</span> : null}
        </div>
      </div>

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
