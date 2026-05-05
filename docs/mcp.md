# vibefin MCP API

vibefin exposes a [Model Context Protocol](https://modelcontextprotocol.io)
server so any MCP-compatible client — Claude Desktop, Claude Code, Cursor,
Cline, Continue, Windsurf, ChatGPT custom GPTs, or your own — can manage a
user's watchlists, portfolios, holdings, sells, and read market data on their
behalf.

## Endpoint

| | |
|---|---|
| URL | `https://fin.vibelife.sg/api/mcp/mcp` |
| Transport | Streamable HTTP (MCP 2025-03-26) |
| Auth | `Authorization: Bearer vbf_<64hex>` |

## Authentication

Each user generates a personal access token at
[`/settings`](https://fin.vibelife.sg/settings) → "MCP integration" → "Generate".
The plaintext secret is shown exactly once — never persisted in plaintext on
the server. Tokens are stored as `sha256(secret)` and can be revoked any time.

Every MCP request must carry the token in the `Authorization` header.
Requests without a valid token return `401 Unauthorized`.

Tokens are scoped to the user that generated them — every database query in
the MCP code path explicitly filters by `user_id`, so one user's token can
never see or touch another user's data.

## Connecting

### Generic (JSON-RPC over HTTP)

```bash
curl -X POST https://fin.vibelife.sg/api/mcp/mcp \
  -H "Authorization: Bearer vbf_<your-token>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc":"2.0","id":1,
    "method":"tools/call",
    "params":{"name":"list_watchlists","arguments":{}}
  }'
```

### Claude Code

```bash
claude mcp add --transport http vibefin https://fin.vibelife.sg/api/mcp/mcp \
  --header "Authorization: Bearer vbf_<your-token>"
```

### Claude Desktop · `claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vibefin": {
      "url": "https://fin.vibelife.sg/api/mcp/mcp",
      "headers": { "Authorization": "Bearer vbf_<your-token>" }
    }
  }
}
```

### Cursor · `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "vibefin": {
      "url": "https://fin.vibelife.sg/api/mcp/mcp",
      "headers": { "Authorization": "Bearer vbf_<your-token>" }
    }
  }
}
```

### Cline / Continue / Windsurf / others

Any MCP client that speaks Streamable HTTP can connect — point it at the URL
with the same `Authorization` header.

## Tools

The full, always-current tool reference is rendered at
[`/mcp`](https://fin.vibelife.sg/mcp) (no login required). The list below is
generated from `src/lib/mcp/catalog.ts`.

### Profile

| Tool | Description |
|---|---|
| `get_profile` | Return the signed-in user's profile (default currency, display name, email). |

### Watchlists

| Tool | Description |
|---|---|
| `list_watchlists` | List all of the user's watchlists with their stocks. |
| `create_watchlist` | Create a new watchlist. |
| `delete_watchlist` | Delete a watchlist and all of its items. |
| `add_to_watchlist` | Add a ticker to a watchlist. |
| `remove_from_watchlist` | Remove a ticker from a watchlist. |

### Portfolios

| Tool | Description |
|---|---|
| `list_portfolios` | List the user's portfolios (containers only). |
| `get_portfolio` | Return a portfolio with holdings, current prices, market value, weights, and unrealized P&L. |
| `create_portfolio` | Create a new (empty) portfolio. |
| `delete_portfolio` | Delete a portfolio and all of its holdings and sales. |

### Holdings

| Tool | Description |
|---|---|
| `add_holding` | Record a buy lot in a portfolio. |
| `update_holding` | Patch fields on an existing buy lot. |
| `delete_holding` | Permanently delete a buy lot (use `sell_lot` to record a sale instead). |
| `sell_lot` | Record a partial or full sale; reduces (or deletes) the lot and writes a stock_sales row with realized P&L. |

### Sales

| Tool | Description |
|---|---|
| `list_stock_sales` | Return realized stock sales for a portfolio, optionally filtered by ticker. |

### Market data

| Tool | Description |
|---|---|
| `search_stocks` | Search the backend for tickers matching a free-text query. |
| `get_stock_info` | Return basic info for a ticker (name, sector, last price, ...). |
| `get_stock_price` | Refresh and return the current price for one or more tickers. |

### AI

| Tool | Description |
|---|---|
| `get_llm_thoughts` | Return the cached LLM analysis (summary + structured thoughts) for a ticker. |

## Implementation notes

- Server lives at `src/app/api/mcp/[transport]/route.ts`. It validates the
  Bearer header (`src/lib/mcp/tokens.ts`) before delegating to
  [`mcp-handler`](https://github.com/vercel/mcp-handler), which closes over a
  per-request `userId`.
- All CRUD lives in `src/lib/mcp/db.ts` — every function takes `userId` as
  the first arg and explicitly filters by it (the service-role Supabase
  client bypasses RLS, so this filter is the **only** ownership boundary).
- Tool docs are defined once in `src/lib/mcp/catalog.ts` and consumed both by
  the server (`src/lib/mcp/tools.ts`) and the public docs page
  (`src/app/mcp/page.tsx`).
- Token table migration: `supabase/011_mcp_tokens.sql`.

## Adding a new tool

1. Add an entry to `TOOL_CATALOG` in `src/lib/mcp/catalog.ts`.
2. Add a CRUD helper to `src/lib/mcp/db.ts` (or `market.ts` for proxied calls).
   Make sure it takes `userId` as the first arg and filters every query by it.
3. Register the tool in `src/lib/mcp/tools.ts` using `meta("<name>")` for
   title/description.
