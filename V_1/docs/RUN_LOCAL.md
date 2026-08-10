# Run AXIS locally

Two terminals in `V_1/`:

```bash
# terminal 1 — router (quote · execute · receipt · SSE)  → :8080
cd backend/router && node src/index.ts

# terminal 2 — console  → :3000
cd frontend/console && NEXT_PUBLIC_ROUTER_URL=http://localhost:8080 npx next dev
```

Open http://localhost:3000 → click **"Run full review"**.

- `node src/index.ts` needs Node 22.18+ (native TypeScript).
- Prefer `npx next dev` over `pnpm dev` (pnpm 11's pre-run dep check can choke
  on the optional `sharp` native build).
- Watch a refund (PARTIAL): execute accepts a demo `{ "chaos": "roast" }` flag.
