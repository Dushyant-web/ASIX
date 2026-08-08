# AXIS Console

The live dashboard. One button runs a real workflow; everything on screen is
driven by the router's actual event stream — nothing is scripted or replayed.
from a recording.

## Who owns what

**Phase F1 — UX (Dushyant).** Behaviour: the state machine, screen states, the
interaction contract, backend wiring. Owns `lib/`.

**Phase F2 — UI (team).** Appearance and motion. Owns `components/` and the
design system. Consumes the props F1 freezes; holds no logic of its own.

Full definitions: `V_1/BUILD_PLAN.md` → Phase F1 / Phase F2.

## You are not blocked on the backend

`@axis/shared` exports `mockRun()`, a complete run emitted as real `RunEvent`
values with realistic per-event timing. Build and animate against it today.

```ts
import { mockRun } from "@axis/shared";

for await (const event of mockRun({ scenario: "partial" })) {
  setState((s) => applyEvent(s, event));   // lib/state-machine.ts
}
```

Four scenarios. `partial` is the default **on purpose** — it exercises a
provider being paid, failing, and being refunded on chain, which is the hardest
path to build and the best thing to demo.

| scenario | what it exercises |
|---|---|
| `happy` | settles; 4 txids to 4 distinct payees; 1 signature |
| `partial` | a provider is PAID, FAILS, and is REFUNDED — money moves backwards |
| `policyBlocked` | rejected pre-signature; nothing composed; **cost zero** |
| `simulationFailed` | composed but never submitted; **cost zero** |

Going live later is one line: swap `mockRun()` for `useRunStream(runId)`.

## The rule

The console renders what it receives. It holds **no** business logic, **no**
keys, and never computes money. If something needs deriving, it belongs in
`lib/state-machine.ts` — a pure function, unit tested, with no React in it.
