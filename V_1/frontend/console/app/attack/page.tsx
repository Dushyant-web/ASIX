"use client";
import { useState } from "react";
import { api } from "../../lib/api.ts";

interface AttackResult { fired: number; blocked: number; granted: number; mitigation: string; detail: string }

const LIVE = [
  { id: "replay", n: "Attack II — Replay / idempotency",
    what: "Send the SAME payment 12 times at once. Without protection: 12 grants (the paper measured 248 from one payment). With our Durable Object claim: 1 grant, the rest refused.",
    mitigation: "M3 — single-use claim via Durable Object", file: "backend/providers/_kit/src/claims.ts" },
  { id: "cross-resource", n: "Cross-resource replay",
    what: "Take a payment signed for /diff/explain and fire it at /bug/summarize. No audited SDK binds payment to resource.",
    mitigation: "M1 — resource binding", file: "backend/providers/_kit/src/handler.ts" },
  { id: "cache", n: "Attack III — Cache leakage",
    what: "A paid response re-requested by an unpaid client. The paper measured 100% leakage through a cache with no header.",
    mitigation: "M5 — no-store + Vary: X-PAYMENT", file: "backend/providers/_kit/src/handler.ts" },
];
const ASSESS = [
  { n: "Attack I-A — Revert-grant", why: "Needs a chain reorg to erase a settled payment. Algorand has ~3s deterministic finality and no reorgs; the attackable gap is zero. On Base the paper measured up to 5.18%." },
  { n: "Attack I-B — Settlement preemption", why: "An EVM/Permit2 flaw. Our group is agent-signed and settled once; a thief who grabs it can only make the same payments land to the same providers. Nothing to steal." },
  { n: "Attack IV — Server selection", why: "Attacks open discovery (Bazaar). AXIS uses a fixed first-party provider set — no discovery surface to game." },
];

export default function Attack() {
  const [results, setResults] = useState<Record<string, AttackResult | "running">>({});
  const fire = async (id: string) => {
    setResults((r) => ({ ...r, [id]: "running" }));
    try { const res = await api.attack(id); setResults((r) => ({ ...r, [id]: res })); }
    catch (e) { setResults((r) => ({ ...r, [id]: { fired: 0, blocked: 0, granted: 0, mitigation: "", detail: `router offline (${String(e).slice(0, 40)})` } })); }
  };
  return (
    <main>
      <h1>Start attack</h1>
      <p>The one paper that breaks x402 (arXiv:2605.11781) defines five attacks. We fixed the three that apply to any x402 server. The other two target Ethereum&apos;s settlement; Algorand&apos;s deterministic finality means they cannot exist here.</p>
      <p><a href="https://arxiv.org/abs/2605.11781" target="_blank" rel="noreferrer">download the paper</a></p>
      <h2>Live attacks (real requests against our endpoints)</h2>
      {LIVE.map((a) => {
        const r = results[a.id];
        return (
          <div key={a.id}>
            <h3>{a.n}</h3>
            <p>{a.what}</p>
            <p>defence: {a.mitigation}</p>
            <p>source: {a.file}</p>
            <button onClick={() => fire(a.id)} disabled={r === "running"}>{r === "running" ? "firing..." : "fire attack"}</button>
            {r && r !== "running" ? (
              <p>{r.fired > 0 ? `fired ${r.fired}, granted ${r.granted}, blocked ${r.blocked} — ${r.detail}` : r.detail}</p>
            ) : null}
            <hr />
          </div>
        );
      })}
      <h2>Assessment (structurally impossible on Algorand)</h2>
      {ASSESS.map((a) => (
        <div key={a.n}><h3>{a.n}</h3><p>{a.why}</p></div>
      ))}
    </main>
  );
}
