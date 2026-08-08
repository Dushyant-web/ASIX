"use client";
/**
 * Start attack — the red-team demo. Fire the five x402 attacks from the paper
 * (arXiv:2605.11781) against our own endpoints and watch them get blocked.
 * 3 are LIVE and re-runnable; 2 are assessment scenes (structurally impossible
 * on Algorand). UX structure only.
 */
import { useState } from "react";
import { api } from "../../lib/api.ts";

interface AttackResult { fired: number; blocked: number; granted: number; mitigation: string; detail: string; sample?: string[] }

const LIVE = [
  { id: "replay", n: "Attack II — Replay / idempotency",
    what: "Send the SAME payment N times at once. Without protection: N grants (the paper measured 248 from one payment). With our pre-grant claim: 1 grant, the rest rejected.",
    mitigation: "M3 — single-use (pay_id, resource) claim, backed by Cloudflare KV",
    file: "backend/providers/_kit/src/claims.ts" },
  { id: "cross-resource", n: "Cross-resource replay",
    what: "Take a payment signed for /diff/explain and fire it at /bug/summarize. No audited SDK binds payment to resource; a payment for A worked on B, C, D.",
    mitigation: "M1 — resource binding: signed resource must match the requested path",
    file: "backend/providers/_kit/src/handler.ts" },
  { id: "cache", n: "Attack III — Cache leakage",
    what: "A paid response, then an unpaid client re-requests it. The paper measured 100% leakage through a misconfigured cache with no header.",
    mitigation: "M5 — Cache-Control: no-store, private + Vary: X-PAYMENT on every response",
    file: "backend/providers/_kit/src/handler.ts" },
];

const ASSESS = [
  { id: "revert", n: "Attack I-A — Revert-grant", why: "Needs a chain reorg to erase a settled payment after the grant. Algorand has ~3s deterministic finality and no reorgs — settlement IS finality, so the attackable gap is zero. (On Base the paper measured up to 5.18%.)" },
  { id: "preempt", n: "Attack I-B — Settlement preemption", why: "An EVM/Permit2 flaw where an observer submits the payment authorization first. Our atomic group is agent-signed and router-settled once; a thief who grabs the signed group can only make the same payments land to the same providers. Nothing to steal." },
  { id: "selection", n: "Attack IV — Server selection", why: "Attacks open discovery (Bazaar) by gaming metadata / Sybils. AXIS uses a fixed, first-party provider set — there is no discovery surface to game. Roadmap: M6 if open discovery is ever added." },
];

export default function Attack() {
  const [results, setResults] = useState<Record<string, AttackResult | "running">>({});

  const fire = async (id: string) => {
    setResults((r) => ({ ...r, [id]: "running" }));
    try {
      const res = await api.attack(id);
      setResults((r) => ({ ...r, [id]: res }));
    } catch (e) {
      setResults((r) => ({ ...r, [id]: { fired: 0, blocked: 0, granted: 0, mitigation: "", detail: `router offline — start the router to fire live (${String(e).slice(0, 40)})` } }));
    }
  };

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 32, display: "grid", gap: 16 }}>
      <header>
        <h1 style={{ fontSize: 28, margin: 0 }}>Start attack</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          The one paper that breaks x402 (arXiv:2605.11781) defines five attacks. We fixed the three
          that apply to any x402 server — fire them live below and watch them bounce. The other two
          target Ethereum&apos;s probabilistic settlement; Algorand&apos;s deterministic finality means they
          cannot exist here.
        </p>
        <a href="https://arxiv.org/abs/2605.11781" target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>download the paper ↗</a>
      </header>

      <div className="muted" style={{ fontSize: 12 }}>Live attacks — real requests against our deployed endpoints</div>
      {LIVE.map((a) => {
        const r = results[a.id];
        return (
          <div key={a.id} className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
              <div className="strong">{a.n}</div>
              <button className="btn" onClick={() => fire(a.id)} disabled={r === "running"}>{r === "running" ? "firing…" : "fire attack"}</button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{a.what}</p>
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>defence: {a.mitigation}</div>
            <div className="muted" style={{ fontSize: 11 }}>source: {a.file}</div>
            {r && r !== "running" && (
              <div className="node" data-done={r.blocked > 0} style={{ marginTop: 10, fontSize: 12 }}>
                {r.fired > 0
                  ? <>fired <span className="strong">{r.fired}</span> · granted <span className="strong">{r.granted}</span> · blocked <span className="strong">{r.blocked}</span> — {r.detail}</>
                  : r.detail}
              </div>
            )}
          </div>
        );
      })}

      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Assessment — structurally impossible on Algorand</div>
      {ASSESS.map((a) => (
        <div key={a.id} className="panel">
          <div className="strong">{a.n}</div>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{a.why}</p>
        </div>
      ))}
    </main>
  );
}
