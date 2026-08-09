# AXIS

**Atomic X402 Integrated Settlement** — an agent-native aggregator that turns N paid API calls into one all-or-nothing payment on Algorand.

> HackNite Code Royale 2026 · x402 & Algorand Track
> Sub-track: **Entry Management Framework — Atomic Agent Aggregators & Multi-Step Workflows**

---

## The problem

x402 solved the single call. An agent hits an endpoint, gets `402 Payment Required`, signs, retries, gets data. Clean.

Real agent work isn't a single call. A research agent, a PR reviewer, a due-diligence pipeline — each fans out across **five, ten, twenty** paid endpoints owned by different providers. Today that means:

- **N separate signatures.** The human-in-the-loop x402 was supposed to eliminate comes right back.
- **N unrelated payments.** Step 4 fails and you've already paid for steps 1–3. Money gone, workflow dead, no result.
- **N orphaned receipts.** No way to answer "what did this one report actually cost me?"
- **No spend ceiling.** An agent in a retry loop can drain a treasury before anyone notices.

Per-call payments don't compose. That's the gap.

## What AXIS does

AXIS sits between the agent and the providers. The agent describes a *workflow*; AXIS handles the money.

```
agent ──▶ AXIS ──┬──▶ provider A ($0.02)
                 ├──▶ provider B ($0.05)
                 ├──▶ provider C ($0.03)
                 └──▶ provider D ($0.03)

one signature · one atomic group · one receipt · $0.13
```

Either every provider gets paid and every result comes back, or nothing settles and the agent is out zero.

## What's built (live on Algorand testnet)

- **9 paid services** across 5 workers, each a distinct USDC payee: `diff-explainer`,
  `guardrail-checker`, `commit-roaster`, `bug-summarizer` + a toolbox of
  `code-generator`, `debugger`, `test-writer`, `translator`, `summarizer`.
- **`deep-review`** — the flagship workflow: **7 providers, 7 distinct payees,
  one signature, one atomic group.** Any provider that fails to deliver is
  **refunded on chain**; the run is marked `PARTIAL`.
- **Spend Policy Guard** (6 rules) — a FAIL means nothing is ever signed.
- **Facilitator feePayer** (GoPlausible) — the agent needs only USDC, no ALGO.
- **Auto-retry** on settlement (2 tries, then stop) + a **manual retry** button.
- **Agent-facing layer:** the `axis-pay` **SDK**, an **MCP server** (Claude /
  Cursor can atomically pay N x402 APIs natively), and an **autonomous budgeted
  agent** that picks a service from a goal and refuses anything it can't do.
- **Console** with projects / refunds / usage dashboards + JWT auth, and a
  **Chrome Live-Monitor extension** — an animated flowchart showing all services
  (used ones lit + coins, unused ✕), a live backend terminal, and the receipt.
- **Red-team:** the 3 x402 attacks that hit any server, blocked **live**; the
  other 2 are structurally impossible on Algorand.

See [`docs/BRIEF.md`](docs/BRIEF.md) for the full write-up and
[`docs/FEATURES.md`](docs/FEATURES.md) for how to verify every feature.

## Why this is only clean on Algorand

This is the core of the submission.

On most chains "atomic across N providers" means faking it — escrow contracts, hold-and-capture, refund queues, eventual consistency. You end up building a payment processor.

Algorand gives it natively. **Atomic transaction groups**: up to 16 transactions submitted as one unit, all committed or all rejected, no smart contract required, ~3s finality. The AVM x402 mechanism already builds on groups and pooled fees.

So AXIS composes N payment legs to N *different* provider addresses into a single group, gets one signature from the agent, and submits. Atomicity is a property of the chain, not of our code.

Three things fall out of this for free:

| | |
|---|---|
| **One signature** | Agent authorizes the whole workflow, not each hop. |
| **Pre-flight simulation** | `simulateTransactions` validates the entire group before a single microalgo moves. |
| **Fee abstraction** | Facilitator co-signs as `feePayer` — the agent needs USDC, not ALGO. |

## Architecture

AXIS runs a strict **two-phase** protocol. Nothing is paid during discovery.

