<img src="./logo.svg" alt="AXIS" width="72" align="right" />

# axis-pay

Drop-in client for **atomic multi-provider x402 payments** on Algorand. One call
pays N paid APIs in a single all-or-nothing group and returns a unified receipt.

```ts
import { createAxisClient } from "axis-pay";

const axis = createAxisClient({ routerUrl: "http://localhost:8080" });

const receipt = await axis.pay(
  "pr-review",
  { diff, commitMessage },
  agentAddress,
  { budgetUSDC: 0.5 },   // hard ceiling — throws OVER_BUDGET before settling
);

console.log(receipt.status, receipt.totalUSDC);   // "SETTLED" "0.14"
for (const leg of receipt.legs) console.log(leg.provider, leg.status, leg.explorerUrl);
```

## Why

x402 solved the single paid API call. A real agent makes ten, to ten providers —
ten signatures, ten unrelated payments, and if step four fails you've already
paid for one, two and three. AXIS turns that into **one signature, one atomic
Algorand group, one receipt**: either everyone is paid and every result comes
back, or nothing settles and the agent is out $0.

## API

| Call | Does |
|---|---|
| `createAxisClient({ routerUrl, token?, timeoutMs? })` | make a client |
| `quote(workflow, inputs, agentAddress)` | price it with **zero** payment; returns the signed quote + policy verdict |
| `pay(workflow, inputs, agentAddress, { budgetUSDC?, chaosStep? })` | quote → budget check → settle → **unified receipt** |
| `getReceipt(runId)` | fetch a receipt (renders standalone) |
| `onEvents(runId, cb)` | subscribe to the live event stream |

Errors are `AxisPayError` with a `.code` (`POLICY_BLOCKED`, `OVER_BUDGET`,
`QUOTE_FAILED`, …) and `.costedNothing` so you always know if money moved.

## Design

- **Zero dependencies.** Talks HTTP to an AXIS router; runs anywhere with global `fetch`.
- **Holds no keys.** The router owns the agent wallet and does the signing — this SDK never sees a mnemonic.
- **Types mirror the router** so the client and server can't drift.

## Try it

```bash
node example.ts          # quote only — zero payment
PAY=1 node example.ts    # settle a real atomic payment on testnet
```
