/**
 * axis-toolbox — five real, paid AI services on one Worker.
 *
 * Each endpoint is its own x402 resource (own price, own payment binding), all
 * paying to PAY_TO_TOOLBOX. Powered by NVIDIA NIM via the shared provider kit,
 * so every route is: challenge 402 → verify payment → call the model → return.
 *
 *   POST /code/generate   $0.05  write code for a task
 *   POST /debug/fix       $0.04  diagnose an error and propose a fix
 *   POST /test/write      $0.04  write unit tests for code
 *   POST /translate       $0.02  translate text to a target language
 *   POST /summarize       $0.02  summarise a long piece of text
 */
import { Hono } from "hono";
import { z } from "zod";
import { paidHandler, ClaimDO, complete, type ProviderConfig, type ProviderEnv } from "@axis/provider-kit";

const PAY = "PAY_TO_TOOLBOX";
const cfg = (name: string, priceUSDC: string, description: string): ProviderConfig =>
  ({ name, priceUSDC, description, payToEnvKey: PAY });

const app = new Hono();

app.get("/health", (c) =>
  c.json({ provider: "toolbox", payTo: (c.env as ProviderEnv)[PAY] ?? null, services: ["code/generate", "debug/fix", "test/write", "translate", "summarize"] }));

// ── 1. Code generator ──────────────────────────────────────────────────────
app.post("/code/generate", (c) =>
  paidHandler(c, {
    cfg: cfg("code-generator", "0.05", "Write code for a described task"),
    input: z.object({ task: z.string().min(1, "task is required"), language: z.string().optional() }),
    run: async ({ task, language }, env) => ({
      code: await complete(env,
        `You are a senior engineer. Write correct, idiomatic ${language ?? "code"} for the task. ` +
        `Output ONLY the code, no prose, no markdown fences.`,
        task, 700),
    }),
  }));

// ── 2. Debugger ────────────────────────────────────────────────────────────
app.post("/debug/fix", (c) =>
  paidHandler(c, {
    cfg: cfg("debugger", "0.04", "Diagnose an error and propose a fix"),
    input: z.object({ error: z.string().min(1, "error is required"), code: z.string().optional() }),
    run: async ({ error, code }, env) => ({
      diagnosis: await complete(env,
        "You are a debugging expert. Given an error (and optional code), state the likely CAUSE in one line, " +
        "then the FIX in 1-3 concrete steps. Be specific. No preamble.",
        `Error:\n${error}${code ? `\n\nCode:\n${code}` : ""}`, 500),
    }),
  }));

// ── 3. Test writer ─────────────────────────────────────────────────────────
app.post("/test/write", (c) =>
  paidHandler(c, {
    cfg: cfg("test-writer", "0.04", "Write unit tests for code"),
    input: z.object({ code: z.string().min(1, "code is required"), framework: z.string().optional() }),
    run: async ({ code, framework }, env) => ({
      tests: await complete(env,
        `You write focused unit tests${framework ? ` using ${framework}` : ""}. Cover the happy path plus edge cases. ` +
        `Output ONLY the test code, no prose.`,
        code, 700),
    }),
  }));

// ── 4. Translator ──────────────────────────────────────────────────────────
app.post("/translate", (c) =>
  paidHandler(c, {
    cfg: cfg("translator", "0.02", "Translate text to a target language"),
    input: z.object({ text: z.string().min(1, "text is required"), language: z.string().min(1, "language is required") }),
    run: async ({ text, language }, env) => ({
      translation: await complete(env,
        `Translate the user's text into ${language}. Output ONLY the translation, nothing else.`,
        text, 500),
    }),
  }));

// ── 5. Summarizer ──────────────────────────────────────────────────────────
app.post("/summarize", (c) =>
  paidHandler(c, {
    cfg: cfg("summarizer", "0.02", "Summarise a long piece of text"),
    input: z.object({ text: z.string().min(1, "text is required") }),
    run: async ({ text }, env) => ({
      summary: await complete(env,
        "Summarise the user's text into 3-5 clear sentences capturing the key points. No preamble.",
        text, 400),
    }),
  }));

export default app;
export { ClaimDO };