### Phase 1 — Quote

```
1. Agent POSTs a workflow spec        → AXIS
2. AXIS fans out unpaid probes        → all providers
3. Providers return 402 challenges    → AXIS
4. AXIS resolves the DAG, sums cost   → returns a signed quote
```

Every provider states its price via its own `402`. AXIS resolves the dependency graph (which steps need which outputs), computes total cost, and returns a quote with a TTL. **Zero payments have occurred.**

### Phase 2 — Policy gate

Before anything is signed, the quote passes the **Spend Policy Guard**:

- per-workflow ceiling
- per-provider cap
- rolling velocity limit (calls/hour, spend/hour)
- provider trust threshold
- global kill switch

Fail any check → the workflow is rejected before a group is even built. This is the Agent Infrastructure sub-track, folded in as a mandatory pre-flight step rather than a bolt-on advisory API.

### Phase 3 — Compose & sign

```
5. AXIS builds ONE atomic group       (N payment legs, N providers)
6. simulateTransactions               (dry run — catch failures free)
7. Agent signs the group              ← the only signature
8. Facilitator verifies + settles     → group confirmed
```

### Phase 4 — Execute & receipt

```
9.  AXIS retries every call with its payment proof
10. Results collected, DAG resolved in order
11. Unified receipt emitted: group ID → N txids → N results
```

### Failure modes

Payment atomicity is not execution atomicity. We handle both:

| Failure | Handling |
|---|---|
| Quote expired | TTL enforced; re-quote. Nothing signed, nothing lost. |
| Policy violation | Rejected pre-signature. Zero cost. |
| Simulation fails | Group never submitted. Zero cost. |
| Group rejected on-chain | Native all-or-nothing. Zero cost. |
| **Provider 500s post-settlement** | Compensation leg — provider's escrowed portion is reversed and the run is marked `PARTIAL`. Receipt records the refund txid. |
| Provider times out | Retry with backoff inside `maxTimeoutSeconds`, then compensation. |

That last row is the one most submissions will miss. Settlement succeeding does not mean the service delivered.

## Repo structure

```
axis/
├── packages/
│   ├── router/          # quote → policy → compose → execute engine
│   ├── guard/           # spend policy + provider trust scoring
│   ├── receipts/        # group-linked receipt aggregation + indexer sync
│   └── shared/          # types, CAIP-2 constants, DAG resolver
├── providers/           # our own x402 endpoints (Hono / Workers)
│   ├── diff-explainer/
│   ├── guardrail-checker/
│   ├── commit-roaster/
│   └── bug-summarizer/
├── apps/
│   └── console/         # Next.js dashboard — live workflow + receipt viewer
└── docs/
    ├── PROTOCOL.md
    └── DEPLOYMENT.md
```

## Provider endpoints

Four first-party x402 endpoints, each on a **separate Algorand address**, so the atomic group genuinely spans multiple payees rather than paying ourselves once.

| Endpoint | Price | Returns |
|---|---|---|
| `POST /diff/explain` | $0.03 | Plain-language explanation of a git diff |
| `POST /guardrail/check` | $0.02 | Prompt-injection / jailbreak / policy risk score |
| `POST /commit/roast` | $0.03 | Commit message critique + rewritten alternatives |
| `POST /bug/summarize` | $0.05 | Noisy bug report → reproducible steps + severity |

All settle in **USDC ASA on Algorand Testnet**.

## Demo workflow — "Should I merge this PR?"

One button. The reviewer agent runs all four endpoints, spends $0.13, and returns a merge verdict.

The paying user is the **CI pipeline** — a real, non-subscription, pay-per-run business model. A repo that opens 200 PRs a month pays $26 and pays nothing on a quiet month. No seats, no API keys, no signup.

The console shows, live: four 402 challenges → one group ID → four txids on AlgoExplorer → one receipt.

## Quickstart

### Prerequisites

