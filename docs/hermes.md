# Hermes configuration

Add SQLTunnel to `~/.hermes/config.yaml`. Choose either plaintext configuration or environment-variable configuration.

## Plaintext configuration

```yaml
mcp_servers:
  sqltunnel:
    url: "http://127.0.0.1:3000/mcp"
    headers:
      Authorization: "Bearer replace-with-a-random-secret"
    enabled: true
    supports_parallel_tool_calls: false
    tools:
      include:
        - list_db_servers
        - list_database_tables
        - get_table_schema
        - query_database
      resources: false
      prompts: false
```

## Environment variables

Add this to `~/.hermes/.env`:

```dotenv
SQLTUNNEL_MCP_URL=http://127.0.0.1:3000/mcp
SQLTUNNEL_API_KEY=replace-with-a-random-secret
```

Then add this to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  sqltunnel:
    url: "${SQLTUNNEL_MCP_URL}"
    headers:
      Authorization: "Bearer ${SQLTUNNEL_API_KEY}"
    enabled: true
    supports_parallel_tool_calls: false
    tools:
      include:
        - list_db_servers
        - list_database_tables
        - get_table_schema
        - query_database
      resources: false
      prompts: false
```

## Usage

Test the server and start Hermes:

```bash
hermes mcp test sqltunnel
hermes chat
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
