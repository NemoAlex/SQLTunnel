# Using SQLTunnel MCP with Claude Code

[Back to README](../README.md) | [MCP tools](../README.md#mcp) | [Configuration reference](configuration.md)

Claude Code supports remote Streamable HTTP MCP servers and custom request headers, so it can connect directly to SQLTunnel.

## Prerequisites

- SQLTunnel is running and reachable from the Claude Code host at `http(s)://host:port/mcp`.
- `gateway.yaml` contains a dedicated Claude Code client.
- Claude Code is installed and authenticated.

Recommended client:

```yaml
clients:
  - id: claude-code
    apiKey: replace-with-a-random-secret
    dbServers:
      - serverId: prod-postgres
        permission: read
        maxRows: 500
        queryTimeoutMs: 5000
```

## Option 1: add with the CLI

Set the URL and API key:

```bash
export SQLTUNNEL_MCP_URL="http://127.0.0.1:3000/mcp"
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"
```

Add the server at user scope:

```bash
claude mcp add --transport http --scope user sqltunnel "$SQLTUNNEL_MCP_URL" \
  --header "Authorization: Bearer $SQLTUNNEL_API_KEY"
```

Use `--scope project` instead for a project-only server. Project configuration is written to `.mcp.json`; never commit a real API key.

## Option 2: use `.mcp.json`

Claude Code expands environment variables in MCP URLs and headers. Add this to the project root:

```json
{
  "mcpServers": {
    "sqltunnel": {
      "type": "http",
      "url": "${SQLTUNNEL_MCP_URL:-http://127.0.0.1:3000/mcp}",
      "headers": {
        "Authorization": "Bearer ${SQLTUNNEL_API_KEY}"
      }
    }
  }
}
```

Set the secret before starting Claude Code:

```bash
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"
claude
```

This keeps the configuration shareable without storing the API key in source control.

## Verify

Inspect the server:

```bash
claude mcp list
claude mcp get sqltunnel
```

Inside Claude Code, run:

```text
/mcp
```

You should see SQLTunnel and:

- `list_db_servers`
- `list_database_tables`
- `get_table_schema`
- `query_database`

Claude Code asks for trust confirmation the first time it uses a project-scoped MCP server.

## Suggested usage

Discovery-only prompt:

```text
Use SQLTunnel to list the databases and tables I can access. Do not query business data yet.
```

Full workflow prompt:

```text
Inspect public.orders in prod-postgres, then count orders per day for the last seven days. Use read-only SQL and return at most 100 rows.
```

The expected tool flow is:

```text
list_db_servers
→ list_database_tables
→ get_table_schema
→ query_database
```

## Network addresses

- Claude Code and SQLTunnel on the same host: `http://127.0.0.1:3000/mcp`
- Claude Code in a container: use a reachable service name or host address.
- Remote SQLTunnel: `https://sqltunnel.example.com/mcp`.

Do not use `localhost` for a remote server.

## Troubleshooting

### Connection closed or connection failure

- Use `--transport http`, not SSE or stdio.
- Ensure the URL ends in `/mcp`.
- Test network access from the same environment that runs Claude Code.

### UNAUTHENTICATED

Verify the header value is `Bearer ${SQLTUNNEL_API_KEY}` and that the Claude Code process can read `SQLTUNNEL_API_KEY`.

### Tools are missing

Run `claude mcp get sqltunnel`, restart Claude Code, and inspect `/mcp` for connection errors.

### Remove the server

```bash
claude mcp remove sqltunnel
```

## Security recommendations

- Use a read-only SQLTunnel client and database account by default.
- Keep the API key in an environment variable.
- Review project `.mcp.json` files before trusting them.
- Use HTTPS for remote connections.

Reference: [Claude Code MCP documentation](https://docs.anthropic.com/en/docs/claude-code/mcp).
