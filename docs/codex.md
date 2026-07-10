# Using SQLTunnel MCP with Codex

[Back to README](../README.md) | [MCP tools](../README.md#mcp) | [Configuration reference](configuration.md)

Codex CLI, the IDE extension, and the local Codex host in the ChatGPT desktop app support Streamable HTTP MCP and share Codex MCP configuration. This guide sends the SQLTunnel API key as an environment-backed Bearer token.

## Prerequisites

- The SQLTunnel MCP URL is reachable from the Codex environment.
- `gateway.yaml` contains a dedicated Codex client.
- Codex is installed and authenticated.

Use a read-only client by default:

```yaml
clients:
  - id: codex
    apiKey: replace-with-a-random-secret
    dbServers:
      - serverId: prod-postgres
        permission: read
        maxRows: 500
        queryTimeoutMs: 5000
```

## Configure the API key

SQLTunnel authenticates with `Authorization: Bearer <SQLTUNNEL_API_KEY>`. Codex can send this header directly or construct it from an environment variable. Direct headers are simpler for desktop use but store the key in plaintext; environment variables avoid putting the key in Codex configuration.

## Add in the Codex desktop app

1. Open **Settings**.
2. Select **Plugins** under **Integrations**.
3. Open the **MCPs** tab and select **Connect a custom MCP**.
4. Enter `SQLTunnel` as the name.
5. Select **Streamable HTTP**.
6. Enter `http://127.0.0.1:3000/mcp`, or the HTTPS URL reachable from Codex.
7. Choose one of the authentication methods below.
8. Save the server and restart Codex.

### Desktop method 1: direct Authorization header

In the HTTP headers section, add:

```text
Name:  Authorization
Value: Bearer replace-with-a-random-secret
```

The value must include the `Bearer ` prefix. This is the most direct desktop setup, but the API key is stored in plaintext in Codex configuration.

### Desktop method 2: Bearer-token environment variable

Set the variable in the environment that launches Codex:

```bash
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"
```

In **Bearer Token Environment Variable**, enter:

```text
SQLTUNNEL_API_KEY
```

Enter the environment variable name, not the API key itself. Codex reads its value and sends:

```http
Authorization: Bearer <SQLTUNNEL_API_KEY>
```

The desktop app must inherit `SQLTUNNEL_API_KEY` from the environment that launched it. A variable exported in an unrelated terminal session may not be visible to an app launched from Finder or the Dock; use the direct-header method if you cannot provide the variable to the desktop process.

## Add the server for Codex CLI

### CLI method 1: direct Authorization header

`codex mcp add` does not take arbitrary static headers directly. Add the server to `~/.codex/config.toml`:

```toml
[mcp_servers.sqltunnel]
url = "http://127.0.0.1:3000/mcp"
http_headers = { Authorization = "Bearer replace-with-a-random-secret" }
```

This configuration is used by Codex CLI, the desktop app, and the IDE extension. Restrict access to the file because it contains the key in plaintext.

### CLI method 2: Bearer-token environment variable

Set the variable and add the server:

```bash
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"

codex mcp add sqltunnel \
  --url "http://127.0.0.1:3000/mcp" \
  --bearer-token-env-var SQLTUNNEL_API_KEY
```

`--bearer-token-env-var` receives the environment variable name, not its value. The command writes the user-level MCP configuration without storing the key. To add tool approval and timeout settings, edit `~/.codex/config.toml` afterward.

## Global configuration

Edit `~/.codex/config.toml`:

```toml
[mcp_servers.sqltunnel]
url = "http://127.0.0.1:3000/mcp"
# Choose exactly one authentication setting:
bearer_token_env_var = "SQLTUNNEL_API_KEY"
# http_headers = { Authorization = "Bearer replace-with-a-random-secret" }
enabled_tools = ["list_db_servers", "list_database_tables", "get_table_schema", "query_database"]
default_tools_approval_mode = "writes"
startup_timeout_sec = 20
tool_timeout_sec = 60
enabled = true
```

The `bearer_token_env_var` value is the environment variable name, not the API key itself. `writes` allows read-only metadata tools normally and asks for approval before the potentially mutating `query_database` tool. If Codex is launched from a desktop icon, ensure the desktop process can read `SQLTUNNEL_API_KEY`.

## Project-scoped configuration

For a trusted project, create `.codex/config.toml`:

```toml
[mcp_servers.sqltunnel]
url = "https://sqltunnel.example.com/mcp"
bearer_token_env_var = "SQLTUNNEL_API_KEY"
default_tools_approval_mode = "writes"
```

Never put a static production key in project configuration. Codex loads project-scoped configuration only for trusted projects.

## Verify

Restart Codex CLI, the IDE extension, or the desktop app, then run:

```bash
codex mcp list
codex mcp get sqltunnel
```

In the Codex UI or TUI, enter:

```text
/mcp
```

You should see:

- `list_db_servers`
- `list_database_tables`
- `get_table_schema`
- `query_database`

## Suggested prompt

```text
Use SQLTunnel to inspect the databases I can access. Fetch the table list and relevant table schemas before generating read-only SQL. Never guess schema or column names, and return at most 100 rows.
```

Expected tool flow:

```text
list_db_servers
→ list_database_tables
→ get_table_schema
→ query_database
```

## Network and execution environment

- Local Codex: `http://127.0.0.1:3000/mcp`
- Container or remote development environment: use a service name or URL reachable from that environment.
- Remote SQLTunnel: use HTTPS, for example `https://sqltunnel.example.com/mcp`.

Local Codex configuration does not make a remote task able to reach your local `localhost`. The remote execution environment must reach the MCP URL and receive the required environment variable.

## Troubleshooting

### MCP server failed to initialize

- Confirm the Codex process can read `SQLTUNNEL_API_KEY`.
- Ensure the URL ends in `/mcp`.
- Confirm SQLTunnel is running a version that includes MCP support.

### UNAUTHENTICATED

Run `codex mcp get sqltunnel`. The `bearer_token_env_var` value must be the environment variable name `SQLTUNNEL_API_KEY`.

### Tools are missing

Restart the Codex host and inspect server status with `/mcp`. CLI, IDE, and desktop clients share host configuration, but each client must be restarted after changes.

### Remove the server

```bash
codex mcp remove sqltunnel
```

## Security recommendations

- Use `bearer_token_env_var` instead of storing the token in a configuration file.
- Use a read-only SQLTunnel client and database account.
- Keep `default_tools_approval_mode = "writes"`.
- Use HTTPS for remote connections.

Reference: [Codex MCP documentation](https://developers.openai.com/codex/mcp/).
