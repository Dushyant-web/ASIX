# @axis/agent — autonomous budgeted agent

Give it a **goal** and a **USDC budget**. It picks a workflow, fills its inputs
with an LLM (NVIDIA NIM), quotes it, and pays the providers **atomically** — but
only within budget. The budget is enforced twice: the agent declines a quote
over budget, and the router's Spend Policy Guard is the hard backstop (a FAIL
means nothing is ever signed). So even a misbehaving agent can't overspend.

```bash
# needs the router running + NVIDIA_API_KEY in ../../.env
node src/cli.ts "Review this PR: - const t=10 / + const t=60" 1.00   # pays, settles
node src/cli.ts "Review this PR: ..." 0.05                           # declines: over budget
```

Example run:

```
🤖 goal: Review this PR: ...
💰 budget: $1.00
🧠 chose workflow "pr-review" with inputs: diff, commitMessage
🧾 quote: $0.14  ·  spend policy: PASS
✅ within budget — paying atomically…
💸 SETTLED — $0.13 across 4 providers (round 66110504)
📝 <LLM summary of the four providers' results>
```

Built on [`@axis/pay`](../sdk). Zero extra dependencies — env is loaded with
node's built-in `process.loadEnvFile`.
