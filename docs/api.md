# SQLTunnel API Reference

[Back to README](../README.md) | [Configuration reference](configuration.md) | [Dify setup guide](dify.md)

## API

For Dify-specific setup, see [dify.md](dify.md).

### GET /health

Checks whether the service is alive.

Request parameters: none.

Success response:

```json
{
  "status": "ok"
}
```

### GET /openapi.json

Returns the OpenAPI document.

Request parameters: none.

Success response: JSON based on `openapi.json`, with `servers` added from the current request URL. Behind a reverse proxy, `X-Forwarded-Proto` and `X-Forwarded-Host` are used to infer the external URL.

### POST /db-servers

Returns db servers accessible to the current client.

Request header:

- `X-SQLTunnel-API-Key`: Required. Client API key.

Request body: can be omitted or an empty JSON object.

```json
{}
```

Success response:

```json
{
  "dbServers": [
    {
      "id": "prod-postgres",
      "type": "postgres",
      "permission": "read",
      "maxRows": 500,
      "queryTimeoutMs": 5000,
      "connectTimeoutMs": 10000,
      "ssh": false
    }
  ]
}
```

Response fields:

- `dbServers[].id`: Db server id, used as `dbServerId` in query requests.
- `dbServers[].type`: Database type: `mysql` or `postgres`.
- `dbServers[].permission`: Client permission on this db server: `read` or `write`.
- `dbServers[].maxRows`: Effective max rows for this client on this db server.
- `dbServers[].queryTimeoutMs`: Effective query timeout for this client on this db server.
- `dbServers[].connectTimeoutMs`: Effective SSH tunnel and database connection timeout for this db server.
- `dbServers[].ssh`: Whether this db server is reached through an SSH tunnel.

### POST /query

Executes a SQL query.

Request body:

```json
{
  "dbServerId": "prod-postgres",
  "sql": "select * from users limit 10",
  "params": [],
  "maxRows": 100,
  "responseFormat": "json"
}
```

Request fields:

- Header `X-SQLTunnel-API-Key`: Required. Client API key.
- `dbServerId`: Required. Target db server id.
- `sql`: Required. SQL to execute.
- `params`: Optional. SQL parameter array. Default: `[]`.
- `maxRows`: Optional. Requested max rows for this query. The effective value cannot exceed configured server/client limits.
- `responseFormat`: Optional. `raw` or `json`. Default: `raw`.

With default `responseFormat: "raw"`, the response is `text/plain`:

- Single-column result: one raw value per line.
- Multi-column result: TSV text with column names on the first line.

With `responseFormat: "json"`, the response is structured JSON:

```json
{
  "columns": ["id", "name"],
  "rows": [
    { "id": 1, "name": "Alice" }
  ],
  "rowCount": 1,
  "durationMs": 24,
  "dbServerId": "prod-postgres"
}
```

Response fields:

- `columns`: Result column names.
- `rows`: Result rows.
- `rowCount`: Number of returned rows.
- `durationMs`: Query duration in milliseconds.
- `dbServerId`: Db server used for this query.

Permissions and limits:

- `permission: read` allows read-only SQL such as `select`, `with`, `show`, `describe`, and `explain`.
- `permission: write` allows both read and write SQL.
- Multi-statement SQL is treated as non-read-only SQL.
- Queries always enforce `maxRows` and `queryTimeoutMs`.
- SSH tunnel setup and database connection use `connectTimeoutMs`; SQL execution uses `queryTimeoutMs`.

Error response format:

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable message",
  "requestId": "req-1"
}
```
