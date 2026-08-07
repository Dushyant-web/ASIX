# AXIS — Build Plan, Workflow & Phases

**Companion to `ARCHITECTURE.md`.** That file is the *what* and *why*. This file is the *how* and *when*: the build order, the exact work in every phase, the acceptance gate that must pass before moving on, the commands, the deployment runbook, and the demo script.

> **The one rule that governs this entire plan:**
> **Nothing from "Future Features" enters the repo until Phase 5 is green.**
> Working properly beats working broadly. A judge cannot score a half-built feature, but they will absolutely notice a broken one.

---

## Table of Contents

1. [Working Agreement](#1-working-agreement)
2. [Phase Overview & Critical Path](#2-phase-overview--critical-path)
3. [Phase 0 — De-risk the Gamble](#phase-0--de-risk-the-gamble)
4. [Phase 1 — Foundation & Contracts](#phase-1--foundation--contracts)
5. [Phase 2 — One Real Paid Endpoint, Then Four](#phase-2--one-real-paid-endpoint-then-four)
6. [Phase 3 — Quote Engine](#phase-3--quote-engine)
7. [Phase 4 — Compose, Simulate, Settle](#phase-4--compose-simulate-settle)
8. [Phase 5 — Execute, Compensate, Receipt](#phase-5--execute-compensate-receipt)
9. [Phase 6 — Spend Policy Guard](#phase-6--spend-policy-guard)
10. [Phase 7 — Console](#phase-7--console)
11. [Phase 8 — Hardening](#phase-8--hardening)
12. [Phase 9 — Deploy, Document, Rehearse](#phase-9--deploy-document-rehearse)
13. [Daily Development Workflow](#13-daily-development-workflow)
14. [Command Reference](#14-command-reference)
15. [Deployment Runbook](#15-deployment-runbook)
16. [Demo Script](#16-demo-script)
17. [Risk Register](#17-risk-register)
18. [Cut List — What Dies If Time Runs Out](#18-cut-list--what-dies-if-time-runs-out)

---

## 1. Working Agreement

### Rules

1. **Each phase has a Definition of Done (DoD).** You do not start phase N+1 until phase N's DoD passes. No exceptions, no "I'll come back to it."
2. **Every phase ends with a commit that runs.** `pnpm build && pnpm test` must pass before the commit. A broken `main` at 2am is how hackathons die.
3. **No mocks in the money path.** Providers call the real Claude API. The router builds real Algorand groups. The only mock permitted is in unit tests.
4. **Money is `bigint` microUSDC, always.** Never a `number`. Never a float. Enforced by the branded type in `packages/shared/src/money.ts`.
5. **Config crashes at boot.** Missing or malformed env → readable error on startup, never `undefined` three layers deep during the demo.
6. **Log the protocol.** Each of the 8 x402 steps emits exactly one structured log line. The log is a demo artifact.
7. **Write the test when the bug is found.** DAG resolver and policy guard are pure logic — they get real unit tests, because they are the two places a silent wrong answer is possible.

### Definition of "working properly, not partial"

A feature is done when **all** of these hold:

- The happy path works end to end against real testnet and real Claude.
- Every failure mode listed for it in `ARCHITECTURE.md` §13 is handled and produces a typed error, not a stack trace.
- It is visible — either in the SSE stream, the receipt, or the console.
- It survives a router restart.
- Its DoD command exits 0.

---

## 2. Phase Overview & Critical Path

```
P0  De-risk ..................... the whole gamble; do this FIRST
 │
P1  Foundation & contracts ...... monorepo, schemas, DAG, DB
 │
P2  Providers (1 → 4) ........... real 402 + real Claude
 │
P3  Quote engine ................ fan-out, price discovery, signed quote     ← no money yet
 │
P4  Compose · simulate · settle . THE CORE CLAIM                             ← money moves
 │
P5  Execute · compensate · receipt  the artifact that proves the thesis
 │
 ├─ P6  Spend Policy Guard ....... sub-track; cheap once P3 exists
 ├─ P7  Console .................. what the judge actually looks at
 │
P8  Hardening ................... idempotency, retries, recovery, rate limit
 │
P9  Deploy · document · rehearse
```

**The critical path is P0 → P1 → P2 → P3 → P4 → P5.** Everything else can slip. If P4 does not work, there is no submission — which is exactly why P0 exists.

**P6 and P7 are parallelisable** once P5 is green. If two people are building: one takes the guard + hardening, the other takes the console.

### Phase priority tiers

| Tier | Phases | If you run out of time |
|---|---|---|
| **Non-negotiable** | P0, P1, P2, P3, P4, P5 | Without these there is no submission |
| **Score-critical** | P6, P7 | 35% of the score lives here (Innovation + Documentation + how the flow is *seen*) |
| **Polish** | P8, P9 | Ship what you can; see §18 Cut List |

---

## Phase 0 — De-risk the Gamble

> **Time-box: one session. Do this before writing a single line of AXIS.**
> The entire architecture rests on one assumption: that the official x402 SDKs (`@x402/avm`, `@x402/fetch`) can build and submit a **multi-payee** atomic group on Algorand testnet from Node. If that assumption is wrong, you need to know **tonight**, not on submission day.

### Work

1. **Create four testnet accounts** — one router agent + four provider payees. Save mnemonics to a local, gitignored file.
   ```
   scripts/setup-accounts.ts   → prints 5 addresses + mnemonics
   ```
2. **Fund the agent** from the [testnet dispenser](https://lora.algokit.io/testnet/fund) with ALGO and test USDC.
3. **Opt every payee into the USDC ASA.** This is the #1 silent failure — a payment to a non-opted-in address fails the whole group.
   ```
   scripts/optin-usdc.ts
   ```
4. **Write `scripts/spike-atomic-group.ts`** — a single throwaway file that does *only* this:
   - connects to algod on testnet
   - builds a **2-transaction atomic group**, USDC ASA transfers, to **two different addresses**
   - runs `simulateTransactions` and prints the decoded result
   - signs and submits
   - waits for confirmation and prints the group id, both txids, and the confirmed round
5. **Verify `wrangler dev` can import the chain SDK.** A trivial Worker that imports `@algorandfoundation/algokit-utils` and returns its version. This confirms the providers' runtime is viable.
6. **Resolve the package names — this is a real open question.** The track brief names four packages: client `@x402/fetch` + `@x402/avm`, server `@x402/hono` + `@x402/core/server`. Some GoPlausible AVM builds have published under the hyphenated `@x402-avm/*` scope instead. **Try the brief's names first** (`npm view @x402/avm`, `npm view @x402/hono`); if they 404, fall back to `@x402-avm/*` and confirm on the track Discord. Write whichever is real into `docs/PROTOCOL.md` with exact versions, and pin them in `package.json`. Nothing downstream can start until this is settled.

### Definition of Done

- [ ] `pnpm tsx scripts/spike-atomic-group.ts` prints a real group id and **two** txids from **two different payees**
- [ ] Both txids are clickable and confirmed on AlgoExplorer testnet
- [ ] `simulateTransactions` output is decoded and printed, and deliberately breaking one leg (wrong amount) makes simulation fail **before** submission
- [ ] `wrangler dev` serves a Worker that imported the chain SDK without a bundling error
- [ ] The **real** x402 package names and exact versions are confirmed, written into `docs/PROTOCOL.md`, and pinned in `package.json`

> **If the spike does not pass, stop and re-plan.** Do not proceed and hope. Everything downstream assumes this works.

---

## Phase 1 — Foundation & Contracts

Build the skeleton and the shared vocabulary. Nothing here touches the network.

### Work

**1.1 Monorepo scaffold**
- `pnpm init`, `pnpm-workspace.yaml` covering `packages/*`, `providers/*`, `apps/*`
- `turbo.json` with `build`, `dev`, `test`, `typecheck`, `lint` pipelines
- `tsconfig.base.json` — `strict: true`, `module: ESNext`, `moduleResolution: bundler`, path aliases
- ESLint + Prettier, one config at root
- `.gitignore` covering `node_modules`, `.env*`, `dist`, `.turbo`, `.wrangler`, `*.mnemonic`

**1.2 `packages/shared` — the contracts**
- Every Zod schema from `ARCHITECTURE.md` §7–§9: `WorkflowSpec`, `Quote`, `SignedQuote`, `Receipt`, `SpendPolicy`, `PolicyVerdict`, `Challenge`, `PaymentPayload`, `RunEvent`
- `money.ts` — branded `MicroUSDC` type, `parseUSDC("0.13") → 130000n`, `formatUSDC(130000n) → "0.13"`, `sumMicro()`. **All integer arithmetic.**
- `constants.ts` — CAIP-2 network ids, `MAX_GROUP_SIZE = 16`, default TTLs
- `errors.ts` — `AxisError` class with the full code taxonomy from §8

**1.3 DAG resolver** (`packages/shared/src/dag/`)
- `resolve(spec, inputs)` → parallel batches, per §12
- Reference parsing for `${inputs.x}` and `${steps.a.output.b}`
- Cycle detection with the cycle path in the error
- `interpolate(template, ctx)` for execute-time substitution
- **Real unit tests**: linear chain, diamond, full parallel, cycle, unknown ref, missing input, 17 steps → `GROUP_TOO_LARGE`

**1.4 Database**
- Drizzle schema for all six tables from §7
- `drizzle-kit generate` + `migrate`, pointed at Neon
- Typed query helpers in `db/queries.ts`

**1.5 Config validation**
- Zod schema over `process.env`, parsed once at boot, exported as a typed frozen object

### Definition of Done

- [ ] `pnpm build` succeeds across every workspace
- [ ] `pnpm test` green — DAG resolver has ≥10 passing cases including all 4 failure cases
- [ ] `pnpm typecheck` clean with `strict: true`, zero `any`
- [ ] `drizzle-kit migrate` applies all tables to Neon; `\dt` shows six tables
- [ ] Deleting a required env var crashes the router at boot with a message naming the variable

---

## Phase 2 — One Real Paid Endpoint, Then Four

Prove one complete x402 round trip before building anything that composes them.

### Work

**2.1 `providers/_template`** — the shared scaffold
- `x402.ts` — issue the 402 challenge from config; verify an `X-PAYMENT` header against the facilitator
- `claude.ts` — Anthropic client wrapper. Model `claude-opus-5`, `max_tokens: 2048`, `output_config: { effort: "low" }`. **No `temperature`/`top_p`/`top_k` (400s on Opus 5). No `thinking: disabled`. No assistant prefill.**
- `handler.ts` — generic paid-endpoint pipeline: validate input → verify payment → call Claude → return result
- Input length caps returning `400`, never silent truncation

**2.2 `providers/diff-explainer` — the first real one**
- `POST /diff/explain`, price `$0.03`, payTo `PAY_TO_DIFF`
- `GET /health` returning `{ provider, payTo, priceUSDC, model }`
- Deploy to Workers, `wrangler secret put ANTHROPIC_API_KEY`

**2.3 Prove the round trip**
```bash
# 1) unpaid → 402 with a well-formed challenge
curl -i -X POST $PROVIDER_DIFF_URL/diff/explain -d '{"diff":"..."}'

# 2) paid → 200 with real LLM output
curl -i -X POST $PROVIDER_DIFF_URL/diff/explain \
     -H "X-PAYMENT: <payload>" -d '{"diff":"..."}'
```

**2.4 Clone to three more** — `guardrail-checker` ($0.02), `commit-roaster` ($0.03), `bug-summarizer` ($0.05). Different prompts, different payout addresses, different schemas. `guardrail-checker` and `bug-summarizer` use **structured outputs** (`output_config.format` with a `json_schema`) because their responses must parse.

### Definition of Done

- [ ] All four deployed to Cloudflare Workers with live public URLs
- [ ] All four `GET /health` return their **distinct** payout address — verified all four differ
- [ ] All four return a valid, schema-conforming 402 when unpaid
- [ ] All four return real Claude output when paid — no mocks, no canned strings
- [ ] Payment is verified **before** the model call (confirmed by logging: an invalid payment produces zero token usage)
- [ ] `guardrail-checker` and `bug-summarizer` responses parse against their Zod schemas 10/10 times
- [ ] p50 latency per provider under 4 s

---

## Phase 3 — Quote Engine

Price discovery with **zero payments**. This whole phase is testable without money.

### Work

- `POST /v1/workflow/quote` route with Zod-validated request
- `workflows/pr-review.ts` — the demo workflow definition (4 steps, `bugsum` depends on `diff`)
- Fan-out **unpaid** probes to all providers **in parallel** (`Promise.allSettled`), 5 s probe timeout
- Parse each 402 challenge, validate against the `Challenge` schema, extract price and `payTo`
- **Never hardcode prices** — read them from the challenges
- Resolve the DAG into parallel batches
- Sum legs + routing fee → `grandTotal`
- Sign the quote over a canonical serialization with `QUOTE_SIGNING_KEY`
- Persist to `quotes` with `status: OPEN` and `expires_at = now + QUOTE_TTL_SECONDS`
- Emit SSE events: `quote.probing`, `quote.challenge` ×4, `quote.ready`

### Definition of Done

- [ ] `POST /v1/workflow/quote` returns the full response shape from §8 with all four legs
- [ ] Total is computed **from the challenges**, proven by changing a provider's price and seeing the quote change with no router redeploy
- [ ] DAG order returns `[["diff","guardrail","roast"],["bugsum"]]`
- [ ] Quote row persists with `OPEN` and a correct expiry
- [ ] Signature verifies; a single tampered byte fails verification
- [ ] Killing one provider produces `PROVIDER_UNREACHABLE` and **no** partial quote
- [ ] **Zero payments occurred** — confirmed by checking all four payee balances are unchanged

---

## Phase 4 — Compose, Simulate, Settle

**This is the submission.** If only one phase is polished, it is this one.

### Work

- `chain/preflight.ts` — before composing: assert every `payTo` is opted into the USDC ASA, assert agent balance covers `grandTotal` + fees. Fail with `NOT_OPTED_IN` / `INSUFFICIENT_BALANCE`.
- `engine/compose.ts` — build **one** atomic group with N USDC ASA transfer legs to N **distinct** payees. Assert `legs.length <= 16` before building.
- `engine/simulate.ts` — `simulateTransactions`, decode the result, surface any failure as `SIMULATION_FAILED` with the failing leg index. **Hard gate: a failed simulation never submits.**
- `POST /v1/workflow/execute` — verify quote signature → verify not expired → atomically flip `OPEN → CONSUMED` → compose → simulate → accept the agent's signed group → facilitator verify + `feePayer` co-sign → submit → wait for confirmation
- Persist `runs` row with `group_id`, `confirmed_round`; persist a `legs` row per payment with its `txid`
- Emit `group.composed`, `group.simulated`, `group.signed`, `group.settled`

### Definition of Done

- [ ] A single execute call produces **one group id and four txids to four different addresses**, all confirmed on AlgoExplorer testnet
- [ ] **Exactly one signature** from the agent for the whole workflow — verified by instrumenting the signing call
- [ ] Agent holds **no ALGO for fees** — `feePayer` abstraction proven by draining the agent's ALGO to near-zero and settling successfully on USDC alone
- [ ] Deliberately breaking one leg (over-spend) → simulation fails → **nothing is submitted**, all four balances unchanged
- [ ] Replaying the same `quoteId` → `QUOTE_CONSUMED`, no second settlement
- [ ] An expired quote → `QUOTE_EXPIRED`, nothing signed
- [ ] Removing one payee's USDC opt-in → `NOT_OPTED_IN` at pre-flight, **before** any signature
- [ ] Group of 17 steps → `GROUP_TOO_LARGE` at compose time

---

## Phase 5 — Execute, Compensate, Receipt

Payment atomicity is not execution atomicity. This phase handles the difference.

### Work

- `engine/execute.ts` — retry every provider call **with its payment proof**, in DAG batch order, parallel within a batch
- Interpolate `${steps.diff.output.summary}` into `bugsum`'s input at execute time; a missing value is a hard error, never `undefined`
- Per-provider timeout (`PROVIDER_TIMEOUT_MS`) with exponential backoff + jitter, `PROVIDER_MAX_RETRIES` attempts
- `engine/compensate.ts` — a provider that took payment but failed to deliver gets its leg **reversed on chain**; record `compensation_txid`; mark the run `PARTIAL`
- Skip downstream steps whose dependency failed → mark `SKIPPED` → compensate their legs
- `packages/receipts` — aggregate `runs` + `legs` into the unified `Receipt`; enrich txids via indexer (round, timestamp); build AlgoExplorer URLs
- `GET /v1/receipt/:id`
- Emit `step.started` / `step.completed` / `step.failed` / `compensation.issued` / `run.completed`

### Definition of Done

- [ ] Full happy path: one button → 4 challenges → 1 group → 4 txids → 4 real LLM results → 1 receipt, **status `SETTLED`**
- [ ] `GET /v1/receipt/:id` returns every field in §8, with working explorer links for all four txids
- [ ] **Forced failure test**: make one provider return `502` post-settlement → run is `PARTIAL`, that leg is `COMPENSATED`, `compensation_txid` is on the receipt and confirmed on chain, `refundedUSDC` is correct
- [ ] **Dependency failure test**: kill `diff` → `bugsum` is `SKIPPED` and compensated, the other two still deliver
- [ ] `bugsum` demonstrably receives `diff`'s output (verified in logs)
- [ ] Total run duration under 20 s
- [ ] Receipt is retrievable after a full router restart

---

## Phase 6 — Spend Policy Guard

Pure logic. Cheap now that Phase 3 exists. Worth a whole sub-track.

### Work

- `packages/guard/evaluate.ts` — all six rules from §11
- `velocity.ts` — the one rolling-window SQL query for spend and calls
- `trust.ts` — static provider scores, with the v2 indexer-driven interface already shaped
- Wire the guard **between quote and compose** — a `FAIL` means nothing is ever signed
- Insert a `spend_events` row per leg on successful settlement
- `GET /v1/policy` and `PUT /v1/policy`
- Return **every check** in the verdict, passed or failed, with headroom — so the console can render it
- Emit `policy.evaluated`

### Definition of Done

- [ ] All six rules have passing unit tests for both pass and fail
- [ ] A workflow over the ceiling returns `402 POLICY_VIOLATION` and **no group is built** (verified: zero chain calls)
- [ ] `killSwitch: true` blocks every quote immediately
- [ ] The velocity limiter blocks after N runs within the hour and un-blocks after the window rolls
- [ ] A client's own `constraints.maxSpendUSDC` tightens the ceiling but can never loosen the stored policy
- [ ] The verdict object includes headroom for every rule

---

## Phase 7 — Console

What the judge actually looks at. 20% of the score is seen through this.

### Work

- Next.js 15 App Router, Tailwind v4, shadcn/ui
- `lib/useRunStream.ts` — `EventSource` hook consuming `GET /v1/runs/:id/events`
- **`page.tsx`** — the single button: *"Should I merge this PR?"*
- `WorkflowGraph.tsx` — DAG nodes with live per-step status (pending → paid → running → delivered / compensated)
- `ChallengeCard.tsx` — the four 402s as they arrive, each showing price and payee
- `GroupPanel.tsx` — one group id, four txids, each an AlgoExplorer link
- `ReceiptView.tsx` — the unified receipt, cost breakdown, status badge
- `PolicyPanel.tsx` — ceilings with live headroom bars and the verdict
- `EventLog.tsx` — the **raw SSE feed**, with the 8 x402 protocol steps explicitly labelled
- `policy/page.tsx` — editable policy, kill-switch toggle

### Definition of Done

- [ ] One button click drives the entire flow with live updates, no page refresh
- [ ] All 8 protocol steps are individually visible and labelled in `EventLog`
- [ ] All four txids link to working AlgoExplorer testnet pages
- [ ] A policy rejection renders as a clear blocked state with the violated rule named
- [ ] A `PARTIAL` run renders distinctly, showing the compensation txid
- [ ] Readable on a projector: large type, high contrast, works at 1280×720
- [ ] No secrets, no mnemonics, no keys anywhere in the client bundle

---

## Phase 8 — Hardening

Turns "it works on my machine" into "it works in front of judges."

### Work

- **Idempotency middleware** — `Idempotency-Key` required on execute; stored response replayed on repeat. **A retrying CI pipeline must not pay twice.**
- **Boot reconciliation** — on startup, find `PENDING` runs, query the chain by group id, finalise their receipts
- **Rate limiting** — per-agent request limiter on the router
- **Retry + backoff with jitter** on every outbound call (providers, facilitator, algod)
- **Request-id correlation** — header → logs → SSE events
- **Pino redaction** — `mnemonic`, `authorization`, `x-payment`, `apiKey`
- **CORS** — router allows only the console origin; providers allow only the router origin
- **`GET /healthz` / `GET /readyz`** — readiness checks DB + algod + facilitator + all four providers
- **`GET /openapi.json`** generated from the Zod schemas
- **`scripts/demo.ts`** — headless end-to-end run, so the demo survives a dead projector

### Definition of Done

- [ ] Two identical execute requests with the same `Idempotency-Key` → one settlement, identical responses
- [ ] `kill -9` the router mid-run, restart → the run reconciles to a correct terminal state
- [ ] `readyz` returns 503 when any dependency is down, naming which one
- [ ] `/openapi.json` validates and renders in Swagger UI
- [ ] `pnpm tsx scripts/demo.ts` completes a full run and prints the receipt to stdout
- [ ] No secret appears in any log line (grep the log output for the mnemonic)

---

## Phase 9 — Deploy, Document, Rehearse

### Work

- Deploy all four providers to Workers; deploy the router to Railway; deploy the console to Vercel
- Set every production env var and Worker secret
- **`docs/PROTOCOL.md`** — wire-level spec: every phase, every message shape, every error code, exact x402 package names + versions
- **`docs/DEPLOYMENT.md`** — the runbook in §15, verbatim and tested from a clean machine
- **`docs/DEMO.md`** — the script in §16
- Update `README.md`: live URLs, team section, judging map
- **Rehearse the demo twice, end to end, on the real deployment.**

### Definition of Done

- [ ] Every URL is public and responds
- [ ] A full run completes on the deployed stack in under 20 s
- [ ] A teammate follows `DEPLOYMENT.md` from scratch and reaches a working deploy
- [ ] The demo has been rehearsed twice with a timer and fits the slot
- [ ] A pre-generated fallback receipt id exists in case live testnet misbehaves

---

## 13. Daily Development Workflow

```bash
# terminal 1 — all four providers (wrangler dev, ports 8787-8790)
pnpm dev:providers

# terminal 2 — the router (tsx watch, port 8080)
pnpm dev:router

# terminal 3 — the console (next dev, port 3000)
pnpm dev:console

# terminal 4 — you
pnpm test --watch
```

**Before every commit:**
```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

**Branching:** work on `main` directly. This is a hackathon; branch overhead is not worth it with a team this size. The discipline is the green build, not the branch model.

**Commit message convention:** `phase(N): what changed` — e.g. `phase(4): atomic group compose + simulate gate`. It makes the git log double as a progress report for the judges.

---

## 14. Command Reference

| Command | Does |
|---|---|
| `pnpm install` | Install all workspaces |
| `pnpm dev:providers` | All four Workers via `wrangler dev` |
| `pnpm dev:router` | Router with hot reload |
| `pnpm dev:console` | Console on `:3000` |
| `pnpm build` | Build every workspace |
| `pnpm test` | Vitest across all packages |
| `pnpm typecheck` | `tsc --noEmit` everywhere |
| `pnpm lint` | ESLint |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Apply migrations to Neon |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm tsx scripts/setup-accounts.ts` | Generate the 5 testnet accounts |
| `pnpm tsx scripts/optin-usdc.ts` | Opt all payees into USDC ASA |
| `pnpm tsx scripts/fund.ts` | Dispenser helper |
| `pnpm tsx scripts/spike-atomic-group.ts` | Phase 0 de-risk spike |
| `pnpm tsx scripts/demo.ts` | Headless end-to-end run |
| `pnpm deploy:providers` | `wrangler deploy` ×4 |
| `pnpm deploy:router` | `railway up` |
| `pnpm deploy:console` | `vercel --prod` |

---

## 15. Deployment Runbook

### Prerequisites

- Node 20+ (22 LTS recommended), pnpm 9+
- Algorand testnet account funded with test USDC ([dispenser](https://lora.algokit.io/testnet/fund))
- Test USDC ASA opt-in on **every** provider address
- Anthropic API key
- Accounts: Cloudflare, Railway (or Fly), Vercel, Neon

### Steps

**1. Clone and install**
```bash
git clone <repo> && cd axis
pnpm install
cp .env.example .env
```

**2. Accounts and funding**
```bash
pnpm tsx scripts/setup-accounts.ts   # → 5 addresses + mnemonics; save the mnemonics OUT of git
pnpm tsx scripts/fund.ts             # → fund the agent from the dispenser
pnpm tsx scripts/optin-usdc.ts       # → opt all four payees into the USDC ASA
```
Paste the four payee addresses into `.env` as `PAY_TO_*`, and the agent mnemonic as `AGENT_MNEMONIC`.

**3. Database**
```bash
# create a Neon project, copy the pooled connection string into DATABASE_URL
pnpm db:migrate
```

**4. Providers → Cloudflare Workers**
```bash
cd providers/diff-explainer
wrangler secret put ANTHROPIC_API_KEY
wrangler deploy
# repeat for guardrail-checker, commit-roaster, bug-summarizer
```
Copy the four resulting URLs into `.env` as `PROVIDER_*_URL`.

**5. Router → Railway**
```bash
railway link && railway up
# set every var from .env in the Railway dashboard, especially:
#   AGENT_MNEMONIC, QUOTE_SIGNING_KEY, DATABASE_URL, PAY_TO_*, PROVIDER_*_URL
```

**6. Console → Vercel**
```bash
cd apps/console
vercel --prod
# set NEXT_PUBLIC_ROUTER_URL to the Railway URL
```

**7. Verify**
```bash
curl $ROUTER_URL/readyz      # must be 200 with every dependency green
pnpm tsx scripts/demo.ts     # must print a SETTLED receipt
```

### Testnet → mainnet

Change four variables only: `NETWORK`, `ALGOD_URL`, `INDEXER_URL`, `USDC_ASA_ID`. Nothing in the code changes.

---

## 16. Demo Script

**Target: 3 minutes.** Rehearse twice.

**0:00 — The problem (25 s)**
> "x402 solved the single paid API call. But a real agent doesn't make one call — it makes ten, to ten different providers. Today that's ten signatures, ten unrelated payments, and if step four fails you've already paid for one, two, and three. Money gone, no result. Per-call payments don't compose."

**0:25 — What AXIS does (20 s)**
> "AXIS turns N paid API calls into one all-or-nothing payment. One signature, one atomic group, one receipt. Either everyone gets paid and every result comes back, or nothing settles and the agent is out zero."

**0:45 — Click the button (60 s)**
Click **"Should I merge this PR?"** and narrate the live console:
- "Four unpaid probes go out — here are four `402` challenges from four independent providers, each stating its own price. **Nothing has been paid.**"
- "The Spend Policy Guard evaluates the quote — ceiling, per-provider cap, hourly velocity. It passes with headroom. If it failed, no group would ever be built."
- "One atomic group, four payment legs, **four different addresses**. Simulation runs first — a dry run that catches failures for free."
- "**One signature.** The agent authorizes the whole workflow."
- "Settled in about three seconds. Here's the group id — and here are four txids, four different payees. Let's open one on AlgoExplorer." **(click one)**

**1:45 — The receipt (25 s)**
> "One receipt: the group id, all four txids, all four provider results, per-step cost, total — $0.13. This is what nobody else has. Ask any per-call x402 system 'what did this one report cost me' and it can't tell you."

**2:10 — Why Algorand (25 s)**
> "On most chains, atomic across N providers means escrow contracts and refund queues — you end up building a payment processor. Algorand gives it natively: atomic transaction groups, up to 16 transactions, all-or-nothing, no smart contract. Atomicity is a property of the chain, not of our code. Plus `simulateTransactions` for free pre-flight, and the facilitator as fee payer — so the agent only needs USDC, not ALGO."

**2:35 — The hard part (20 s)**
> "One more thing. Payment atomicity isn't execution atomicity. A provider can take the money and then 500. Watch —" **(trigger the forced-failure run)** "— that provider's leg is reversed on chain, the run is marked `PARTIAL`, and the refund txid is on the receipt. Settlement succeeding doesn't mean the service delivered, and we're the only ones handling that."

**2:55 — Close (10 s)**
> "The paying customer is the CI pipeline. 200 PRs a month costs $26. A quiet month costs nothing. No seats, no subscription, no signup. That's what x402 was for."

### Demo safety net

- Keep a **pre-generated receipt id** open in a tab in case testnet stalls.
- Keep `pnpm tsx scripts/demo.ts` ready in a terminal in case the browser dies.
- Have the AlgoExplorer group page pre-loaded in a background tab.

---

## 17. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| x402 package names/API differ from the brief (`@x402/*` vs `@x402-avm/*`) | **Fatal** | **High** | **Phase 0 exists entirely for this.** Resolve via `npm view` + track Discord before writing any code against them. |
| Payee not opted into USDC ASA | High | **High** | `scripts/optin-usdc.ts` + a pre-flight check that fails with the offending address named |
| Testnet congestion or dispenser down during demo | High | Low | Pre-generated fallback receipt; funded reserve account |
| LLM latency blows the demo timing | Medium | Medium | `effort: "low"`, parallel batch execution, p50 target under 4 s per provider |
| Facilitator unreachable | High | Low | Retry with backoff; `readyz` surfaces it before the demo, not during |
| Router timeout on long fan-out | High | Low | **Already mitigated by hosting choice** — Railway long-running Node, not serverless |
| Money float bug (0.1 + 0.2) | High | Medium | Branded `MicroUSDC` `bigint` type; floats are unrepresentable by construction |
| Double settlement on CI retry | High | Medium | Mandatory `Idempotency-Key` (Phase 8) |
| Scope creep into future features | **High** | **High** | The rule at the top of this document. P6 features do not exist until P5 is green. |

---

## 18. Cut List — What Dies If Time Runs Out

Cut in this order. **Never cut upward past the line.**

| Order | Cut | Cost of cutting |
|---|---|---|
| 1 | Policy editor page (keep read-only display) | Minor — the guard still runs and is still visible |
| 2 | Indexer enrichment on receipts (round/timestamp) | Minor — txids still link to the explorer |
| 3 | Rate limiting | Low — no judge will hammer it |
| 4 | Boot reconciliation | Low — only matters if the router crashes mid-run |
| 5 | `commit-roaster` and `bug-summarizer` → run with **two** providers | Medium — the atomicity claim still holds with 2 payees, but 4 is far more convincing |
| 6 | Console polish (keep raw `EventLog` only) | Medium — the flow is still fully visible, just uglier |
| ═══ | **↑ everything above is cuttable · everything below is the submission ↑** | |
| ✗ | Compensation / `PARTIAL` handling | **Do not cut** — it is the single biggest differentiator |
| ✗ | Spend Policy Guard | **Do not cut** — it is an entire sub-track |
| ✗ | Unified receipt | **Do not cut** — it is the artifact that proves the thesis |
| ✗ | Atomic group across distinct payees | **Do not cut** — it *is* the submission |
