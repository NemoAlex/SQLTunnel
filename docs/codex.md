# Codex configuration

## Desktop app

Open **Settings → MCP servers → Add server**.

Choose either plaintext configuration or environment-variable configuration.

### Plaintext configuration

```text
Name: SQLTunnel
Type: Streamable HTTP
URL: http://127.0.0.1:3000/mcp

HTTP Headers
Name: Authorization
Value: Bearer replace-with-a-random-secret
```

### Environment variable

```bash
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"
```

```text
Name: SQLTunnel
Type: Streamable HTTP
URL: http://127.0.0.1:3000/mcp
Bearer Token Environment Variable: SQLTUNNEL_API_KEY
```

## CLI

Choose either plaintext configuration or environment-variable configuration.

### Plaintext configuration

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.sqltunnel]
url = "http://127.0.0.1:3000/mcp"
http_headers = { Authorization = "Bearer replace-with-a-random-secret" }
```

### Environment variable

```bash
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"

codex mcp add sqltunnel \
  --url "http://127.0.0.1:3000/mcp" \
  --bearer-token-env-var SQLTUNNEL_API_KEY
```

## Usage

First tell Codex:

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
