# AXIS Live Monitor — Chrome extension

A side-panel that turns the AXIS agent's work into a **live animated flowchart**.
Click *"Should I merge this PR?"* in the console and the panel draws it in real
time: boxes for every actor (agent wallet, router, spend guard, Neon DB, the
atomic group, the 4 providers, the facilitator), arrows between them, and **gold
coins that travel along the arrows when money moves** — forward on settle, and
**backward on a refund**. A plain-language caption narrates each backend step,
so a viewer sees exactly what the code does and *where state is stored* — without
reading any code.

What you watch happen, step by step:
- unpaid **402 probes** fan out to the providers; each box shows its price
- the signed **quote** is stored in **Neon** (caption says so)
- the **Spend Guard** turns green (pass) or red (blocked → nothing is signed)
- the **atomic group** forms; the **facilitator** lights up as fee-payer
- on **settle**, coins fly agent → group → all N providers; txids stored in Neon
- if a provider fails, its coin travels **backward** to the agent — the on-chain
  refund, made visible

It is a pure read-only viewer over the same SSE stream the web console uses
(`GET /v1/runs/:id/events`). It never signs, never pays, never holds a key.

## Load it (unpacked)

1. Start the router (`node src/index.ts` in `backend/router`, port 8080).
2. Open `chrome://extensions`, toggle **Developer mode** (top-right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Click the AXIS icon in the toolbar → the side panel opens.

## Use it

- The panel auto-discovers the currently running agent via `GET /v1/runs/latest`
  and follows it — **no run id to paste**. Just click **"Should I merge this
  PR?"** in the console and watch the panel fill in live.
- To point it at a deployed router, type the URL in the box and hit **set**
  (stored in `chrome.storage`, default `http://localhost:8080`).

## How it works

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest — side panel + host permission for the router |
| `background.js` | opens the side panel on toolbar click |
| `panel.html` | the panel markup + styling (self-contained) |
| `panel.js` | polls `/v1/runs/latest`, opens an `EventSource`, folds `RunEvent`s into the live view |

The event schema in `@axis/shared` is the only contract — the same events the
web console renders drive this panel, so the two can never disagree.
