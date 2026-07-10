# 在 Dify 中使用 SQLTunnel MCP

[返回 README](../README.zh-CN.md) | [API 参考](api.zh-CN.md) | [配置参考](configuration.zh-CN.md)

本文说明如何把 SQLTunnel 作为远程 HTTP MCP 服务添加到 Dify。无需导入 `openapi.json`；Dify 会通过 MCP 自动发现 SQLTunnel 的工具定义。

## 前置条件

准备以下信息：

- Dify 能访问的 SQLTunnel MCP URL，例如 `https://sqltunnel.example.com/mcp`。
- 一个为 Dify 单独创建的 SQLTunnel API key。
- 这个 client 被授权访问的 db server。

推荐使用只读 client：

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

## 选择 MCP URL

URL 必须指向 `/mcp`，并且从 Dify 的运行环境可达：

- Dify 与 SQLTunnel 在同一个 Docker 网络：`http://sqltunnel:3000/mcp`
- Dify 在 Docker、SQLTunnel 在宿主机：`http://host.docker.internal:3000/mcp`
- Dify Cloud 或远程部署：`https://sqltunnel.example.com/mcp`

不要在 Dify Cloud 或 Dify 容器中填写 `localhost` 或 `127.0.0.1`；它们指向 Dify 自己，而不是 SQLTunnel。远程部署应使用 HTTPS。

## 添加 MCP 服务

在 Dify 工作空间的工具管理页面选择添加 MCP 服务，并选择 HTTP 类型。不同 Dify 版本的菜单名称可能略有差异。

填写：

- 服务端点 URL：`https://sqltunnel.example.com/mcp`
- 名称：`SQLTunnel`
- 服务器标识符：`sqltunnel`

在“认证”页：

- 关闭“使用动态客户端注册”。
- 客户端 ID 和客户端密钥留空。

SQLTunnel 使用静态 Bearer Token，不使用 MCP OAuth 授权流程或动态客户端注册。

在“请求头”页新增：

```text
Authorization: Bearer replace-with-a-random-secret
```

“配置”页通常保持默认。保存并连接后，Dify 应发现四个工具：

- `list_db_servers`
- `list_database_tables`
- `get_table_schema`
- `query_database`

## 在 Agent 中使用

创建或打开一个 Agent 应用，在工具列表中启用 SQLTunnel 的四个 MCP 工具。推荐让 Agent 按以下顺序工作：

1. 不确定数据库时调用 `list_db_servers`。
2. 调用 `list_database_tables` 获取精简表清单。
3. 调用 `get_table_schema` 获取相关表的字段结构。
4. 生成 SQL 后调用 `query_database`。

可使用以下 Instructions / System Prompt：

```text
你是一个谨慎的数据库查询助手，可以通过 SQLTunnel MCP 查询数据库。

规则：
- 只有用户的问题需要数据库数据时才调用 SQLTunnel。
- 不确定 dbServerId 时，先调用 list_db_servers。
- 生成 SQL 前，先调用 list_database_tables；只对相关表调用 get_table_schema。
- schemaName 和 tableName 必须从工具结果中原样复制，不要猜测。
- 默认只执行 SELECT、WITH、SHOW、DESCRIBE 或 EXPLAIN。
- 使用明确字段名和必要的 WHERE 条件，避免 SELECT *。
- 控制 maxRows，只获取回答问题所需的数据。
- 不要泄露 API key、请求头、数据库密码或 SSH 配置。
- 工具报错时，解释错误代码，不要反复使用相同错误参数重试。
```

如果应用只使用一个固定数据库，可在 Instructions 中明确默认 `dbServerId`，但仍建议保留 `list_database_tables` 和 `get_table_schema` 的发现流程。

## 在 Workflow / Chatflow 中使用

如果流程需要模型自主选择表和生成 SQL，使用 Agent 节点并启用 SQLTunnel MCP 工具。

如果 SQL 是固定的，可以直接在工具节点中调用 `query_database`，传入固定或变量化参数：

```json
{
  "dbServerId": "prod-postgres",
  "sql": "select id, status from orders where id = $1",
  "params": [123],
  "maxRows": 10
}
```

PostgreSQL 参数占位符使用 `$1`、`$2`；MySQL 使用 `?`。

## 验证

连接后可向 Agent 提问：

```text
先列出你可以访问的数据库和表，不要执行数据查询。
```

然后测试完整调用：

```text
查看 prod-postgres 中 public.users 的字段结构，再统计用户总数。
```

在 Dify 的运行日志中确认调用顺序和工具参数。

## 常见问题

### 无法连接 MCP URL

- 确认 URL 以 `/mcp` 结尾。
- 从 Dify 容器或服务器测试该 URL，而不是只在浏览器中测试。
- 检查 Docker 网络、DNS、防火墙、反向代理和 HTTPS 证书。

### 返回 UNAUTHENTICATED

- 确认请求头为 `Authorization: Bearer <SQLTUNNEL_API_KEY>`。
- 确认没有把 API key 填到 OAuth 客户端密钥字段。
- 确认 `gateway.yaml` 中存在相同的 API key，并已重启 SQLTunnel。

### 返回 FORBIDDEN 或 DB_SERVER_NOT_FOUND

检查 Dify client 的 `dbServers` 授权，以及工具调用使用的 `dbServerId`。

### 表结构没有及时更新

`list_database_tables` 或 `get_table_schema` 传入 `refresh: true`。默认缓存时间由 `defaults.schemaCacheTtlMs` 控制。

## 安全建议

- 为 Dify 使用独立 API key 和只读数据库账号。
- 限制 `maxRows` 和 `queryTimeoutMs`。
- 不要把生产 API key 写进应用 Prompt。
- 远程访问使用 HTTPS，并限制 SQLTunnel 的网络入口。
- 只有明确需要时才授予 `write` 权限。

参考：[Dify 文档](https://docs.dify.ai/)。
