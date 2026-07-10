# Using SQLTunnel MCP with Dify

[Back to README](../README.md) | [API reference](api.md) | [Configuration reference](configuration.md)

This guide connects SQLTunnel to Dify as a remote HTTP MCP server. Do not import `openapi.json`; Dify discovers SQLTunnel's tools through MCP.

## Prerequisites

Prepare:

- A SQLTunnel MCP URL reachable from Dify, such as `https://sqltunnel.example.com/mcp`.
- A dedicated SQLTunnel API key for Dify.
- Grants for the db servers Dify may access.

Use a read-only client by default:

```yaml
clients:
  - id: dify
    apiKey: replace-with-a-random-secret
    dbServers:
      - serverId: prod-postgres
        permission: read
        maxRows: 500
        queryTimeoutMs: 5000
```

## Choose the MCP URL

The URL must end in `/mcp` and be reachable from Dify's runtime:

- Dify and SQLTunnel on the same Docker network: `http://sqltunnel:3000/mcp`
- Dify in Docker and SQLTunnel on the host: `http://host.docker.internal:3000/mcp`
- Dify Cloud or a remote deployment: `https://sqltunnel.example.com/mcp`

Do not use `localhost` or `127.0.0.1` from Dify Cloud or a Dify container; those addresses refer to Dify itself. Use HTTPS for remote deployments.

## Add the MCP server

In the Dify workspace tool management UI, add an MCP server and choose HTTP. Menu labels can vary slightly by Dify version.

Enter:

- Server endpoint URL: `https://sqltunnel.example.com/mcp`
- Name: `SQLTunnel`
- Server identifier: `sqltunnel`

On the Authentication tab:

- Disable dynamic client registration.
- Leave Client ID and Client Secret empty.

SQLTunnel uses a static Bearer token, not the MCP OAuth authorization flow or dynamic client registration.

On the Headers tab, add:

```text
Authorization: Bearer replace-with-a-random-secret
```

Keep the Configuration tab at its defaults unless your environment requires custom timeouts. After saving and connecting, Dify should discover:

- `list_db_servers`
- `list_database_tables`
- `get_table_schema`
- `query_database`

## Use with an Agent

Create or open an Agent app and enable all four SQLTunnel MCP tools. The intended workflow is:

1. Call `list_db_servers` when the target database is unknown.
2. Call `list_database_tables` for a compact table list.
3. Call `get_table_schema` only for relevant tables.
4. Generate SQL and call `query_database`.

Suggested Instructions / System Prompt:

```text
You are a cautious database query assistant with access to SQLTunnel MCP.

Rules:
- Call SQLTunnel only when the user needs database data.
- If dbServerId is unknown, call list_db_servers first.
- Before generating SQL, call list_database_tables and then get_table_schema only for relevant tables.
- Copy schemaName and tableName exactly from tool results; never guess them.
- Default to SELECT, WITH, SHOW, DESCRIBE, or EXPLAIN statements.
- Select explicit columns and use necessary WHERE conditions; avoid SELECT *.
- Keep maxRows to the minimum needed to answer the question.
- Never reveal API keys, request headers, database passwords, or SSH configuration.
- On a tool error, explain the error code instead of retrying the same invalid arguments repeatedly.
```

For an app tied to one database, specify the default `dbServerId` in the instructions, but retain table and schema discovery.

## Use in Workflow / Chatflow

Use an Agent node with the SQLTunnel MCP tools when the model should choose tables and generate SQL autonomously.

For fixed SQL, call `query_database` directly from a tool node with fixed or variable inputs:

```json
{
  "dbServerId": "prod-postgres",
  "sql": "select id, status from orders where id = $1",
  "params": [123],
  "maxRows": 10
}
```

PostgreSQL placeholders use `$1`, `$2`; MySQL uses `?`.

## Verify the connection

First ask:

```text
List the databases and tables you can access. Do not query table data yet.
```

Then test the full workflow:

```text
Inspect public.users in prod-postgres, then count the users.
```

Use Dify run logs to verify tool order and arguments.

## Troubleshooting

### Dify cannot connect

- Ensure the URL ends in `/mcp`.
- Test from the Dify container or server, not only from your browser.
- Check Docker networking, DNS, firewall rules, reverse proxy routing, and TLS certificates.

### UNAUTHENTICATED

- The header must be `Authorization: Bearer <SQLTUNNEL_API_KEY>`.
- Do not put the API key in the OAuth Client Secret field.
- Confirm `gateway.yaml` contains the same key and restart SQLTunnel after changes.

### FORBIDDEN or DB_SERVER_NOT_FOUND

Check the Dify client's `dbServers` grants and the `dbServerId` passed by the tool call.

### Stale schema metadata

Call `list_database_tables` or `get_table_schema` with `refresh: true`. The default TTL is controlled by `defaults.schemaCacheTtlMs`.

## Security recommendations

- Give Dify a dedicated API key and a read-only database account.
- Keep `maxRows` and `queryTimeoutMs` low.
- Never put production API keys in app prompts.
- Use HTTPS and restrict network access to SQLTunnel.
- Grant `write` only when explicitly required.

Reference: [Dify documentation](https://docs.dify.ai/).
