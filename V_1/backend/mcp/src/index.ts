/**
 * AXIS MCP server — lets any MCP-capable AI agent (Claude Desktop, Cursor,
 * Claude Code) atomically pay N x402 APIs on Algorand and get a receipt.
 *
 * Three tools, each a thin wrapper over @axis/pay:
 *   - list_workflows   what the agent can run
 *   - quote_workflow   the price, with ZERO payment
 *   - pay_and_run      settle ONE atomic group, return results + receipt
 *
 * The router holds the wallet and signs; this server never touches a key. It
 * speaks JSON-RPC over stdio, so `stdout` is reserved for the protocol — all
 * diagnostics go to stderr.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createAxisClient, AxisPayError } from "@axis/pay";

const routerUrl = process.env.ROUTER_URL ?? "http://localhost:8080";
const defaultAgent = process.env.AGENT_ADDRESS ?? "NG5SZZ3U6XOB4L5N4CPZ7SLIZRDIEK2CM4XMB5WDPLAWSCIRCIJTTKYOPQ";
const axis = createAxisClient({ routerUrl });

const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], ...(isError ? { isError: true } : {}) });

const server = new McpServer({ name: "axis-pay", version: "0.1.0" });

server.registerTool(
  "list_workflows",
  {
    title: "List AXIS workflows",
    description: "List the multi-provider x402 workflows this AXIS router can run, with each workflow's provider steps and the inputs it needs.",
    inputSchema: {},
  },
  async () => {
    const workflows = await axis.listWorkflows();
    const lines = workflows.map((w) =>
      `• ${w.id} — ${w.steps.map((s) => s.provider).join(", ")}  (inputs: ${w.inputs.join(", ") || "none"})`);
    return text(`Available workflows:\n${lines.join("\n")}`);
  },
);

server.registerTool(
  "quote_workflow",
  {
    title: "Quote a workflow (no payment)",
    description: "Price a workflow by reading each provider's live x402 challenge. No money moves. Returns the total, per-provider prices, and whether the spend policy allows it. Call this before pay_and_run.",
    inputSchema: {
      workflow: z.string().describe("workflow id, e.g. 'pr-review'"),
      inputs: z.record(z.any()).describe("the workflow's inputs, e.g. { diff, commitMessage }"),
      agentAddress: z.string().optional().describe("Algorand address paying; defaults to the server's configured agent"),
    },
  },
  async ({ workflow, inputs, agentAddress }) => {
    try {
      const q = await axis.quote(workflow, inputs as Record<string, unknown>, agentAddress ?? defaultAgent);
      const legs = q.legs.map((l) => `  - ${l.provider}: $${l.priceUSDC}`).join("\n");
      return text(`Quote for "${workflow}":\n  total: $${q.totalUSDC}\n  spend policy: ${q.policy.verdict}\n${legs}`);
    } catch (e) {
      return text(`Could not quote: ${(e as AxisPayError).code ?? "ERROR"} — ${(e as Error).message}`, true);
    }
  },
);

server.registerTool(
  "pay_and_run",
  {
    title: "Pay and run a workflow atomically",
    description: "Pay all of a workflow's providers in ONE atomic Algorand group (one signature, all-or-nothing) and return each provider's result plus a unified receipt. If budgetUSDC is set and the quote exceeds it, nothing is paid. If a provider takes payment but fails, its leg is refunded on-chain and the run is PARTIAL.",
    inputSchema: {
      workflow: z.string().describe("workflow id, e.g. 'pr-review'"),
      inputs: z.record(z.any()).describe("the workflow's inputs"),
      budgetUSDC: z.number().positive().optional().describe("hard spending ceiling in USDC; the payment is refused before settling if the quote exceeds it"),
      agentAddress: z.string().optional().describe("Algorand address paying; defaults to the server's configured agent"),
    },
  },
  async ({ workflow, inputs, budgetUSDC, agentAddress }) => {
    try {
      const r = await axis.pay(workflow, inputs as Record<string, unknown>, agentAddress ?? defaultAgent, { budgetUSDC });
      const legs = r.legs.map((l) => `  - ${l.provider} [${l.status}] ${l.explorerUrl}`).join("\n");
      const results = r.legs
        .filter((l) => l.result != null)
        .map((l) => `### ${l.provider}\n${typeof l.result === "string" ? l.result : JSON.stringify(l.result, null, 2)}`)
        .join("\n\n");
      return text(
        `${r.status} — $${r.totalUSDC} paid across ${r.legs.length} providers in one atomic group (round ${r.confirmedRound}).\n` +
        `group ${r.groupId}\n${legs}\n` +
        (Number(r.refundedUSDC) > 0 ? `refunded on-chain: $${r.refundedUSDC}\n` : "") +
        `\nResults:\n\n${results}`,
      );
    } catch (e) {
      const err = e as AxisPayError;
      return text(`No payment was made (${err.code ?? "ERROR"}): ${err.message}`, true);
    }
  },
);

await server.connect(new StdioServerTransport());
process.stderr.write(`axis-pay MCP server ready → router ${routerUrl}\n`);
