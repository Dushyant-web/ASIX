# Deployed endpoints

Live x402 provider endpoints on Cloudflare Workers, Algorand testnet USDC.
Each on its own worker with its own distinct payout address.

| Provider | URL | Price | Endpoint |
|---|---|---|---|
| diff-explainer | https://axis-diff-explainer.axis-pay.workers.dev | $0.03 | `POST /diff/explain` |
| guardrail-checker | https://axis-guardrail-checker.axis-pay.workers.dev | $0.02 | `POST /guardrail/check` |
| commit-roaster | https://axis-commit-roaster.axis-pay.workers.dev | $0.03 | `POST /commit/roast` |
| bug-summarizer | https://axis-bug-summarizer.axis-pay.workers.dev | $0.05 | `POST /bug/summarize` |

**Toolbox worker** — 5 more services on one worker, each with its own distinct
payout address: `https://axis-toolbox.axis-pay.workers.dev`

| Service | Price | Endpoint |
|---|---|---|
| code-generator | $0.05 | `POST /code/generate` |
| debugger | $0.04 | `POST /debug/fix` |
| test-writer | $0.04 | `POST /test/write` |
| translator | $0.02 | `POST /translate` |
| summarizer | $0.02 | `POST /summarize` |

**9 services total**, all distinct USDC-opted-in payout addresses — so a single
workflow (`deep-review`) settles as a 7-payee atomic group.

Each exposes `GET /health` returning its provider name, price, and payout address.

Unpaid `POST` returns a `402` challenge stating the price; the router reads the
price from there rather than hardcoding it.

Model: NVIDIA NIM `meta/llama-3.1-8b-instruct`. Replay claims backed by
Cloudflare KV (`AXIS_CLAIMS`).
