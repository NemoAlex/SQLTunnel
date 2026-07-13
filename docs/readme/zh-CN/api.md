# SQLTunnel API 参考

[返回 README](README.md) | [配置参考](configuration.md) | [Dify 配置指南](dify.md)

## API

面向 Dify 的配置和调用说明见 [Dify 配置指南](dify.md)。

### GET /health

检查服务是否存活。

请求参数：无。

成功响应：

```json
{
  "status": "ok"
}
```

### GET /openapi.json

返回 OpenAPI 文档。

请求参数：无。

成功响应：基于 `openapi.json` 的 JSON 内容，并自动加入当前请求地址对应的 `servers`。如果服务在反向代理后面，优先使用 `X-Forwarded-Proto` 和 `X-Forwarded-Host` 推断外部访问地址。

### POST /schema

通过 `operation` 提供数据库、表和表结构元数据。请求 header `Authorization: Bearer <SQLTUNNEL_API_KEY>` 必填。

列出当前 client 可以访问的数据库：

```json
{
  "operation": "list_databases"
}
```

响应包含 `dbServerId`、真实数据库名、数据库类型和权限：

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

列出指定数据库的表和视图：

```json
{
  "operation": "list_tables",
  "dbServerId": "prod-postgres",
  "refresh": false
}
```

响应只返回精简表清单，其中 `schemaName` 和 `tableName` 可直接用于下一步：

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

获取一张表或视图的完整结构：

```json
{
  "operation": "describe_table",
  "dbServerId": "prod-postgres",
  "schemaName": "public",
  "tableName": "users"
}
```

响应中的 `table` 包含 `columns`，每个字段包含类型、可空性、默认值、注释、主键和唯一约束信息。`unique` 表示字段参与主键或唯一约束；复合约束中的每个成员字段都会标记为 `true`。

MySQL 的 `schemaName` 是配置的 database 名；PostgreSQL 使用实际 schema 名。Schema 默认缓存 5 分钟，`list_tables` 和 `describe_table` 都可传 `refresh: true` 强制刷新。缓存时间可通过 `defaults.schemaCacheTtlMs` 调整或关闭。通过 SQLTunnel 成功执行写入或 DDL 后，对应缓存会自动失效。单个数据库最多缓存 20000 个字段，超过时返回 `SCHEMA_TOO_LARGE`。

### POST /query

执行 SQL 查询。

请求 body：

```json
{
  "dbServerId": "prod-postgres",
  "sql": "select * from users limit 10",
  "params": [],
  "maxRows": 100,
  "responseFormat": "json"
}
```

请求字段：

- Header `Authorization: Bearer <SQLTUNNEL_API_KEY>`：必填。client 的 API key。
- `dbServerId`：必填。目标 db server id。
- `sql`：必填。要执行的 SQL。
- `params`：可选。SQL 参数数组，默认 `[]`。
- `maxRows`：可选。本次请求希望返回的最大行数；最终值不会超过配置中的 server/client 限制。
- `responseFormat`：可选，`raw` 或 `json`，默认 `raw`。

默认 `responseFormat: "raw"` 时返回 `text/plain`：

- 单列结果：每行一个原始值。
- 多列结果：TSV 文本，第一行为列名。

传 `responseFormat: "json"` 时返回结构化 JSON 对象：

成功响应：

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

响应字段：

- `columns`：结果列名。
- `rows`：结果行数组。
- `rowCount`：返回行数。
- `durationMs`：查询耗时，单位毫秒。
- `dbServerId`：本次查询使用的 db server id。

权限和限制：

- `permission: read` 只允许只读 SQL，例如 `select`、`with`、`show`、`describe`、`explain`。
- `permission: write` 允许读写 SQL。
- 多语句 SQL 会被当作非只读 SQL 处理。
- 查询会强制套用 `maxRows` 和 `queryTimeoutMs`。
- SSH tunnel 建立和数据库连接使用 `connectTimeoutMs`；SQL 执行使用 `queryTimeoutMs`。

错误返回格式：

```json
{
  "code": "ERROR_CODE",
  "message": "人类可读的消息",
  "requestId": "req-1"
}
```
