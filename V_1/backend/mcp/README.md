# @axis/mcp — AXIS as an MCP tool

An [MCP](https://modelcontextprotocol.io) server that lets any MCP-capable AI
agent (Claude Desktop, Cursor, Claude Code) **atomically pay N x402 APIs on
Algorand** and get a unified receipt back — natively, as a tool.

## Tools

| Tool | What it does |
|---|---|
| `list_workflows` | the multi-provider workflows this router can run |
| `quote_workflow` | price a workflow with **zero** payment (+ spend-policy verdict) |
| `pay_and_run` | settle **one atomic group** (one signature, all-or-nothing) and return every provider's result + receipt |

`pay_and_run` takes an optional `budgetUSDC` — if the quote exceeds it, nothing
is paid. If a provider takes payment and fails, its leg is refunded on-chain and
the run comes back `PARTIAL`.

## Run it

```bash
ROUTER_URL=http://localhost:8080 node src/index.ts        # speaks MCP over stdio
npm run inspect                                           # open the MCP Inspector
```

## Connect it to Claude Desktop

Add to `claude_desktop_config.json` (macOS:
`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "axis-pay": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/AXIS/V_1/backend/mcp/src/index.ts"],
      "env": { "ROUTER_URL": "http://localhost:8080" }
    }
  }
}
```

Restart Claude Desktop, then ask: *"List AXIS workflows, then pay and run
pr-review on this diff with a $0.50 budget."* Claude calls the tools, a real
atomic settlement fires on testnet, and the results come back in the chat.

The router holds the wallet and does the signing — this server never touches a key.
