# AXIS — Architecture & Technical Specification

**Atomic X402 Integrated Settlement**
HackNite Code Royale 2026 · x402 & Algorand Track
Sub-track: Entry Management Framework — Atomic Agent Aggregators & Multi-Step Workflows

> This document is the **what** and the **why**: the core solution, the tech stack and the reason for every choice, the architecture, the folder structure, the data model, every API contract, every failure mode, and the exact feature list that is in scope.
>
> The **how** and the **when** — build order, phases, acceptance gates, commands, deployment, demo script — is in `BUILD_PLAN.md`.

---

## Table of Contents

1. [Core Solution](#1-core-solution)
2. [Why Algorand Is Load-Bearing](#2-why-algorand-is-load-bearing)
3. [Tech Stack — Every Choice and Its Reason](#3-tech-stack--every-choice-and-its-reason)
4. [System Architecture](#4-system-architecture)
5. [The Four-Phase Protocol](#5-the-four-phase-protocol)
6. [Folder Structure](#6-folder-structure)
7. [Data Model](#7-data-model)
8. [API Contracts](#8-api-contracts)
9. [Provider Contract](#9-provider-contract)
10. [LLM Integration](#10-llm-integration)
11. [Spend Policy Guard](#11-spend-policy-guard)
12. [DAG Resolver](#12-dag-resolver)
13. [Failure Modes and Handling](#13-failure-modes-and-handling)
14. [Feature Scope — In / Out](#14-feature-scope--in--out)
15. [Security Model](#15-security-model)
16. [Observability](#16-observability)
17. [Environment Configuration](#17-environment-configuration)
18. [Mainnet Readiness](#18-mainnet-readiness)
19. [Judging Criteria Mapping](#19-judging-criteria-mapping)
20. [Differentiation Strategy — How We Get to #1](#20-differentiation-strategy--how-we-get-to-1)

---

## 1. Core Solution

### The problem in one paragraph

x402 solved the **single** paid API call. An agent hits an endpoint, gets `402 Payment Required`, signs a payment, retries, gets data. Clean. But real agent work is never a single call — a research agent, a PR reviewer, a due-diligence pipeline fans out across five, ten, twenty paid endpoints owned by different providers. Today that means N separate signatures (the human-in-the-loop x402 was supposed to eliminate comes right back), N unrelated payments (step 4 fails and you have already paid for steps 1–3 — money gone, workflow dead, no result), N orphaned receipts (no way to answer "what did this one report cost me?"), and no spend ceiling (an agent in a retry loop can drain a treasury before anyone notices). **Per-call payments do not compose.**

### What AXIS is

AXIS is an **agent-native aggregator** that sits between the agent and N paid providers and turns N paid API calls into **one all-or-nothing payment** on Algorand.

```
agent ──▶ AXIS ──┬──▶ provider A ($0.02)
                 ├──▶ provider B ($0.05)
                 ├──▶ provider C ($0.03)
                 └──▶ provider D ($0.03)

one signature · one atomic group · one receipt · $0.13
```

Either every provider gets paid and every result comes back, or nothing settles and the agent is out zero.

### The four primitives AXIS adds on top of x402

| Primitive | What it means | Why it did not exist before |
|---|---|---|
| **Multi-endpoint atomicity** | N payment legs to N *different* provider addresses commit or reject as one unit | x402 is per-call by design; nothing composes calls into a single settlement |
| **Unified receipts** | One receipt maps: group ID → N txids → N provider results → total cost → status | Per-call receipts are orphaned; no artifact answers "what did this workflow cost" |
| **Pre-flight spend policy** | Every workflow passes ceilings, caps, velocity limits and a kill switch **before** anything is signed | No standard place to enforce an agent's budget; advisory APIs are bolt-ons, not gates |
| **Compensation on delivery failure** | Payment atomicity ≠ execution atomicity. A provider that 500s post-settlement gets its leg reversed and the run is marked `PARTIAL` | Everyone else stops at "the group committed" and calls it done |

That last row is the one most submissions will miss. **Settlement succeeding does not mean the service delivered.**

### The paying user (real business model)

The paying user is the **CI pipeline**, not a human with a credit card.

- A repo opens a PR → CI triggers the AXIS `pr-review` workflow → $0.13 spent → merge verdict returned.
- A repo that opens 200 PRs a month pays **$26**. On a quiet month it pays **$0**.
- No seats, no subscription, no signup, no API key provisioning.
- AXIS takes a routing fee per run.

This is a genuinely non-subscription, pay-per-run model — which is exactly what x402 exists to enable.

---

## 2. Why Algorand Is Load-Bearing

This is the technical heart of the submission and must be stated explicitly in the demo.

On most chains, "atomic across N providers" means **faking it**: escrow contracts, hold-and-capture flows, refund queues, eventual consistency. You end up writing a payment processor and hoping the reconciliation logic is right.

Algorand gives it **natively**:

| Algorand capability | What AXIS gets from it |
|---|---|
| **Atomic transaction groups** — up to 16 txns submitted as one unit, all committed or all rejected, **no smart contract required** | Multi-payee atomicity is a property of the chain, not of our code. Zero custom escrow logic. |
| **~3 second finality** | The demo is watchable in real time. Settlement completes inside a single button press. |
| **`simulateTransactions`** | The entire group is validated — balances, opt-ins, fees, group integrity — **before a single microAlgo moves**. Free dry run. |
| **Pooled fees + `feePayer`** | The facilitator co-signs as fee payer. The agent needs USDC, not ALGO. Fee abstraction for free. |
| **USDC as an ASA** | Real stablecoin settlement, not a testnet toy token. |

Three consequences fall out with no extra engineering:

- **One signature** — the agent authorizes the whole workflow, not each hop.
- **Pre-flight simulation** — group failures cost nothing and are caught before submission.
- **Fee abstraction** — the agent holds only USDC.

**This is not a portable pattern.** Rebuilding it on an EVM chain means writing and auditing an escrow contract. That is the argument.

---

## 3. Tech Stack — Every Choice and Its Reason

### Hard constraints that decided things before taste did

1. **The official x402 SDKs are JS/TS only.** The track brief names them explicitly: **client** `@x402/fetch` + `@x402/avm`, **server** `@x402/hono` + `@x402/core/server`. Any other language means reimplementing the 402 challenge → sign → retry → settle protocol from scratch. **TypeScript is not a preference, it is a constraint.**
2. **The execute phase is long I/O** — fan-out to four providers, each backed by an LLM call, 5–20 s each. Anything with a hard wall-clock execution cap is disqualified for the router.
3. **Judges need live public URLs** — always-on, no cold start on the demo click.
4. **Receipts must survive a restart.** A judge clicking `/v1/receipt/:id` an hour later must get a receipt.

### The stack

| Layer | Choice | Why this and not the alternative |
|---|---|---|
| **Language** | TypeScript 5.x, ESM, strict mode | Forced by the official x402 SDKs. Strict + ESM because they are ESM-only. |
| **Runtime** | Node 22 LTS | Bun installs and tests faster, but the deploy targets are `workerd` and Node — a dev/prod runtime mismatch is a debugging tax you cannot afford at 3am. Speed comes from pnpm, not from swapping runtimes. |
| **Package manager** | pnpm 9 | Content-addressed store, fastest cold install, strict peer resolution catches version drift between the four provider packages. |
| **Monorepo** | Turborepo | `pnpm dev` runs everything with one command; task graph caching makes rebuilds instant. ~5 minutes of setup, pays back the first afternoon. |
| **HTTP framework** | **Hono** (providers + router) | **The official x402 server SDK is `@x402/hono`.** Choosing anything else means writing the 402 challenge middleware by hand. On top of that, Hono is the only framework that runs *identically* on Cloudflare Workers and Node — same middleware, same types, same code shape across both tiers. Express and Fastify don't run on Workers. Hono also has first-class Zod/OpenAPI integration. **This choice is made for us; do not revisit it.** |
| **Validation & types** | **Zod v3** (`^3.24.2`) + `@hono/zod-openapi` | **Pinned to v3 because `@x402/core` builds its schemas on `zod ^3.24.2`** — installing v4 alongside yields two zod copies and incompatible inferred types at the SDK boundary (verified, see `docs/PROTOCOL.md` §1). One schema per object in `packages/shared` is the single source of truth for router validation, provider parsing, DB inserts, and console types. OpenAPI docs generate from it for free — which is literally the Documentation judging criterion. |
| **Database** | **Neon Postgres** + **Drizzle ORM** | *One* store, not two. The textbook answer is Redis for quotes/counters + Postgres for receipts. At demo scale the velocity window is `SELECT sum(amount) WHERE ts > now() - interval '1 hour'` — free. Two stores = two failure surfaces = two things that can break mid-demo. Neon is serverless, free tier, ~0 ops. |
| **ORM** | Drizzle, **not Prisma** | No codegen step in the build, no heavy client, TS-native schema, and the emitted SQL is inspectable — which matters when you are debugging a receipt aggregation live. Prisma's generate step alone would slow every CI run. |
| **x402 — server** | `@x402/hono` + `@x402/core/server` | Official server SDKs per the track brief. Issue the HTTP 402 challenge. Used by all four providers. |
| **x402 — client** | `@x402/fetch` + `@x402/avm` | Official client SDKs per the track brief. Sign and auto-retry. Used by the router when it acts as the paying agent. |
| **Facilitator** | `https://facilitator.goplausible.xyz` | The provided facilitator service. Verifies and settles payment, co-signs as `feePayer`. |
| **Settlement asset** | USDC ASA on Algorand — testnet for MVP, **mainnet encouraged** | Per the brief. Mainnet is a four-variable config change (§18) — worth doing if time allows, it is explicitly encouraged. |
| **Chain utils** | `@algorandfoundation/algokit-utils` | For raw group composition and `simulateTransactions` where the x402 SDK doesn't expose it. `algosdk` is **not** a direct dependency in recent versions — do not add it unless the Phase 0 spike proves you need it. |
| **LLM** | `@anthropic-ai/sdk`, model `claude-opus-5` | All four provider endpoints are generate/summarize/classify tasks. See §10 for exact parameters. |
| **Frontend** | **Next.js 15** (App Router) + React 19 | The README specifies it, it deploys to Vercel with zero config, and route handlers give a clean place to proxy the router later if the API surface needs hiding. Client components do the work; no RSC data fetching needed. |
| **Frontend data** | TanStack Query + native `EventSource` (SSE) | Query for quote/receipt fetches, SSE for the live run stream. SSE over WebSocket: one-way, no handshake, survives proxies, ~10 lines of server code. |
| **Styling** | Tailwind v4 + shadcn/ui | 20% of the score is judged through the console. This is the fastest route to something that looks deliberate rather than assembled. |
| **Testing** | Vitest | Zero-config TS, same config shape across every package, runs the DAG resolver and policy guard unit tests in milliseconds. |
| **Logging** | Pino (router) + `console` with structured JSON (Workers) | Structured JSON with a correlating `workflowId` on every line. |

### Deployment topology

| Component | Host | Why |
|---|---|---|
| 4 provider endpoints | **Cloudflare Workers** (`wrangler`) | Free, always-on, zero cold start, Hono native. Four separate Worker deployments makes "four different payees" visually real to a judge. |
| AXIS router | **Railway** (Node 22 long-running process) | The router needs: no execution timeout (fan-out + LLM latency), persistent SSE connections, and a signing key in a real process. Railway is one `railway up`, free tier, always-on. **Fly.io is an equivalent fallback.** |
| Console | **Vercel** | Next.js zero-config deploy, instant preview URLs. |
| Database | **Neon** | Serverless Postgres, free tier, connection pooling built in. |

> **Explicitly rejected: the router on Vercel serverless functions.** Hobby-tier functions cap execution at ~10 s. The execute phase will exceed that on the first run and fail in front of a judge.

> **Explicitly rejected: the router on Cloudflare Workers.** It would probably work — Workers bills CPU time, not wall time, and the fan-out is nearly all I/O wait. But it puts mnemonic signing, x402 client-SDK compatibility, and persistent SSE all on `workerd` at once. Any single incompatibility costs a night. The providers get Workers because they are trivial and stateless; the router gets Node because it is where the risk lives.

---

## 4. System Architecture

```
                                   ┌──────────────────────────┐
                                   │   CI pipeline / agent    │
                                   │  (the paying customer)   │
                                   └────────────┬─────────────┘
                                                │  1 signature
                                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        AXIS ROUTER  (Node 22 · Hono)                   │
│                                                                        │
│  ┌──────────┐   ┌──────────┐   ┌───────────┐   ┌─────────┐  ┌───────┐  │
│  │  QUOTE   │──▶│  GUARD   │──▶│  COMPOSE  │──▶│ EXECUTE │─▶│RECEIPT│  │
│  │  engine  │   │  policy  │   │  + simul. │   │  + DAG  │  │  agg. │  │
│  └────┬─────┘   └────┬─────┘   └─────┬─────┘   └────┬────┘  └───┬───┘  │
│       │              │               │              │           │      │
│       │         ┌────▼───────────────▼──────────────▼───────────▼────┐ │
│       │         │        Neon Postgres  (Drizzle ORM)                │ │
│       │         │  quotes · runs · legs · spend_events · policies    │ │
│       │         └───────────────────────────────────────────────────┘ │
│       │                                                    │           │
│       │                                              SSE ──┼──▶ console│
└───────┼────────────────────────────────────────────────────┼───────────┘
        │ unpaid probes (402)          paid retries (X-PAYMENT)
        ▼                                                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│           4 × x402 PROVIDER ENDPOINTS  (Cloudflare Workers · Hono)    │
│                                                                       │
│  /diff/explain    /guardrail/check   /commit/roast   /bug/summarize   │
│     $0.03             $0.02             $0.03            $0.05        │
│   PAY_TO_DIFF     PAY_TO_GUARDRAIL   PAY_TO_ROASTER   PAY_TO_BUGSUM   │
│        └──────────── 4 DISTINCT ALGORAND ADDRESSES ────────────┘      │
│                          each calls Claude                            │
└───────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴────────────────┐
                    ▼                                ▼
        ┌───────────────────────┐        ┌────────────────────────┐
        │  x402 FACILITATOR     │        │   ALGORAND TESTNET     │
        │  (GoPlausible)        │───────▶│   USDC ASA · groups    │
        │  verify · feePayer    │        │   ~3s finality         │
        └───────────────────────┘        └────────────────────────┘
```

### Component responsibilities

| Component | Owns | Does NOT own |
|---|---|---|
| `packages/shared` | Zod schemas, TS types, CAIP-2 constants, DAG resolver, money math (integer microUSDC) | Any I/O, any DB access |
| `packages/guard` | Spend policy evaluation, velocity windows, provider trust scoring, kill switch | Signing, chain calls |
| `packages/router` | Quote fan-out, group composition, simulation, settlement, execution, SSE | LLM calls, UI |
| `packages/receipts` | Receipt aggregation from `runs` + `legs`, indexer enrichment | Payment logic |
| `providers/*` | x402 challenge issuance, payment verification, LLM call, result | Anything about groups or DAGs |
| `apps/console` | Visualization only | Any business logic, any key material |

**Money is always `bigint` microUSDC (6 decimals) internally.** Never a JS `number`, never a float. Formatting to `"$0.13"` happens only at the display boundary. This is non-negotiable and enforced by a Zod brand type in `shared`.

---

## 5. The Four-Phase Protocol

AXIS runs a **strict two-phase-commit shaped protocol**. Nothing is paid during discovery.

### Phase 1 — Quote (zero payments)

```
1. Agent POSTs a workflow spec           → AXIS
2. AXIS resolves the DAG (topo sort)     → execution order
3. AXIS fans out UNPAID probes           → all providers, in parallel
4. Providers return 402 challenges       → AXIS
5. AXIS sums cost, signs the quote       → returns quoteId + TTL
```

Every provider states its own price via its own `402`. AXIS does not hardcode prices — it reads them from the challenges. The quote is **signed by the router** so it cannot be tampered with between quote and execute. TTL default **120 seconds**.

**Zero payments have occurred at the end of Phase 1.**

### Phase 2 — Policy gate (pre-signature)

Before anything is composed, the quote passes the **Spend Policy Guard**:

- per-workflow ceiling
- per-provider cap
- rolling velocity limit (calls/hour and spend/hour)
- provider trust threshold
- global kill switch

Fail any check → the workflow is **rejected before a group is even built**. Cost: **zero**. This is the Agent Infrastructure sub-track, folded in as a *mandatory pre-flight step* rather than a bolt-on advisory API.

### Phase 3 — Compose, simulate, sign, settle

```
6.  AXIS builds ONE atomic group          (N payment legs → N distinct payees)
7.  simulateTransactions                  (dry run — catch every failure for free)
8.  Agent signs the group                 ← THE ONLY SIGNATURE
9.  Facilitator verifies + co-signs feePayer
10. Group submitted                       → confirmed in ~3s, or rejected entirely
```

Group size is asserted `<= 15` provider legs before composition (16 total minus the fee-payer slot). Simulation failure aborts before submission. Chain rejection is all-or-nothing by construction.

### Phase 4 — Execute, resolve, receipt

```
11. AXIS retries every provider call WITH its payment proof
12. Results collected; DAG resolved in dependency order
13. Compensation legs issued for any provider that took payment but failed to deliver
14. Unified receipt emitted: groupId → N txids → N results → total → status
```

Final status is one of `SETTLED` · `PARTIAL` · `REVERSED` · `FAILED`.

---

## 6. Folder Structure

```
axis/
├── package.json                      # pnpm workspace root, Turborepo tasks
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json                # strict:true, ESM, shared path aliases
├── .env.example                      # every var, documented, no secrets
├── .github/workflows/ci.yml          # typecheck + lint + test on push
├── README.md                         # pitch, quickstart, judging map
├── ARCHITECTURE.md                   # ← this file
├── BUILD_PLAN.md                     # phases, gates, commands, demo script
│
├── packages/
│   │
│   ├── shared/                       # zero-I/O. Depended on by everything.
│   │   ├── src/
│   │   │   ├── schemas/
│   │   │   │   ├── workflow.ts       # WorkflowSpec, WorkflowStep, StepRef
│   │   │   │   ├── quote.ts          # Quote, QuoteLeg, SignedQuote
│   │   │   │   ├── receipt.ts        # Receipt, ReceiptLeg, RunStatus
│   │   │   │   ├── policy.ts         # SpendPolicy, PolicyVerdict, Violation
│   │   │   │   ├── x402.ts           # Challenge, PaymentPayload, SettleResult
│   │   │   │   └── events.ts         # SSE event union (RunEvent)
│   │   │   ├── dag/
│   │   │   │   ├── resolve.ts        # topological sort + cycle detection
│   │   │   │   ├── interpolate.ts    # ${steps.a.output.field} resolution
│   │   │   │   └── resolve.test.ts
│   │   │   ├── money.ts              # MicroUSDC brand type, parse/format/sum
│   │   │   ├── constants.ts          # CAIP-2 ids, MAX_GROUP_SIZE=16, TTLs
│   │   │   ├── errors.ts             # AxisError taxonomy + error codes
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── guard/                        # spend policy + trust. Pure logic.
│   │   ├── src/
│   │   │   ├── evaluate.ts           # Quote + Policy + SpendHistory → Verdict
│   │   │   ├── velocity.ts           # rolling-window spend & call counters
│   │   │   ├── trust.ts              # provider trust score (static v1)
│   │   │   ├── evaluate.test.ts      # every rule, pass + fail cases
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── router/                       # the engine. Node 22 + Hono.
│   │   ├── src/
│   │   │   ├── index.ts              # server bootstrap, graceful shutdown
│   │   │   ├── app.ts                # Hono app, middleware chain, OpenAPI
│   │   │   ├── routes/
│   │   │   │   ├── quote.ts          # POST /v1/workflow/quote
│   │   │   │   ├── execute.ts        # POST /v1/workflow/execute
│   │   │   │   ├── receipt.ts        # GET  /v1/receipt/:id
│   │   │   │   ├── policy.ts         # GET/PUT /v1/policy
│   │   │   │   ├── events.ts         # GET  /v1/runs/:id/events (SSE)
│   │   │   │   └── health.ts         # GET  /healthz, /readyz
│   │   │   ├── engine/
│   │   │   │   ├── quote.ts          # probe fan-out, price sum, quote signing
│   │   │   │   ├── compose.ts        # atomic group builder (N payees)
│   │   │   │   ├── simulate.ts       # simulateTransactions wrapper + decode
│   │   │   │   ├── settle.ts         # facilitator verify + submit
│   │   │   │   ├── execute.ts        # paid retries, DAG order, timeouts
│   │   │   │   └── compensate.ts     # refund leg for undelivered providers
│   │   │   ├── chain/
│   │   │   │   ├── client.ts         # algod/indexer clients, network config
│   │   │   │   ├── preflight.ts      # ASA opt-in + balance checks
│   │   │   │   └── facilitator.ts    # facilitator HTTP client
│   │   │   ├── db/
│   │   │   │   ├── schema.ts         # Drizzle table definitions
│   │   │   │   ├── client.ts         # pooled connection
│   │   │   │   ├── queries.ts        # typed query helpers
│   │   │   │   └── migrations/       # drizzle-kit output
│   │   │   ├── workflows/
│   │   │   │   └── pr-review.ts      # the demo workflow definition
│   │   │   ├── middleware/
│   │   │   │   ├── requestId.ts      # correlation id per request
│   │   │   │   ├── idempotency.ts    # execute-once guarantee
│   │   │   │   ├── ratelimit.ts      # per-agent request limiter
│   │   │   │   └── errors.ts         # AxisError → HTTP mapper
│   │   │   ├── bus.ts                # in-process event bus → SSE fan-out
│   │   │   └── log.ts                # pino, workflowId-scoped child loggers
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   │
│   └── receipts/                     # receipt aggregation + indexer sync
│       ├── src/
│       │   ├── build.ts              # runs + legs → Receipt
│       │   ├── indexer.ts            # confirm txids, fetch round/timestamp
│       │   └── index.ts
│       └── package.json
│
├── providers/                        # our own x402 endpoints (Workers)
│   ├── _template/                    # shared provider scaffold
│   │   └── src/
│   │       ├── x402.ts               # challenge issue + payment verify
│   │       ├── claude.ts             # Anthropic client wrapper
│   │       └── handler.ts            # generic paid-endpoint handler
│   ├── diff-explainer/               # POST /diff/explain      $0.03
│   │   ├── src/index.ts
│   │   ├── wrangler.toml
│   │   └── package.json
│   ├── guardrail-checker/            # POST /guardrail/check   $0.02
│   ├── commit-roaster/               # POST /commit/roast      $0.03
│   └── bug-summarizer/               # POST /bug/summarize     $0.05
│
├── apps/
│   └── console/                      # Next.js 15 dashboard
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx              # the "Should I merge this PR?" button
│       │   ├── runs/[id]/page.tsx    # live run view
│       │   ├── receipts/[id]/page.tsx
│       │   └── policy/page.tsx       # policy editor
│       ├── components/
│       │   ├── WorkflowGraph.tsx     # DAG viz, per-node status
│       │   ├── ChallengeCard.tsx     # the four 402s
│       │   ├── GroupPanel.tsx        # group id + txids → AlgoExplorer
│       │   ├── ReceiptView.tsx       # unified receipt
│       │   ├── PolicyPanel.tsx       # ceilings + verdict badge
│       │   └── EventLog.tsx          # raw SSE stream, protocol steps 1–8
│       ├── lib/
│       │   ├── api.ts                # typed client (imports shared schemas)
│       │   └── useRunStream.ts       # EventSource hook
│       └── package.json
│
├── scripts/
│   ├── spike-atomic-group.ts         # Phase 0 de-risk script
│   ├── setup-accounts.ts             # generate 4 payees, print addresses
│   ├── optin-usdc.ts                 # opt every payee into USDC ASA
│   ├── fund.ts                       # dispenser helper
│   └── demo.ts                       # headless end-to-end run
│
└── docs/
    ├── PROTOCOL.md                   # wire-level spec of all 4 phases
    ├── DEPLOYMENT.md                 # step-by-step deploy runbook
    └── DEMO.md                       # 3-minute presentation script
```

---

## 7. Data Model

Postgres via Drizzle. All monetary columns are `bigint` **microUSDC**. All timestamps are `timestamptz`.

### `quotes`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `qt_` + nanoid |
| `workflow` | `text` | e.g. `pr-review` |
| `agent_address` | `text` | 58-char Algorand address |
| `inputs` | `jsonb` | original workflow inputs |
| `dag` | `jsonb` | resolved execution order + dependency edges |
| `legs` | `jsonb` | `[{stepId, provider, payTo, priceMicro, challenge}]` |
| `total_micro` | `bigint` | sum of all legs |
| `routing_fee_micro` | `bigint` | AXIS fee for this run |
| `policy_verdict` | `jsonb` | pass/fail + violations |
| `signature` | `text` | router's signature over the canonical quote body |
| `status` | `text` | `OPEN` · `CONSUMED` · `EXPIRED` · `REJECTED` |
| `expires_at` | `timestamptz` | `created_at + QUOTE_TTL_SECONDS` |
| `created_at` | `timestamptz` | |

### `runs`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `run_` + nanoid — this is also the **receipt id** |
| `quote_id` | `text` FK → quotes | |
| `group_id` | `text` | Algorand atomic group id |
| `status` | `text` | `PENDING` · `SETTLED` · `PARTIAL` · `REVERSED` · `FAILED` |
| `total_micro` | `bigint` | settled total |
| `refunded_micro` | `bigint` | sum of compensation legs |
| `confirmed_round` | `bigint` | nullable until confirmed |
| `error` | `jsonb` | nullable; code + message + step |
| `started_at` / `finished_at` | `timestamptz` | |

### `legs`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | |
| `run_id` | `text` FK → runs | |
| `step_id` | `text` | matches the workflow step id |
| `provider` | `text` | `diff-explainer` etc. |
| `pay_to` | `text` | provider payout address |
| `price_micro` | `bigint` | |
| `txid` | `text` | payment txid within the group |
| `status` | `text` | `PAID` · `DELIVERED` · `FAILED` · `COMPENSATED` |
| `attempts` | `int` | retry count |
| `latency_ms` | `int` | provider response time |
| `result` | `jsonb` | provider output, nullable |
| `error` | `jsonb` | nullable |
| `compensation_txid` | `text` | nullable; set on reversal |

### `spend_events` — feeds the velocity limiter

| Column | Type |
|---|---|
| `id` | `text` PK |
| `agent_address` | `text` (indexed with `created_at`) |
| `run_id` | `text` |
| `provider` | `text` |
| `amount_micro` | `bigint` |
| `created_at` | `timestamptz` |

Velocity query: `SELECT coalesce(sum(amount_micro),0), count(*) FROM spend_events WHERE agent_address = $1 AND created_at > now() - interval '1 hour'`.

### `policies`

| Column | Type | Default |
|---|---|---|
| `agent_address` | `text` PK | |
| `max_workflow_micro` | `bigint` | `1_000_000` ($1.00) |
| `max_provider_micro` | `bigint` | `500_000` ($0.50) |
| `max_hourly_spend_micro` | `bigint` | `10_000_000` ($10.00) |
| `max_hourly_calls` | `int` | `100` |
| `min_provider_trust` | `int` | `50` |
| `kill_switch` | `boolean` | `false` |
| `updated_at` | `timestamptz` | |

Missing row → defaults are applied and a row is lazily created.

### `idempotency_keys`

| Column | Type |
|---|---|
| `key` | `text` PK |
| `run_id` | `text` |
| `response` | `jsonb` |
| `created_at` | `timestamptz` |

A repeated `POST /v1/workflow/execute` with the same `Idempotency-Key` returns the stored response instead of double-settling. **This is a correctness requirement, not a nicety** — a retrying CI pipeline must not pay twice.

---

## 8. API Contracts

Base URL: `https://<router-host>`. All bodies JSON. All errors use the shared error envelope.

### Error envelope

```json
{
  "error": {
    "code": "POLICY_VIOLATION",
    "message": "Workflow total $1.40 exceeds per-workflow ceiling $1.00",
    "details": { "limit": "1.00", "actual": "1.40", "rule": "maxWorkflowSpend" },
    "requestId": "req_8fJ2..."
  }
}
```

Error codes: `INVALID_WORKFLOW` · `UNKNOWN_STEP_REF` · `DAG_CYCLE` · `PROVIDER_UNREACHABLE` · `CHALLENGE_INVALID` · `POLICY_VIOLATION` · `KILL_SWITCH_ACTIVE` · `QUOTE_EXPIRED` · `QUOTE_CONSUMED` · `SIGNATURE_INVALID` · `GROUP_TOO_LARGE` · `SIMULATION_FAILED` · `INSUFFICIENT_BALANCE` · `NOT_OPTED_IN` · `SETTLEMENT_FAILED` · `PROVIDER_TIMEOUT` · `RATE_LIMITED` · `INTERNAL`.

---

### `POST /v1/workflow/quote`

**Request**

```json
{
  "workflow": "pr-review",
  "agentAddress": "ABCD...58CHARS",
  "inputs": { "repo": "org/repo", "pr": 42 },
  "constraints": { "maxSpendUSDC": "0.50" }
}
```

**Response 200**

```json
{
  "quoteId": "qt_7fK2mQ",
  "workflow": "pr-review",
  "dag": {
    "order": [["diff", "guardrail", "roast"], ["bugsum"]],
    "edges": [{ "from": "diff", "to": "bugsum" }]
  },
  "legs": [
    { "stepId": "diff",      "provider": "diff-explainer",     "payTo": "AAA...", "priceUSDC": "0.03" },
    { "stepId": "guardrail", "provider": "guardrail-checker",  "payTo": "BBB...", "priceUSDC": "0.02" },
    { "stepId": "roast",     "provider": "commit-roaster",     "payTo": "CCC...", "priceUSDC": "0.03" },
    { "stepId": "bugsum",    "provider": "bug-summarizer",     "payTo": "DDD...", "priceUSDC": "0.05" }
  ],
  "totalUSDC": "0.13",
  "routingFeeUSDC": "0.01",
  "grandTotalUSDC": "0.14",
  "policy": { "verdict": "PASS", "checks": [ /* every rule + headroom */ ] },
  "network": "algorand:testnet",
  "expiresAt": "2026-08-07T12:02:00Z",
  "signature": "base64..."
}
```

`order` is an array of **parallel batches** — everything in `order[0]` runs concurrently, then `order[1]`, and so on.

**No payment occurs. No group is built.**

**Response 402** — policy rejection returns `verdict: "FAIL"` with `violations[]` and HTTP `402` with `code: POLICY_VIOLATION`.

---

### `POST /v1/workflow/execute`

Header: `Idempotency-Key: <client-generated uuid>` (required).

**Request**

```json
{ "quoteId": "qt_7fK2mQ", "signedGroup": "base64-encoded-signed-txns" }
```

**Response 200**

```json
{
  "runId": "run_9xLm3",
  "receiptId": "run_9xLm3",
  "groupId": "b64groupid==",
  "status": "SETTLED",
  "confirmedRound": 48213771,
  "txids": ["TX1...", "TX2...", "TX3...", "TX4..."],
  "results": {
    "diff":      { "summary": "..." },
    "guardrail": { "risk": 0.12, "flags": [] },
    "roast":     { "critique": "...", "rewrites": ["..."] },
    "bugsum":    { "steps": ["..."], "severity": "medium" }
  },
  "verdict": "MERGE_WITH_COMMENTS",
  "totalUSDC": "0.14",
  "durationMs": 11840
}
```

If any provider was paid but failed to deliver, `status` is `PARTIAL`, that leg carries `compensationTxid`, and `refundedUSDC` is populated.

---

### `GET /v1/receipt/:id`

The unified receipt — **the artifact that proves the whole thesis**.

```json
{
  "receiptId": "run_9xLm3",
  "workflow": "pr-review",
  "status": "SETTLED",
  "network": "algorand:testnet",
  "groupId": "b64groupid==",
  "confirmedRound": 48213771,
  "agentAddress": "ABCD...",
  "signatureCount": 1,
  "legs": [
    {
      "stepId": "diff",
      "provider": "diff-explainer",
      "payTo": "AAA...",
      "priceUSDC": "0.03",
      "txid": "TX1...",
      "explorerUrl": "https://testnet.algoexplorer.io/tx/TX1...",
      "status": "DELIVERED",
      "latencyMs": 2140
    }
  ],
  "routingFeeUSDC": "0.01",
  "totalUSDC": "0.14",
  "refundedUSDC": "0.00",
  "compensations": [],
  "createdAt": "2026-08-07T12:00:11Z"
}
```

---

### `GET /v1/policy?agentAddress=...` · `PUT /v1/policy`

Read and update the calling agent's spend policy. `PUT` body is a partial `SpendPolicy`; unspecified fields keep their current value. Setting `killSwitch: true` immediately rejects all subsequent quotes for that agent.

---

### `GET /v1/runs/:id/events` — Server-Sent Events

The live feed the console renders. Every event is `{ type, ts, runId, ...payload }`.

| `type` | Emitted when | Protocol step shown |
|---|---|---|
| `quote.probing` | fan-out started | 1–2 |
| `quote.challenge` | one 402 received (×4) | 3 |
| `quote.ready` | DAG resolved, total computed | 4 |
| `policy.evaluated` | guard verdict | — |
| `group.composed` | N legs assembled | 5 |
| `group.simulated` | dry run passed | 6 |
| `group.signed` | agent signature received | 7 |
| `group.settled` | confirmed on chain | 8 |
| `step.started` / `step.completed` / `step.failed` | per provider execution | — |
| `compensation.issued` | refund leg submitted | — |
| `run.completed` | terminal state reached | — |

---

### `GET /healthz` · `GET /readyz` · `GET /openapi.json`

`healthz` = process alive. `readyz` = DB reachable + algod reachable + facilitator reachable. `openapi.json` is generated from the Zod schemas.

---

## 9. Provider Contract

Every provider is an independent Cloudflare Worker on its **own Algorand address**, so the atomic group genuinely spans multiple payees rather than paying ourselves four times.

| Endpoint | Price | Returns |
|---|---|---|
| `POST /diff/explain` | $0.03 | Plain-language explanation of a git diff |
| `POST /guardrail/check` | $0.02 | Prompt-injection / jailbreak / policy risk score |
| `POST /commit/roast` | $0.03 | Commit message critique + rewritten alternatives |
| `POST /bug/summarize` | $0.05 | Noisy bug report → reproducible steps + severity |

All settle in **USDC ASA on Algorand Testnet**.

### Unpaid request → `402`

```http
POST /diff/explain
Content-Type: application/json

{ "diff": "..." }
```

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "algorand:testnet",
    "maxAmountRequired": "30000",
    "asset": "<USDC_ASA_ID>",
    "payTo": "AAA...58CHARS",
    "resource": "https://diff.axis.workers.dev/diff/explain",
    "description": "Plain-language explanation of a git diff",
    "mimeType": "application/json",
    "maxTimeoutSeconds": 60
  }]
}
```

### Paid request → `200`

```http
POST /diff/explain
X-PAYMENT: <base64 payment payload>

{ "diff": "..." }
```

The provider verifies the payment proof against the facilitator, then calls Claude, then returns `200` with the result and an `X-PAYMENT-RESPONSE` header carrying the settlement reference.

**Provider invariants:**

- Price is stated **only** in the challenge. The router never hardcodes it.
- Payment verification happens **before** the LLM call — never burn tokens on an unpaid request.
- A verified-but-failed LLM call returns `502` with `code: PROVIDER_EXECUTION_FAILED`. This is what triggers compensation.
- Every provider exposes `GET /health` returning its `payTo` address and price, so `readyz` and the console can self-describe.

---

## 10. LLM Integration

All four providers call Claude through the official SDK: `@anthropic-ai/sdk`.

**Model: `claude-opus-5`.** These are short generate/classify tasks and Opus 5 handles them at low effort with high quality and strong instruction-following, which matters because two of the four endpoints return structured JSON.

**Standard call shape:**

```ts
const response = await client.messages.create({
  model: "claude-opus-5",
  max_tokens: 2048,
  output_config: { effort: "low" },
  system: PROVIDER_SYSTEM_PROMPT,
  messages: [{ role: "user", content: userPayload }],
});
```

**Parameter reasoning — read this before changing anything:**

- **`effort: "low"`** — these are scoped, latency-sensitive tasks. Low effort keeps the demo fast and the cost near zero. Effort lives inside `output_config`, not at the top level.
- **Thinking is left ON (default).** On `claude-opus-5` thinking is on unless you disable it, and disabling it has two documented failure modes: leaked `<thinking>` tags in the visible response, and (in tool-using contexts) tool calls emitted as plain text. Lowering `effort` gets you the latency and cost win without either risk. **Do not add `thinking: { type: "disabled" }`.**
- **`max_tokens: 2048`** — `max_tokens` caps thinking *plus* response text together. 2048 leaves headroom so a response never truncates mid-sentence in front of a judge. Do not lowball it.
- **No sampling parameters.** `temperature`, `top_p`, and `top_k` are removed on `claude-opus-5` and return a 400. Steer with the system prompt.
- **No assistant prefill.** Prefilling the final assistant turn returns a 400. Use structured outputs instead.

**Structured output where the shape matters** — `guardrail/check` and `bug/summarize` return JSON, so they use schema-constrained output rather than prompt-and-pray:

```ts
output_config: {
  effort: "low",
  format: {
    type: "json_schema",
    schema: {
      type: "object",
      properties: {
        risk: { type: "number" },
        flags: { type: "array", items: { type: "string" } },
      },
      required: ["risk", "flags"],
      additionalProperties: false,
    },
  },
}
```

**Cost control:** each provider caps input length (truncate-with-notice, never silent truncation) and returns `400` on oversized payloads rather than burning tokens.

**Latency budget:** every provider must respond inside `maxTimeoutSeconds` (60). Measured p50 target: under 4 s.

---

## 11. Spend Policy Guard

Pure logic. No chain calls, no I/O beyond a single velocity query. Runs **between quote and compose**, and a `FAIL` verdict means nothing is ever signed.

### The five rules

| Rule | Check | Error on violation |
|---|---|---|
| **Kill switch** | `policy.killSwitch === false` | `KILL_SWITCH_ACTIVE` |
| **Per-workflow ceiling** | `quote.grandTotal <= policy.maxWorkflowMicro` | `POLICY_VIOLATION` / `maxWorkflowSpend` |
| **Per-provider cap** | every `leg.priceMicro <= policy.maxProviderMicro` | `POLICY_VIOLATION` / `maxProviderSpend` |
| **Velocity — spend** | `spentLastHour + quote.grandTotal <= policy.maxHourlySpendMicro` | `POLICY_VIOLATION` / `hourlySpendLimit` |
| **Velocity — calls** | `callsLastHour + quote.legs.length <= policy.maxHourlyCalls` | `POLICY_VIOLATION` / `hourlyCallLimit` |
| **Provider trust** | every `leg.provider.trustScore >= policy.minProviderTrust` | `POLICY_VIOLATION` / `providerTrust` |

The client's own `constraints.maxSpendUSDC` is applied as an **additional, tighter** ceiling — it can never loosen the stored policy.

### Verdict shape

```json
{
  "verdict": "PASS",
  "checks": [
    { "rule": "killSwitch",       "passed": true },
    { "rule": "maxWorkflowSpend", "passed": true, "limitUSDC": "1.00", "actualUSDC": "0.14", "headroomUSDC": "0.86" },
    { "rule": "hourlySpendLimit", "passed": true, "limitUSDC": "10.00", "actualUSDC": "0.42", "headroomUSDC": "9.58" }
  ],
  "violations": []
}
```

Every check is returned whether it passed or not — the console renders the headroom bars, which makes the policy layer **visible** to a judge rather than invisible plumbing.

### Trust scoring (v1)

`trustScore` is a static 0–100 value per provider in config for v1. The interface is designed so v2 can compute it from live indexer signals (settlement count, failure rate, refund history) **without changing any caller**. That upgrade is listed under future work — it is not built now.

---

## 12. DAG Resolver

Lives in `packages/shared/src/dag/`. Pure functions, fully unit tested, zero I/O.

### Workflow spec shape

```ts
{
  id: "pr-review",
  steps: [
    { id: "diff",      provider: "diff-explainer",    input: { diff: "${inputs.diff}" } },
    { id: "guardrail", provider: "guardrail-checker", input: { text: "${inputs.diff}" } },
    { id: "roast",     provider: "commit-roaster",    input: { message: "${inputs.commitMessage}" } },
    { id: "bugsum",    provider: "bug-summarizer",    input: { report: "${steps.diff.output.summary}" } }
  ]
}
```

### Resolution algorithm

1. **Parse references.** Scan every `input` value for `${steps.<id>.output.<path>}` and `${inputs.<path>}` tokens. Build the edge set from step references.
2. **Validate.** Every referenced step id must exist → else `UNKNOWN_STEP_REF`. Every `${inputs.x}` must be present in the request → else `INVALID_WORKFLOW`.
3. **Cycle detect.** Depth-first search with a colour marker. Any back-edge → `DAG_CYCLE` with the cycle path in `details`.
4. **Topological sort into levels.** Kahn's algorithm, but emit **batches**: every step with in-degree 0 forms `level[n]`, all of which execute **in parallel**. This is what makes the demo fast — three of the four steps run concurrently.
5. **Assert size.** `steps.length <= MAX_GROUP_SIZE (16)` → else `GROUP_TOO_LARGE`.

For `pr-review`: level 0 = `[diff, guardrail, roast]` (parallel), level 1 = `[bugsum]` (depends on `diff`).

### Interpolation

At execute time, `interpolate(template, { inputs, stepOutputs })` walks the resolved levels and substitutes tokens with actual values. Missing values at execute time are a hard error, never a silent `undefined` — a step must never be paid for and then handed garbage input.

---

## 13. Failure Modes and Handling

Every one of these is implemented. None is a stub.

| # | Failure | Detected where | Handling | Cost to agent |
|---|---|---|---|---|
| 1 | Invalid workflow spec / unknown step ref / cycle | Quote, DAG resolve | `400` before any network call | **$0** |
| 2 | Provider unreachable during probe | Quote, fan-out | `PROVIDER_UNREACHABLE`; quote fails whole | **$0** |
| 3 | Malformed 402 challenge | Quote | `CHALLENGE_INVALID`; quote fails | **$0** |
| 4 | Policy violation | Guard | `402` with violation detail; **no group built** | **$0** |
| 5 | Kill switch active | Guard | `403 KILL_SWITCH_ACTIVE` | **$0** |
| 6 | Quote expired | Execute | TTL enforced; `QUOTE_EXPIRED`; re-quote required | **$0** |
| 7 | Quote replayed | Execute | `status != OPEN` → `QUOTE_CONSUMED` | **$0** |
| 8 | Quote tampered | Execute | Router signature verify fails → `SIGNATURE_INVALID` | **$0** |
| 9 | Group > 15 provider legs (16 incl. fee payer) | Compose | `GROUP_TOO_LARGE`; asserted before build | **$0** |
| 10 | Payee not opted into USDC ASA | Pre-flight | `NOT_OPTED_IN` with the offending address | **$0** |
| 11 | Agent balance insufficient | Pre-flight / simulation | `INSUFFICIENT_BALANCE` | **$0** |
| 12 | **Simulation fails** | `simulateTransactions` | Group **never submitted**; decoded failure surfaced | **$0** |
| 13 | Group rejected on chain | Settle | Native all-or-nothing — no leg lands | **$0** |
| 14 | Facilitator unreachable | Settle | Retry with backoff, then `SETTLEMENT_FAILED`; nothing submitted | **$0** |
| 15 | Duplicate execute (CI retry) | Idempotency middleware | Stored response replayed; **no second settlement** | **$0** extra |
| 16 | **Provider 500s post-settlement** | Execute | **Compensation leg**: that provider's portion is reversed on chain, run marked `PARTIAL`, refund txid recorded on the receipt | Only the delivered legs |
| 17 | Provider times out | Execute | Retry with exponential backoff inside `maxTimeoutSeconds`, then → case 16 | Only the delivered legs |
| 18 | Downstream step's dependency failed | Execute | Step skipped, marked `SKIPPED`, its leg compensated | Only the delivered legs |
| 19 | Router crashes mid-run | Restart | Run row is `PENDING`; a reconciliation pass on boot queries the chain by group id and finalises the receipt | — |

**The principle:** every failure before signature costs exactly zero, and every failure after settlement is either compensated or explicitly recorded on the receipt. There is no state where money left the agent and nothing is written down.

---

## 14. Feature Scope — In / Out

### Core — must work properly, not partially

- [x] Four independent x402 provider endpoints, four distinct payout addresses, real 402 challenges
- [x] Real LLM work behind every endpoint (no mocks, no canned responses)
- [x] Quote phase with unpaid probe fan-out and price discovery from challenges
- [x] DAG resolution with cycle detection and parallel batch execution
- [x] Signed, TTL-bounded quotes
- [x] Spend Policy Guard as a mandatory pre-signature gate (all 6 rules)
- [x] Single atomic transaction group across N distinct payees
- [x] `simulateTransactions` as a hard pre-submission gate
- [x] One agent signature per workflow
- [x] Facilitator settlement with `feePayer` fee abstraction
- [x] Paid retry execution in DAG order
- [x] Compensation leg for paid-but-undelivered providers → `PARTIAL`
- [x] Unified receipt: group id → N txids → N results → cost → status
- [x] Idempotent execute (double-spend impossible on CI retry)
- [x] Live SSE event stream exposing all 8 protocol steps
- [x] Console: one button → four 402s → one group → four explorer links → one receipt
- [x] Pre-flight ASA opt-in and balance checks
- [x] Crash-recovery reconciliation on boot
- [x] Generated OpenAPI spec
- [x] Health and readiness endpoints
- [x] Structured logging correlated by `runId`

### Important supporting features (in scope — they are what makes it "proper")

- Per-agent rate limiting on the router
- Retry with exponential backoff and jitter on every outbound call
- Request-id correlation from HTTP header through logs to SSE events
- Integer-only money arithmetic with a branded type (no float bugs)
- Provider `GET /health` self-description (address + price) driving `readyz`
- Policy editor in the console with live headroom bars
- Headless `scripts/demo.ts` so the demo can run without a browser if the projector dies

### Explicitly out of scope — do not build until core is green

- Provider trust scoring from live indexer signals (interface exists, static values for now)
- Bazaar / discovery extension for dynamic provider registration
- Cross-chain routing (Base, Solana) via the same facilitator
- Delegated allowances for unattended standing budgets
- Group sharding beyond 16 txns — **documented design + hard assertion only, no implementation**
- Multi-tenant agent authentication
- Receipt export / accounting integrations
- Provider marketplace UI

> On sharding specifically: the README claims it under Mainnet Readiness. Keep the claim, ship the `<= 16` assertion and the written design. **Claiming a stub is worse than claiming a plan.**

---

## 15. Security Model

| Concern | Control |
|---|---|
| **Agent mnemonic** | Lives only in the router process environment. Never in the console, never in a Worker, never logged, never in a response. |
| **Anthropic API key** | Lives only in Worker secrets (`wrangler secret put`). The router never sees it. |
| **Quote tampering** | Quotes are signed by the router over a canonical serialization; execute verifies before composing. |
| **Quote replay** | Single-use — `status` transitions `OPEN → CONSUMED` atomically on execute. |
| **Double settlement** | `Idempotency-Key` required on execute; stored response replayed on repeat. |
| **Unpaid LLM usage** | Payment verified **before** the model call in every provider. |
| **Prompt injection into providers** | `guardrail-checker` exists partly for this; all provider inputs are length-capped and schema-validated. |
| **Runaway spend** | Spend Policy Guard runs before every signature; kill switch is immediate. |
| **Secrets in logs** | Pino redaction list covers `mnemonic`, `authorization`, `x-payment`, `apiKey`. |
| **CORS** | Router allows only the console origin; providers allow the router origin. |

---

## 16. Observability

- **Structured JSON logs** everywhere. Every line carries `requestId` and, once known, `runId`.
- **Log the protocol.** Each of the 8 x402 steps emits exactly one log line with a stable `step` field — so the log itself is a demo artifact.
- **Timings.** `quote.durationMs`, `simulate.durationMs`, `settle.durationMs`, per-leg `latencyMs`, and total `run.durationMs` are all recorded and surfaced on the receipt.
- **The SSE stream is the observability surface for the demo.** The console `EventLog` component renders the raw event feed alongside the pretty view, so a judge can see the protocol executing, not just its result.

---

## 17. Environment Configuration

`.env.example` — committed, documented, no secrets.

```env
# ── Network ─────────────────────────────────────────────
# CAIP-2 is the genesis-hash form, NOT the string "algorand:testnet".
# Prefer importing ALGORAND_TESTNET_CAIP2 from @x402/avm over hardcoding.
NETWORK=algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe
ALGOD_URL=https://testnet-api.algonode.cloud
INDEXER_URL=https://testnet-idx.algonode.cloud
USDC_ASA_ID=10458941                     # testnet; mainnet is 31566704 (USDC_TESTNET_ASA_ID / USDC_MAINNET_ASA_ID)

# ── Facilitator ─────────────────────────────────────────
FACILITATOR_URL=https://facilitator.goplausible.xyz

# ── Provider payout addresses (58 chars each, all distinct) ──
PAY_TO_DIFF=
PAY_TO_GUARDRAIL=
PAY_TO_ROASTER=
PAY_TO_BUGSUM=

# ── Provider endpoint URLs ──────────────────────────────
PROVIDER_DIFF_URL=https://diff.axis.workers.dev
PROVIDER_GUARDRAIL_URL=https://guardrail.axis.workers.dev
PROVIDER_ROASTER_URL=https://roaster.axis.workers.dev
PROVIDER_BUGSUM_URL=https://bugsum.axis.workers.dev

# ── Router agent wallet (ROUTER ONLY — never ship elsewhere) ──
AGENT_MNEMONIC=
QUOTE_SIGNING_KEY=                       # separate key for signing quotes

# ── Persistence ─────────────────────────────────────────
DATABASE_URL=postgresql://...neon.tech/axis?sslmode=require

# ── Policy defaults (microUSDC) ─────────────────────────
MAX_WORKFLOW_SPEND_MICRO=1000000         # $1.00
MAX_PROVIDER_SPEND_MICRO=500000          # $0.50
MAX_HOURLY_SPEND_MICRO=10000000          # $10.00
MAX_HOURLY_CALLS=100
MIN_PROVIDER_TRUST=50
KILL_SWITCH=false

# ── Protocol tuning ─────────────────────────────────────
QUOTE_TTL_SECONDS=120
PROVIDER_TIMEOUT_MS=60000
PROVIDER_MAX_RETRIES=2
ROUTING_FEE_MICRO=10000                  # $0.01 per run

# ── Worker secrets (set via `wrangler secret put`, not here) ──
# ANTHROPIC_API_KEY
```

Config is validated at boot by a Zod schema. **A missing or malformed variable crashes the process on startup with a readable message** — never a mysterious `undefined` three layers deep at demo time.

---

## 18. Mainnet Readiness

- **Network selection is one CAIP-2 constant.** Testnet → mainnet is a config change, nothing else. `NETWORK`, `ALGOD_URL`, `INDEXER_URL`, and `USDC_ASA_ID` are the only things that move.
- **The facilitator supports mainnet Algorand today.**
- **Group size is capped at 16 by the facilitator, and one slot is the fee payer — so the router asserts `legs.length <= 15`.** Larger workflows shard into sequential atomic batches under a shared workflow id — designed and documented, not implemented (see §14).
- **Policy engine and receipt store are stateless-friendly** — all state is in Postgres, so the router scales horizontally behind a load balancer with no session affinity.
- **Idempotency keys make the whole execute path safe to retry** from any client, which is a prerequisite for production CI integration.

---

## 19. Judging Criteria Mapping

| Weight | Criterion | Where AXIS delivers |
|---|---|---|
| **30%** | x402 Protocol Flow | Full `402 → sign → retry → settle → receipt` executed **N times per workflow**, plus a distinct quote phase that reads challenges without paying. All 8 brief steps are individually visible as SSE events in the console. |
| **25%** | Real Pay-Per-Call Model | Paying user is the CI pipeline. Per-workflow-run pricing, no subscription, no seats, no signup. 200 PRs/month = $26; a quiet month = $0. AXIS takes a routing fee per run. |
| **20%** | Technical Execution & Algorand | Clean `@x402/*` integration (official SDKs, no hand-rolled protocol). USDC ASA settlement on Algorand. **Every transaction ID is in the response** — explicitly required by the brief, and we return N of them plus the group id. Native atomic groups across **multiple distinct payees**, `feePayer` fee abstraction, `simulateTransactions` pre-flight. |
| **15%** | Innovation & Utility | Multi-endpoint atomicity, unified receipts, pre-signature spend policy, **and compensation for paid-but-undelivered work** — the missing primitives between "x402 works" and "agents can actually use it." |
| **10%** | Documentation & Deployment | Live testnet endpoints, generated OpenAPI, `README.md`, `ARCHITECTURE.md`, `BUILD_PLAN.md`, `PROTOCOL.md`, `DEPLOYMENT.md`, mainnet-ready config behind a single constant. |

---

## 20. Differentiation Strategy — How We Get to #1

The goal is not "a working submission." The goal is **the top submission**. That requires knowing what everyone else will build and deliberately not building it.

### What the field will look like

The sub-track brief lists four bullets. The first one is:

> *Multi-Step Research Agent (Coordinate multiple paid services to generate comprehensive research reports)*

**Most teams will build exactly that**, because it is listed first and it is the obvious read. Expect a large cluster of "AI research agent that queries 3 paid search/summarize endpoints and writes a report." Those submissions will be near-identical to each other, and a judge scoring the tenth one will be numb to it.

The other three bullets are the *infrastructure* bullets:

> - Atomic multi-endpoint micropayment routing and settlement
> - Unified transaction-linked receipt aggregation
> - Scalable pay-per-workflow execution for complex multi-agent pipelines

**AXIS builds those three.** We are not a research agent that happens to pay for things — we are the settlement layer that any multi-step agent plugs into. That framing alone separates us from the cluster.

### The five things that make us hard to beat

| # | Differentiator | Why almost nobody else will have it |
|---|---|---|
| 1 | **Compensation legs for paid-but-undelivered work** | Everyone stops at "the atomic group committed." Payment atomicity is not execution atomicity. A provider can take the money and then 500 — we reverse that leg on chain, mark the run `PARTIAL`, and put the refund txid on the receipt. This is the single hardest thing in the build and the single most memorable thing in the demo. |
| 2 | **A distinct quote phase that reads prices without paying** | The obvious implementation pays and then discovers cost. We fan out unpaid probes, read each provider's own `402` challenge, and return a signed, TTL-bounded quote. Zero payments during discovery. It also proves we understood the protocol rather than just calling a helper. |
| 3 | **`simulateTransactions` as a hard pre-submission gate** | An Algorand-native capability most teams won't touch. It makes every group failure free, and it is a 15-second demo moment: break a leg on purpose, watch it fail *before* money moves. |
| 4 | **The spend guard folded in as a mandatory gate, not a bolted-on endpoint** | "Agent spend guard" is one of the 20 example use cases — most teams that build it will ship it as *another paid endpoint*. We make it an architectural layer that runs before every signature. Same feature, categorically better framing: we composed two sub-tracks instead of picking one. |
| 5 | **A paying customer that is not a human** | The CI pipeline pays. 200 PRs/month = $26; a quiet month = $0. No seats, no signup, no API key provisioning. That is a *real* pay-per-call model, and it directly answers the 25% criterion better than "a user buys research credits." |

### Use-case choice, and why it's deliberate

The brief's 20 examples include **commit roaster** and **bug summarizer** — we use both, plus a diff explainer and a guardrail checker.

This is intentional on three levels:

1. **They are from the official list**, so a judge recognises them immediately — no time wasted explaining what the endpoints do.
2. **They compose into one coherent question** — *"Should I merge this PR?"* — instead of four unrelated services glued together. The DAG is real: `bugsum` genuinely consumes `diff`'s output.
3. **They are cheap and fast**, so the demo completes in under 20 seconds live.

We are not doing a research agent. Everyone is doing a research agent.

### The one-sentence pitch

> **"Everyone else built an agent that pays. We built the thing that lets any agent pay for ten services at once, atomically, with one signature and one receipt — and get its money back when a provider takes payment and fails to deliver."**

### Ordering: base first, features after

**Nothing in this section changes the build order.** The differentiators above are all *inside* Phases 4–6 of `BUILD_PLAN.md` — they are the core, not additions. Extra features (trust scoring from live indexer signals, Bazaar discovery, cross-chain routing, delegated allowances) come **only after Phase 5 is green**, per §14. A half-built differentiator scores worse than a missing one.

### Open items

- **Team GitHub usernames** — pending from Dushyant, to be collected and added as repo collaborators. Branches `sarthak`, `saquib`, `aarjav`, `main` already exist.
- **Mainnet deployment** — the brief says mainnet is *encouraged*. It is a four-variable config change (§18). If Phase 9 finishes with time to spare, do it — it is free differentiation on the 10% Documentation & Deployment criterion.
