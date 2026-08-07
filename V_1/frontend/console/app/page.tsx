"use client";

/**
 * Phase F1 scaffold — proves the state machine drives a real view.
 *
 * This runs against `mockRun()`, so it works with NO backend. Phase F2 replaces
 * the markup below with real components; the wiring here does not change.
 * Going live later is one swap: `mockRun()` -> `useRunStream(runId)`.
 */
import { useCallback, useState } from "react";
import { mockRun, type RunEvent } from "@axis/shared";
import {
  applyEvent, initialRunView, outcomeHeadline, type RunView,
} from "../lib/state-machine.ts";

export default function Home() {
  const [view, setView] = useState<RunView>(initialRunView);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    setView(initialRunView());
    for await (const e of mockRun({ scenario: "partial", speed: 2 })) {
      setView((v) => applyEvent(v, e as RunEvent));
    }
    setBusy(false);
  }, []);

  return (
    <main className="mx-auto max-w-5xl p-8 font-mono">
      <h1 className="text-3xl font-bold">AXIS</h1>
      <p className="mt-1 text-neutral-400">
        N paid API calls · one atomic payment · one receipt
      </p>

      <button
        onClick={run}
        disabled={busy}
        className="mt-6 rounded bg-emerald-600 px-5 py-3 font-semibold disabled:opacity-40"
      >
        {busy ? "Running…" : "Should I merge this PR?"}
      </button>

      <p className="mt-6 text-lg">{outcomeHeadline(view)}</p>

      {/* Protocol rail — the brief's own 8 steps, ticking off live. */}
      <ol className="mt-6 grid grid-cols-4 gap-2 text-xs">
        {view.protocol.map((p) => (
          <li
            key={p.step}
            className={
              "rounded border p-2 " +
              (p.status === "done" ? "border-emerald-600 text-emerald-400"
                : p.status === "active" ? "border-amber-500 text-amber-400"
                : p.status === "failed" ? "border-red-600 text-red-400"
                : "border-neutral-800 text-neutral-600")
            }
          >
            {p.step}
            {p.detail && <div className="mt-1 text-[10px] opacity-70">{p.detail}</div>}
          </li>
        ))}
      </ol>

      {/* Nodes, grouped by DAG batch — batch 0 runs in parallel. */}
      {view.batches.map((batch, i) => (
        <div key={i} className="mt-4">
          <div className="text-xs text-neutral-500">
            batch {i} {batch.length > 1 && "· parallel"}
          </div>
          <div className="mt-1 grid gap-2 sm:grid-cols-3">
            {batch.map((id) => {
              const n = view.nodes[id];
              if (!n) return null;
              return (
                <div key={id} className="rounded border border-neutral-800 p-3 text-xs">
                  <div className="font-semibold">{n.provider}</div>
                  <div className="text-neutral-500">{n.state}</div>
                  {n.priceUSDC && <div className="mt-1">${n.priceUSDC}</div>}
                  {n.explorerUrl && (
                    <a href={n.explorerUrl} target="_blank" rel="noreferrer"
                       className="mt-1 block text-emerald-400 underline">
                      txid ↗
                    </a>
                  )}
                  {n.compensationExplorerUrl && (
                    <a href={n.compensationExplorerUrl} target="_blank" rel="noreferrer"
                       className="mt-1 block text-amber-400 underline">
                      refunded ↗
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {view.group.groupId && (
        <p className="mt-6 break-all text-xs text-neutral-400">
          group <span className="text-neutral-200">{view.group.groupId}</span>
          {" · "}round {view.group.confirmedRound}
          {" · "}{view.group.signatureCount} signature
        </p>
      )}
    </main>
  );
}
