# Dify configuration

## MCP server

Open the tool management page in the Dify workspace and add an HTTP MCP server. Menu labels may vary slightly by Dify version.

```text
Name: SQLTunnel
Server identifier: sqltunnel
Server endpoint URL: http://sqltunnel:3000/mcp

Authentication
Dynamic client registration: Disabled
Client ID: Leave blank
Client Secret: Leave blank

Headers
Name: Authorization
Value: Bearer replace-with-a-random-secret
```

Use a URL reachable from Dify. For example:

- Dify and SQLTunnel on the same Docker network: `http://sqltunnel:3000/mcp`
- Dify in Docker and SQLTunnel on the host: `http://host.docker.internal:3000/mcp`
- Dify Cloud or a remote deployment: `https://sqltunnel.example.com/mcp`

After connecting, enable all four SQLTunnel tools in an Agent app.

## Usage

Add this to the Agent instructions:

```text
You can use SQLTunnel to query databases. Inspect the available databases, tables, and relevant table schemas before generating SQL. Do not guess schema or column names.
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

## Workflow and Chatflow

Use an Agent node when the model should select tables and generate SQL. For fixed SQL, call `query_database` from a tool node:

```json
{
  "dbServerId": "prod-postgres",
  "sql": "select id, status from orders where id = $1",
  "params": [123],
  "maxRows": 10
}
```

PostgreSQL placeholders use `$1`, `$2`; MySQL uses `?`.
