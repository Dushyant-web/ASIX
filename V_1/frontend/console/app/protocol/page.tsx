const STEPS = [
  ["1 · discover", "Router fans out unpaid probes to all providers — no money moves."],
  ["2 · challenge", "Each provider replies 402 with its own price. The router reads the price from here — no hardcoded table."],
  ["3 · quote", "DAG resolved into parallel batches, costs summed, quote signed with a TTL."],
  ["4 · policy", "The spend guard evaluates ceilings, velocity, trust. A FAIL blocks everything at zero cost."],
  ["5 · compose", "One atomic group is built — N USDC legs to N distinct payees."],
  ["6 · simulate", "A free dry run. A group that fails simulation is never submitted."],
  ["7 · sign", "One signature from the agent authorizes the whole workflow."],
  ["8 · settle", "The group commits all-or-nothing in ~3s. Every txid is returned, then providers deliver."],
];

export default function Protocol() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 32, display: "grid", gap: 16 }}>
      <header>
        <h1 style={{ fontSize: 28, margin: 0 }}>How it works</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>The full x402 flow, run N times per workflow, plus a distinct quote phase that reads prices without paying.</p>
      </header>
      <div className="panel">
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
          {STEPS.map(([s, d]) => (
            <li key={s} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12 }}>
              <div className="strong" style={{ fontSize: 12 }}>{s}</div>
              <div className="muted" style={{ fontSize: 12 }}>{d}</div>
            </li>
          ))}
        </ol>
      </div>
      <div className="panel muted" style={{ fontSize: 12 }}>
        Why Algorand: atomic transaction groups (up to 16, all-or-nothing, no smart contract),
        ~3s deterministic finality, simulateTransactions for a free pre-flight, and fee pooling so
        the agent needs only USDC. This is native — on an EVM chain it means writing an escrow contract.
      </div>
    </main>
  );
}
