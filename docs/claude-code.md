# Claude Code configuration

## CLI

Choose either plaintext configuration or environment-variable configuration.

### Plaintext configuration

```bash
claude mcp add --transport http --scope user sqltunnel \
  "http://127.0.0.1:3000/mcp" \
  --header "Authorization: Bearer replace-with-a-random-secret"
```

### Environment variables

```bash
export SQLTUNNEL_MCP_URL="http://127.0.0.1:3000/mcp"
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"

claude mcp add --transport http --scope user sqltunnel "$SQLTUNNEL_MCP_URL" \
  --header "Authorization: Bearer $SQLTUNNEL_API_KEY"
```

Use `--scope project` instead of `--scope user` to add the server only to the current project.

## Project configuration

Choose either plaintext configuration or environment-variable configuration in `.mcp.json` at the project root.

### Plaintext configuration

```json
{
  "mcpServers": {
    "sqltunnel": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp",
      "headers": {
        "Authorization": "Bearer replace-with-a-random-secret"
      }
    }
  }
}
```

### Environment variables

```bash
export SQLTUNNEL_MCP_URL="http://127.0.0.1:3000/mcp"
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"
```

```json
{
  "mcpServers": {
    "sqltunnel": {
      "type": "http",
      "url": "${SQLTUNNEL_MCP_URL}",
      "headers": {
        "Authorization": "Bearer ${SQLTUNNEL_API_KEY}"
      }
    }
  }
}
```

Do not commit a real API key in `.mcp.json`.

## Usage

First tell Claude Code:

```text
You can use SQLTunnel to query databases.
```

Then describe each request in natural language. For example:

```text
List the databases I can access.
```

```text
List the tables in prod-postgres.
```

```text
Query the 10 most recent orders. Inspect the relevant table schemas before running the query.
```
