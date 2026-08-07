/** POST /commit/roast — $0.03 — commit message critique + rewrites. */
import { Hono } from "hono";
import { z } from "zod";
import { paidHandler, jsonComplete, type ProviderConfig, type ProviderEnv } from "@axis/provider-kit";

const cfg: ProviderConfig = {
  name: "commit-roaster",
  priceUSDC: "0.03",
  description: "Commit message critique with rewritten alternatives",
  payToEnvKey: "PAY_TO_ROASTER",
};

const Input = z.object({ message: z.string().min(1, "message is required") });

const Output = z.object({
  critique: z.string(),
  rewrites: z.array(z.string()).min(1),
  score: z.number().min(0).max(10),
});

const SYSTEM = `You critique git commit messages against Conventional Commits and
general clarity. Be sharp but useful, never cruel. Return JSON:
{ "critique": string, "rewrites": string[2..3], "score": 0..10 }.
Rewrites must be complete, usable commit subject lines.`;

const app = new Hono();
app.get("/health", (c) => c.json({ provider: cfg.name, priceUSDC: cfg.priceUSDC, payTo: (c.env as ProviderEnv)[cfg.payToEnvKey] ?? null }));
app.post("/commit/roast", (c) =>
  paidHandler(c, {
    cfg,
    input: Input,
    run: ({ message }, env) => jsonComplete(env, Output, SYSTEM, message, 600),
  }),
);
export default app;
