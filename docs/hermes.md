# Using SQLTunnel MCP with Hermes

[Back to README](../README.md) | [MCP tools](../README.md#mcp) | [Configuration reference](configuration.md)

Hermes Agent supports remote Streamable HTTP MCP servers through `~/.hermes/config.yaml`. This guide keeps the SQLTunnel URL and Bearer token in `~/.hermes/.env` and limits Hermes to SQLTunnel's four tools.

## Prerequisites

- The SQLTunnel MCP URL is reachable from the environment running Hermes.
- `gateway.yaml` contains a dedicated Hermes client.
- Hermes Agent is installed.

Use a read-only client by default:

```yaml
clients:
  - id: hermes
    apiKey: replace-with-a-random-secret
    dbServers:
      - serverId: prod-postgres
        permission: read
        maxRows: 500
        queryTimeoutMs: 5000
```

## Store the URL and token

Add these values to `~/.hermes/.env`:

```dotenv
SQLTUNNEL_MCP_URL=http://127.0.0.1:3000/mcp
SQLTUNNEL_API_KEY=replace-with-a-random-secret
```

Protect this file and do not commit it. For a remote deployment, use an HTTPS URL.

## Configure the MCP server

Add this section to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  sqltunnel:
    url: "${SQLTUNNEL_MCP_URL}"
    headers:
      Authorization: "Bearer ${SQLTUNNEL_API_KEY}"
    enabled: true
    timeout: 60
    connect_timeout: 20
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

`supports_parallel_tool_calls: false` is a conservative default because `query_database` may execute a write when the SQLTunnel client has write permission. Metadata calls are still fast because SQLTunnel caches schema discovery according to `defaults.schemaCacheTtlMs`.

SQLTunnel currently exposes tools only, so resources and prompts are disabled.

## Verify

Test the connection from the same environment that runs Hermes:

```bash
hermes mcp test sqltunnel
```

Start a new chat afterward:

```bash
hermes chat
```

If a Hermes session is already running, enter `/reload-mcp` to reload the configuration.

Hermes prefixes remote MCP tool names with the server identifier. The registered names should be:

- `mcp_sqltunnel_list_db_servers`
- `mcp_sqltunnel_list_database_tables`
- `mcp_sqltunnel_get_table_schema`
- `mcp_sqltunnel_query_database`

## Suggested prompt

```text
Use SQLTunnel to inspect the databases I can access. Fetch the table list and relevant table schemas before generating read-only SQL. Never guess schema or column names, and return at most 100 rows.
```

Expected logical tool flow:

```text
list_db_servers
→ list_database_tables
→ get_table_schema
→ query_database
```

## Network environments

- Hermes and SQLTunnel on the same machine: `http://127.0.0.1:3000/mcp`
- Hermes in Docker: use a host address or Docker service name reachable from the container.
- Remote SQLTunnel: use HTTPS, for example `https://sqltunnel.example.com/mcp`.

Do not use `127.0.0.1` when Hermes and SQLTunnel run in different containers or on different machines.

## Troubleshooting

### Connection test fails

- Ensure the URL ends in `/mcp`.
- Confirm Hermes loaded both variables from `~/.hermes/.env`.
- Test the URL from the Hermes host or container.
- Check reverse proxy routing, firewall rules, DNS, and TLS certificates.

### UNAUTHENTICATED

- Confirm the header is `Authorization: Bearer ${SQLTUNNEL_API_KEY}`.
- Confirm the `.env` value matches the Hermes client's `apiKey` in `gateway.yaml`.
- Restart SQLTunnel after changing `gateway.yaml`.

### Tools do not appear

Run `hermes mcp test sqltunnel`, then start a new session or use `/reload-mcp`. Check that the names under `tools.include` exactly match SQLTunnel's tool names.

### FORBIDDEN or DB_SERVER_NOT_FOUND

Check the Hermes client's `dbServers` grants and the `dbServerId` selected by the tool call.

## Disable the server

Set `enabled: false` under `mcp_servers.sqltunnel`, or remove the entire `sqltunnel` block, then reload MCP.

## Security recommendations

- Use a dedicated read-only SQLTunnel client and a read-only database account.
- Keep the API key in `~/.hermes/.env`, not directly in `config.yaml`.
- Use a long random API key and rotate it if exposed.
- Use HTTPS for every remote connection.
- Enable write permission only when the agent genuinely needs it.

References: [Hermes MCP guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp) and [MCP configuration reference](https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference).
