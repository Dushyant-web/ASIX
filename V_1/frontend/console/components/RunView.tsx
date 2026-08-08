"use client";
/**
 * The shared run visualization. Phase F1 owns this SHAPE and STATE; Phase F2
 * will replace the styling and add motion. Every value here comes from the
 * state machine — this component computes nothing.
 */
import type { RunView } from "../lib/state-machine.ts";
import { outcomeHeadline, settledTxids, refundedNodes } from "../lib/state-machine.ts";

export function ProtocolRail({ view }: { view: RunView }) {
  return (
    <ol className="grid grid-cols-4 gap-2 text-xs sm:grid-cols-8">
      {view.protocol.map((p) => (
        <li key={p.step}
          className={"rounded border p-2 text-center " +
            (p.status === "done" ? "border-emerald-600 text-emerald-400"
              : p.status === "active" ? "border-amber-500 text-amber-400 animate-pulse"
              : p.status === "failed" ? "border-red-600 text-red-400"
              : "border-neutral-800 text-neutral-600")}>
          <div>{p.step}</div>
          {p.detail && <div className="mt-1 text-[10px] opacity-70 truncate">{p.detail}</div>}
        </li>
      ))}
    </ol>
  );
}

const STATE_COLOR: Record<string, string> = {
  idle: "border-neutral-800 text-neutral-500",
  probing: "border-amber-500 text-amber-400 animate-pulse",
  quoted: "border-sky-600 text-sky-300",
  paying: "border-amber-500 text-amber-400 animate-pulse",
  paid: "border-emerald-700 text-emerald-400",
  running: "border-amber-500 text-amber-400 animate-pulse",
  delivered: "border-emerald-600 text-emerald-300",
  failed: "border-red-600 text-red-400",
  compensating: "border-orange-500 text-orange-400 animate-pulse",
  refunded: "border-orange-700 text-orange-400",
  blocked: "border-red-700 text-red-500",
  skipped: "border-neutral-800 text-neutral-600 opacity-50",
};

export function WorkflowGraph({ view }: { view: RunView }) {
  return (
    <div className="space-y-3">
      {view.batches.map((batch, i) => (
        <div key={i}>
          <div className="mb-1 text-xs text-neutral-500">batch {i}{batch.length > 1 && " · parallel"}</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {batch.map((id) => {
              const n = view.nodes[id];
              if (!n) return null;
              return (
                <div key={id} className={"rounded border p-3 text-xs " + (STATE_COLOR[n.state] ?? "border-neutral-800")}>
                  <div className="flex justify-between font-semibold">
                    <span>{n.provider}</span>
                    {n.priceUSDC && <span>${n.priceUSDC}</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] uppercase tracking-wide opacity-70">{n.state}</div>
                  {n.preview && <div className="mt-1 line-clamp-2 text-neutral-400">{n.preview}</div>}
                  {n.explorerUrl && <a href={n.explorerUrl} target="_blank" rel="noreferrer" className="mt-1 block underline">txid ↗</a>}
                  {n.compensationExplorerUrl && (
                    <a href={n.compensationExplorerUrl} target="_blank" rel="noreferrer" className="mt-1 block text-orange-400 underline">↩ refunded ↗</a>
                  )}
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
    <div className="rounded border border-neutral-800 p-3">
      <div className="mb-2 text-xs text-neutral-500">Spend policy — {view.policy.verdict ?? "…"}</div>
      <div className="space-y-1">
        {view.policy.checks.map((c) => (
          <div key={c.rule} className="flex items-center justify-between text-xs">
            <span className={c.passed ? "text-neutral-300" : "text-red-400"}>
              {c.passed ? "✓" : "✗"} {c.rule}
            </span>
            {c.headroomUSDC && <span className="text-neutral-500">${c.actualUSDC} / ${c.limitUSDC} · ${c.headroomUSDC} left</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function GroupPanel({ view }: { view: RunView }) {
  const g = view.group;
  if (!g.groupId && g.slots.length === 0) return null;
  return (
    <div className="rounded border border-neutral-800 p-3 text-xs">
      {g.signatureCount != null && (
        <div className="mb-1 text-emerald-400">{g.signatureCount} signature · {settledTxids(view).length || g.slots.length} payments</div>
      )}
      {g.groupId && <div className="break-all text-neutral-400">group <span className="text-neutral-200">{g.groupId}</span> · round {g.confirmedRound}</div>}
      {g.simulated === false && <div className="text-red-400">simulation rejected — nothing submitted{g.simulationFailure ? `: ${g.simulationFailure}` : ""}</div>}
    </div>
  );
}

export function Outcome({ view }: { view: RunView }) {
  const refunds = refundedNodes(view);
  return (
    <div className="rounded border border-neutral-800 p-4">
      <div className="text-lg">{outcomeHeadline(view)}</div>
      {view.error?.costedNothing && <div className="mt-1 text-sm text-emerald-400">You were charged nothing.</div>}
      {refunds.length > 0 && (
        <div className="mt-2 text-sm text-orange-400">
          {refunds.length} provider took payment and failed — refunded on chain.
        </div>
      )}
      {view.hasGap && <div className="mt-2 text-xs text-amber-500">⚠ connection gap detected — some events may be missing</div>}
    </div>
  );
}

export function EventLog({ view }: { view: RunView }) {
  return (
    <details className="rounded border border-neutral-800 p-3">
      <summary className="cursor-pointer text-xs text-neutral-500">raw event stream ({view.log.length})</summary>
      <pre className="mt-2 max-h-64 overflow-auto text-[10px] leading-relaxed text-neutral-400">
        {view.log.map((e) => `${String(e.seq).padStart(3, "0")}  ${e.type}`).join("\n")}
      </pre>
    </details>
  );
}
