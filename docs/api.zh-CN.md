# SQLTunnel API 参考

[返回 README](../README.zh-CN.md) | [配置参考](configuration.zh-CN.md) | [Dify 配置指南](dify.zh-CN.md)

## API

面向 Dify 的配置和调用说明见 [dify.zh-CN.md](dify.zh-CN.md)。

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

### POST /db-servers

返回当前 client 可以访问的 db servers。

请求 header：

- `X-SQLTunnel-API-Key`：必填。client 的 API key。

请求 body：可省略，也可以传空 JSON 对象。

```json
{}
```

成功响应：

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

响应字段：

- `dbServers[].id`：db server id，查询时作为 `dbServerId` 使用。
- `dbServers[].type`：数据库类型，`mysql` 或 `postgres`。
- `dbServers[].permission`：当前 client 对该 db server 的权限，`read` 或 `write`。
- `dbServers[].maxRows`：该 client 在该 db server 上的最终最大返回行数。
- `dbServers[].queryTimeoutMs`：该 client 在该 db server 上的最终查询超时时间。
- `dbServers[].connectTimeoutMs`：该 db server 的最终 SSH tunnel 建立和数据库连接超时时间。
- `dbServers[].ssh`：是否通过 SSH tunnel 连接。

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

- Header `X-SQLTunnel-API-Key`：必填。client 的 API key。
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
