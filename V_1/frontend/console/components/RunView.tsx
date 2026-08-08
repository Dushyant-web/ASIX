"use client";
/**
 * Monochrome run visualization. UX structure + ALL the data, no colors.
 * State is shown by text labels and border weight (data-* attrs), never hue —
 * Phase F2 (the team) maps that to a real palette.
 * Every value comes from the state machine; these components compute nothing.
 */
import type { RunView } from "../lib/state-machine.ts";
import { outcomeHeadline, settledTxids, refundedNodes } from "../lib/state-machine.ts";

export function ProtocolRail({ view }: { view: RunView }) {
  return (
    <ol style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6, listStyle: "none", padding: 0, margin: 0 }}>
      {view.protocol.map((p, i) => (
        <li key={p.step} className="node"
          data-active={p.status === "active"} data-done={p.status === "done"} data-fail={p.status === "failed"}
          style={{ textAlign: "center", padding: 8, fontSize: 11 }}>
          <div className="muted" style={{ fontSize: 9 }}>{i + 1}</div>
          <div>{p.step}</div>
          {p.detail && <div className="muted" style={{ fontSize: 9, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis" }}>{p.detail}</div>}
        </li>
      ))}
    </ol>
  );
}

export function WorkflowGraph({ view }: { view: RunView }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {view.batches.map((batch, i) => (
        <div key={i}>
          <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
            batch {i}{batch.length > 1 ? " · runs in parallel" : ""}
          </div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: `repeat(${Math.min(batch.length, 3)}, 1fr)` }}>
            {batch.map((id) => {
              const n = view.nodes[id];
              if (!n) return null;
              const active = ["probing", "paying", "running", "compensating"].includes(n.state);
              const done = ["paid", "delivered"].includes(n.state);
              const fail = ["failed", "refunded", "blocked", "skipped"].includes(n.state);
              return (
                <div key={id} className="node" data-active={active} data-done={done} data-fail={fail} style={{ fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="strong">{n.provider}</span>
                    {n.priceUSDC && <span>${n.priceUSDC}</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginTop: 3 }}>{n.state}</div>
                  {n.preview && <div className="muted" style={{ marginTop: 6, fontSize: 11, maxHeight: 40, overflow: "hidden" }}>{n.preview}</div>}
                  <div style={{ marginTop: 6, display: "grid", gap: 3 }}>
                    {n.explorerUrl && <a href={n.explorerUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>payment txid ↗</a>}
                    {n.compensationExplorerUrl && <a href={n.compensationExplorerUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>↩ refund txid ↗</a>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PolicyPanel({ view }: { view: RunView }) {
  if (view.policy.checks.length === 0) return null;
  return (
    <div className="panel">
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Spend policy — {view.policy.verdict ?? "evaluating…"}</div>
      <div style={{ display: "grid", gap: 6 }}>
        {view.policy.checks.map((c) => (
          <div key={c.rule} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ borderBottom: c.passed ? "none" : "1px dashed var(--muted)" }}>
              {c.passed ? "✓" : "✗"} {c.rule}
            </span>
            {c.headroomUSDC != null && <span className="muted">{c.actualUSDC} / {c.limitUSDC} · {c.headroomUSDC} left</span>}
          </div>
        ))}
      </div>
      {view.policy.violations.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12 }}>blocked: {view.policy.violations[0]}</div>
      )}
    </div>
  );
}

export function GroupPanel({ view }: { view: RunView }) {
  const g = view.group;
  if (!g.groupId && g.slots.length === 0) return null;
  return (
    <div className="panel" style={{ fontSize: 12 }}>
      <div className="muted" style={{ marginBottom: 6 }}>Atomic transaction group</div>
      {g.signatureCount != null && (
        <div className="strong" style={{ marginBottom: 6 }}>
          {g.signatureCount} signature · {settledTxids(view).length || g.slots.length} payments · all-or-nothing
        </div>
      )}
      {g.slots.length > 0 && (
        <div style={{ display: "grid", gap: 3, marginBottom: 8 }}>
          {g.slots.map((s) => (
            <div key={s.index} style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="muted">slot {s.index} · {s.kind}{s.stepId ? ` · ${s.stepId}` : ""}</span>
              {s.amountUSDC && <span>${s.amountUSDC}</span>}
            </div>
          ))}
        </div>
      )}
      {g.groupId && <div style={{ wordBreak: "break-all" }}>group <span className="strong">{g.groupId}</span> · round {g.confirmedRound}</div>}
      {g.simulated === false && <div style={{ marginTop: 6, borderLeft: "2px solid var(--muted)", paddingLeft: 8 }}>simulation rejected — nothing submitted{g.simulationFailure ? `: ${g.simulationFailure}` : ""}</div>}
    </div>
  );
}

export function ReceiptStrip({ view }: { view: RunView }) {
  const tx = settledTxids(view);
  if (tx.length === 0) return null;
  return (
    <div className="panel" style={{ fontSize: 12 }}>
      <div className="muted" style={{ marginBottom: 6 }}>Settlement — {tx.length} txids to {new Set(tx.map((n) => n.payTo)).size} payees</div>
      <table>
        <tbody>
          {tx.map((n) => (
            <tr key={n.txid}>
              <td>{n.provider}</td>
              <td>${n.priceUSDC}</td>
              <td>{n.state}</td>
              <td><a href={n.explorerUrl} target="_blank" rel="noreferrer">tx ↗</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Outcome({ view }: { view: RunView }) {
  const refunds = refundedNodes(view);
  return (
    <div className="panel">
      <div style={{ fontSize: 18 }} className="strong">{outcomeHeadline(view)}</div>
      {view.error?.costedNothing && <div style={{ marginTop: 4 }}>You were charged nothing.</div>}
      {refunds.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {refunds.length} provider took payment and failed to deliver — reversed on chain.
        </div>
      )}
      {view.hasGap && <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>connection gap — some events may be missing</div>}
    </div>
  );
}

export function EventLog({ view }: { view: RunView }) {
  return (
    <details className="panel">
      <summary className="muted" style={{ cursor: "pointer", fontSize: 12 }}>raw event stream ({view.log.length})</summary>
      <pre className="muted" style={{ marginTop: 8, maxHeight: 260, overflow: "auto", fontSize: 10, lineHeight: 1.6 }}>
        {view.log.map((e) => `${String(e.seq).padStart(3, "0")}  ${e.type}`).join("\n")}
      </pre>
    </details>
  );
}
