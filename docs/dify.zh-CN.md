# Dify 配置

## MCP 服务

在 Dify 工作空间的工具管理页面添加 HTTP MCP 服务。不同 Dify 版本的菜单名称可能略有差异。

```text
名称：SQLTunnel
服务器标识符：sqltunnel
服务端点 URL：http://sqltunnel:3000/mcp

认证
动态客户端注册：关闭
客户端 ID：留空
客户端密钥：留空

请求头
名称：Authorization
值：Bearer replace-with-a-random-secret
```

请使用 Dify 运行环境能够访问的 URL，例如：

- Dify 与 SQLTunnel 在同一个 Docker 网络：`http://sqltunnel:3000/mcp`
- Dify 在 Docker、SQLTunnel 在宿主机：`http://host.docker.internal:3000/mcp`
- Dify Cloud 或远程部署：`https://sqltunnel.example.com/mcp`

连接后，在 Agent 应用中启用 SQLTunnel 的四个工具。

## 使用

在 Agent Instructions 中添加：

```text
你可以使用 SQLTunnel 查询数据库。生成 SQL 前，先查看可访问的数据库、表和相关表结构。不要猜测 Schema 或字段名。
```

之后直接使用自然语言提出需求，例如：

```text
列出我可以访问的数据库。
```

```text
查看 prod-postgres 中有哪些表。
```

```text
查询最近 10 条订单。先查看相关表结构，再执行查询。
```

## Workflow 和 Chatflow

需要模型自主选择表并生成 SQL 时，使用 Agent 节点。SQL 固定时，可在工具节点中调用 `query_database`：

```json
{
  "dbServerId": "prod-postgres",
  "sql": "select id, status from orders where id = $1",
  "params": [123],
  "maxRows": 10
}
```

PostgreSQL 参数占位符使用 `$1`、`$2`；MySQL 使用 `?`。