- Node 20+, pnpm 9+
- An Algorand Testnet account funded with ALGO ([Lora](https://lora.algokit.io/testnet/fund)) and test USDC ([Circle faucet](https://faucet.circle.com))
- Test USDC ASA opt-in on every provider address

### Install

```bash
git clone https://github.com/<org>/axis
cd axis
pnpm install
```

> **Note on packages:** the brief lists `@x402/*`. The Algorand AVM implementation ships as `@x402-avm/*` (GoPlausible's reference implementation, merged upstream into Coinbase's x402 repo). Verify against the track Discord before pinning. As of v2.6+, `algosdk` is no longer a direct dependency — the packages use `@algorandfoundation/algokit-utils` internally.

### Environment

```env
# Facilitator
FACILITATOR_URL=https://facilitator.goplausible.xyz

# Network
NETWORK=algorand:testnet
USDC_ASA_ID=<testnet_usdc_asa_id>

# Provider payout addresses (58 chars each, distinct)
PAY_TO_DIFF=...
PAY_TO_GUARDRAIL=...
PAY_TO_ROASTER=...
PAY_TO_BUGSUM=...

# Router agent wallet
AGENT_MNEMONIC=...

# Policy defaults
MAX_WORKFLOW_SPEND_USDC=1.00
MAX_HOURLY_SPEND_USDC=10.00
```

### Run

```bash
pnpm dev:providers    # all four x402 endpoints
pnpm dev:router       # AXIS aggregator
pnpm dev:console      # dashboard on :3000
```

### Deploy

Providers deploy to Cloudflare Workers (Hono). Router and console to Vercel. See `docs/DEPLOYMENT.md`.

## API

### `POST /v1/workflow/quote`

```json
{
  "workflow": "pr-review",
  "inputs": { "repo": "org/repo", "pr": 42 },
  "constraints": { "maxSpendUSDC": "0.50" }
}
```

Returns the resolved DAG, per-step pricing, total cost, policy verdict, and a `quoteId` with TTL. **No payment occurs.**

### `POST /v1/workflow/execute`

```json
{ "quoteId": "...", "signedGroup": "..." }
```

Submits the atomic group, settles via facilitator, executes all steps, returns results + `receiptId`.

### `GET /v1/receipt/:id`

Unified receipt — group ID, every txid, every provider, per-step cost, total, status (`SETTLED` / `PARTIAL` / `REVERSED`), and any compensation txids.

### `GET /v1/policy` · `PUT /v1/policy`

Read and update spend policy for the calling agent.

## How this maps to the judging criteria

| Weight | Criterion | Where AXIS delivers |
|---|---|---|
| **30%** | x402 Protocol Flow | Full 402 → sign → retry → settle → receipt executed **N times per workflow**, plus a distinct quote phase that reads challenges without paying. Every one of the brief's 8 steps is visible in the console. |
| **25%** | Real Pay-Per-Call Model | Paying user is the CI pipeline. Per-workflow-run pricing, no subscription, no seats. AXIS takes a routing fee per run. |
| **20%** | Technical Execution & Algorand | Native atomic transaction groups across multiple payees — an Algorand-specific capability, not a portable pattern. USDC ASA settlement, fee abstraction, `simulateTransactions` pre-flight, every txid surfaced in the response. |
| **15%** | Innovation & Utility | Multi-endpoint atomicity, unified receipts, and spend policy enforcement are the missing primitives between "x402 works" and "agents can actually use it." |
| **10%** | Documentation & Deployment | Live testnet endpoints, this README, `PROTOCOL.md`, `DEPLOYMENT.md`, mainnet-ready config (network is a single CAIP-2 constant). |

## Mainnet readiness

- Network selection is one CAIP-2 constant — testnet → mainnet is a config change.
- Facilitator supports mainnet Algorand today.
- Group size cap (16) is respected; larger workflows shard into sequential atomic batches with a shared workflow ID.
- Policy engine and receipt store are stateless-friendly and horizontally scalable.

## Roadmap

- Provider trust scoring from live indexer signals — settlement count, failure rate, refund history
- Bazaar/discovery extension integration for dynamic provider registration
- Cross-chain routing (Base, Solana) via the same facilitator
- Delegated allowances so agents run unattended under a standing budget

## Team

<!-- fill in -->

## License

MIT
