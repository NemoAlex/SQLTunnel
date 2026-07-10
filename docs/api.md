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

### POST /schema

Provides database, table, and table-schema metadata through an explicit `operation`. The `X-SQLTunnel-API-Key` request header is required.

List databases available to the current client:

```json
{
  "operation": "list_databases"
}
```

The response includes the db server id, actual database name, type, and permission:

```json
{
  "operation": "list_databases",
  "databases": [
    {
      "dbServerId": "prod-postgres",
      "databaseName": "app",
      "databaseType": "postgres",
      "permission": "read"
    }
  ]
}
```

List tables and views in one database:

```json
{
  "operation": "list_tables",
  "dbServerId": "prod-postgres",
  "refresh": false
}
```

The response is a compact table list. Copy `schemaName` and `tableName` into the describe operation:

```json
{
  "operation": "list_tables",
  "dbServerId": "prod-postgres",
  "databaseName": "app",
  "databaseType": "postgres",
  "tables": [
    {
      "schemaName": "public",
      "tableName": "users",
      "type": "table",
      "comment": "Application users"
    }
  ],
  "cached": false,
  "cachedAt": "2026-07-10T00:00:00.000Z"
}
```

Describe one table or view:

```json
{
  "operation": "describe_table",
  "dbServerId": "prod-postgres",
  "schemaName": "public",
  "tableName": "users"
}
```

The response's `table` contains `columns` with types, nullability, defaults, comments, primary-key membership, and unique-constraint membership. `unique` means the column participates in a primary-key or unique constraint; every member of a composite constraint is marked `true`.

For MySQL, `schemaName` is the configured database name. PostgreSQL uses the actual schema name. Schema metadata is cached for five minutes by default; both `list_tables` and `describe_table` accept `refresh: true`. Configure or disable caching with `defaults.schemaCacheTtlMs`. Successful writes or DDL statements executed through SQLTunnel invalidate the corresponding cache entry. A database schema is limited to 20,000 cached columns; larger schemas return `SCHEMA_TOO_LARGE`.

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
