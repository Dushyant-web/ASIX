# Deployed endpoints

Live x402 provider endpoints on Cloudflare Workers, Algorand testnet USDC.
Each on its own worker with its own distinct payout address.

| Provider | URL | Price | Endpoint |
|---|---|---|---|
| diff-explainer | https://axis-diff-explainer.axis-pay.workers.dev | $0.03 | `POST /diff/explain` |
| guardrail-checker | https://axis-guardrail-checker.axis-pay.workers.dev | $0.02 | `POST /guardrail/check` |
| commit-roaster | https://axis-commit-roaster.axis-pay.workers.dev | $0.03 | `POST /commit/roast` |
| bug-summarizer | https://axis-bug-summarizer.axis-pay.workers.dev | $0.05 | `POST /bug/summarize` |

Each exposes `GET /health` returning its provider name, price, and payout address.

Unpaid `POST` returns a `402` challenge stating the price; the router reads the
price from there rather than hardcoding it.

Model: NVIDIA NIM `meta/llama-3.1-8b-instruct`. Replay claims backed by
Cloudflare KV (`AXIS_CLAIMS`).
