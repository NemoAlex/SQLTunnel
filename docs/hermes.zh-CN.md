# 在 Hermes 中使用 SQLTunnel MCP

[返回 README](../README.zh-CN.md) | [MCP 工具说明](../README.zh-CN.md#mcp-接口) | [配置参考](configuration.zh-CN.md)

Hermes Agent 可通过 `~/.hermes/config.yaml` 连接远程 Streamable HTTP MCP 服务。本指南把 SQLTunnel 地址和 Bearer Token 保存在 `~/.hermes/.env`，并仅向 Hermes 开放 SQLTunnel 的四个工具。

## 前置条件

- SQLTunnel MCP URL 可从 Hermes 所在环境访问。
- `gateway.yaml` 中已为 Hermes 创建独立 client。
- 已安装 Hermes Agent。

推荐使用只读 client：

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

## 保存地址和 Token

在 `~/.hermes/.env` 中添加：

```dotenv
SQLTUNNEL_MCP_URL=http://127.0.0.1:3000/mcp
SQLTUNNEL_API_KEY=replace-with-a-random-secret
```

保护好该文件，不要提交到仓库。远程部署应使用 HTTPS 地址。

## 配置 MCP 服务

在 `~/.hermes/config.yaml` 中添加：

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

`supports_parallel_tool_calls: false` 是较保守的默认值，因为当 SQLTunnel client 拥有写权限时，`query_database` 可能执行写入。元数据读取仍然较快，因为 SQLTunnel 会按照 `defaults.schemaCacheTtlMs` 缓存 Schema。

SQLTunnel 当前只提供 tools，因此关闭 resources 和 prompts。

## 验证

在运行 Hermes 的同一环境中测试连接：

```bash
hermes mcp test sqltunnel
```

然后启动新会话：

```bash
hermes chat
```

如果 Hermes 会话已经运行，输入 `/reload-mcp` 重新加载配置。

Hermes 会在远程 MCP 工具名前添加服务器标识符。最终注册的名称应为：

- `mcp_sqltunnel_list_db_servers`
- `mcp_sqltunnel_list_database_tables`
- `mcp_sqltunnel_get_table_schema`
- `mcp_sqltunnel_query_database`

## 推荐提示词

```text
使用 SQLTunnel 查看我可以访问的数据库。先获取表清单和相关表结构，再生成只读 SQL。不要猜测 schema 或字段名，最多返回 100 行。
```

预期的逻辑调用顺序：

```text
list_db_servers
→ list_database_tables
→ get_table_schema
→ query_database
```

## 网络环境

- Hermes 和 SQLTunnel 在同一台机器：`http://127.0.0.1:3000/mcp`
- Hermes 在 Docker 中：使用容器可访问的宿主机地址或 Docker service name。
- 远程 SQLTunnel：使用 HTTPS，例如 `https://sqltunnel.example.com/mcp`。

Hermes 和 SQLTunnel 位于不同容器或机器时，不要使用 `127.0.0.1`。

## 常见问题

### 连接测试失败

- 确认 URL 以 `/mcp` 结尾。
- 确认 Hermes 已从 `~/.hermes/.env` 加载两个环境变量。
- 从 Hermes 所在主机或容器测试该 URL。
- 检查反向代理、防火墙、DNS 和 TLS 证书。

### 返回 UNAUTHENTICATED

- 确认 header 为 `Authorization: Bearer ${SQLTUNNEL_API_KEY}`。
- 确认 `.env` 中的值与 `gateway.yaml` 里 Hermes client 的 `apiKey` 一致。
- 修改 `gateway.yaml` 后重启 SQLTunnel。

### 工具没有出现

运行 `hermes mcp test sqltunnel`，然后启动新会话或执行 `/reload-mcp`。确认 `tools.include` 中的名称与 SQLTunnel 工具名完全一致。

### 返回 FORBIDDEN 或 DB_SERVER_NOT_FOUND

检查 Hermes client 的 `dbServers` 授权，以及工具调用选择的 `dbServerId`。

## 禁用服务

在 `mcp_servers.sqltunnel` 下设置 `enabled: false`，或删除整个 `sqltunnel` 配置块，然后重新加载 MCP。

## 安全建议

- 使用独立的只读 SQLTunnel client 和数据库只读账号。
- 将 API key 保存在 `~/.hermes/.env`，不要直接写进 `config.yaml`。
- 使用足够长的随机 API key，泄露后立即轮换。
- 所有远程连接都使用 HTTPS。
- 只有 Agent 确实需要时才授予写权限。

参考：[Hermes MCP 使用指南](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp)和 [MCP 配置参考](https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference)。
