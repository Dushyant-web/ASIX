"use client";
/**
 * Run visualization — RAW HTML, no styling. State is shown as plain text
 * labels. All CSS/colors/layout are the team's job (F2). Every value comes
 * from the state machine; these components compute nothing.
 */
import type { RunView } from "../lib/state-machine.ts";
import { outcomeHeadline, settledTxids, refundedNodes } from "../lib/state-machine.ts";

export function ProtocolRail({ view }: { view: RunView }) {
  return (
    <ol>
      {view.protocol.map((p, i) => (
        <li key={p.step}>
          {i + 1}. {p.step} — {p.status}{p.detail ? ` (${p.detail})` : ""}
        </li>
      ))}
    </ol>
  );
}

export function WorkflowGraph({ view }: { view: RunView }) {
  return (
    <div>
      {view.batches.map((batch, i) => (
        <div key={i}>
          <p>batch {i}{batch.length > 1 ? " (runs in parallel)" : ""}</p>
          <ul>
            {batch.map((id) => {
              const n = view.nodes[id];
              if (!n) return null;
              return (
                <li key={id}>
                  {n.provider} — {n.state}{n.priceUSDC ? ` — $${n.priceUSDC}` : ""}
                  {n.preview ? <div>{n.preview}</div> : null}
                  {n.explorerUrl ? <div><a href={n.explorerUrl} target="_blank" rel="noreferrer">payment txid</a></div> : null}
                  {n.compensationExplorerUrl ? <div><a href={n.compensationExplorerUrl} target="_blank" rel="noreferrer">refund txid</a></div> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function PolicyPanel({ view }: { view: RunView }) {
  if (view.policy.checks.length === 0) return null;
  return (
    <div>
      <h3>Spend policy — {view.policy.verdict ?? "evaluating"}</h3>
      <ul>
        {view.policy.checks.map((c) => (
          <li key={c.rule}>
            {c.passed ? "PASS" : "FAIL"} — {c.rule}
            {c.headroomUSDC != null ? ` (${c.actualUSDC} / ${c.limitUSDC}, ${c.headroomUSDC} left)` : ""}
          </li>
        ))}
      </ul>
      {view.policy.violations.length > 0 ? <p>blocked: {view.policy.violations[0]}</p> : null}
    </div>
  );
}

export function GroupPanel({ view }: { view: RunView }) {
  const g = view.group;
  if (!g.groupId && g.slots.length === 0) return null;
  return (
    <div>
      <h3>Atomic transaction group</h3>
      {g.signatureCount != null ? (
        <p>{g.signatureCount} signature, {settledTxids(view).length || g.slots.length} payments, all-or-nothing</p>
      ) : null}
      {g.slots.length > 0 ? (
        <ul>
          {g.slots.map((s) => (
            <li key={s.index}>slot {s.index} — {s.kind}{s.stepId ? ` — ${s.stepId}` : ""}{s.amountUSDC ? ` — $${s.amountUSDC}` : ""}</li>
          ))}
        </ul>
      ) : null}
      {g.groupId ? <p>group {g.groupId} — round {g.confirmedRound}</p> : null}
      {g.simulated === false ? <p>simulation rejected — nothing submitted{g.simulationFailure ? `: ${g.simulationFailure}` : ""}</p> : null}
    </div>
  );
}

export function ReceiptStrip({ view }: { view: RunView }) {
  const tx = settledTxids(view);
  if (tx.length === 0) return null;
  return (
    <div>
      <h3>Settlement — {tx.length} txids to {new Set(tx.map((n) => n.payTo)).size} payees</h3>
      <table>
        <tbody>
          {tx.map((n) => (
            <tr key={n.txid}>
              <td>{n.provider}</td>
              <td>${n.priceUSDC}</td>
              <td>{n.state}</td>
              <td><a href={n.explorerUrl} target="_blank" rel="noreferrer">tx</a></td>
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
    <div>
      <h3>{outcomeHeadline(view)}</h3>
      {view.error?.costedNothing ? <p>You were charged nothing.</p> : null}
      {refunds.length > 0 ? <p>{refunds.length} provider took payment and failed to deliver — reversed on chain.</p> : null}
      {view.hasGap ? <p>connection gap — some events may be missing</p> : null}
    </div>
  );
}

export function EventLog({ view }: { view: RunView }) {
  return (
    <details>
      <summary>raw event stream ({view.log.length})</summary>
      <pre>{view.log.map((e) => `${e.seq}  ${e.type}`).join("\n")}</pre>
    </details>
  );
}
