# 在 Claude Code 中使用 SQLTunnel MCP

[返回 README](../README.zh-CN.md) | [MCP 工具说明](../README.zh-CN.md#mcp-接口) | [配置参考](configuration.zh-CN.md)

Claude Code 支持远程 Streamable HTTP MCP 服务和自定义请求头，可以直接连接 SQLTunnel。

## 前置条件

- SQLTunnel 已启动，并且 Claude Code 所在机器能访问 `http(s)://host:port/mcp`。
- `gateway.yaml` 中已为 Claude Code 创建独立 client。
- 已安装并登录 Claude Code。

推荐配置：

```yaml
clients:
  - id: claude-code
    apiKey: replace-with-a-random-secret
    dbServers:
      - serverId: prod-postgres
        permission: read
        maxRows: 500
        queryTimeoutMs: 5000
```

## 方法一：使用 CLI 添加

设置地址和 API key：

```bash
export SQLTUNNEL_MCP_URL="http://127.0.0.1:3000/mcp"
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"
```

添加到当前用户：

```bash
claude mcp add --transport http --scope user sqltunnel "$SQLTUNNEL_MCP_URL" \
  --header "Authorization: Bearer $SQLTUNNEL_API_KEY"
```

如果只想在当前项目中使用，将 `--scope user` 改成 `--scope project`。项目级配置会写入 `.mcp.json`，提交前不要把真实密钥写进仓库。

## 方法二：使用 `.mcp.json`

Claude Code 支持在 MCP URL 和 headers 中展开环境变量。项目根目录的 `.mcp.json` 可以写成：

```json
{
  "mcpServers": {
    "sqltunnel": {
      "type": "http",
      "url": "${SQLTUNNEL_MCP_URL:-http://127.0.0.1:3000/mcp}",
      "headers": {
        "Authorization": "Bearer ${SQLTUNNEL_API_KEY}"
      }
    }
  }
}
```

然后在启动 Claude Code 的环境中设置：

```bash
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"
claude
```

这种方式可以安全共享 MCP 配置结构，而不提交真实 API key。

## 验证

查看配置：

```bash
claude mcp list
claude mcp get sqltunnel
```

进入 Claude Code 后执行：

```text
/mcp
```

应看到 SQLTunnel 和四个工具：

- `list_db_servers`
- `list_database_tables`
- `get_table_schema`
- `query_database`

首次使用项目级 MCP 配置时，Claude Code 会要求确认信任该服务器。

## 推荐用法

可直接提问：

```text
使用 SQLTunnel 列出我可以访问的数据库和表，不要查询业务数据。
```

完整查询示例：

```text
先检查 prod-postgres 中 public.orders 的表结构，再统计最近 7 天每天的订单数量。只执行只读 SQL，最多返回 100 行。
```

Claude Code 应按以下顺序调用：

```text
list_db_servers
→ list_database_tables
→ get_table_schema
→ query_database
```

## 网络地址

- Claude Code 与 SQLTunnel 在同一台机器：`http://127.0.0.1:3000/mcp`
- Claude Code 在容器中：使用容器可访问的服务名或宿主机地址。
- 远程 SQLTunnel：使用 `https://sqltunnel.example.com/mcp`。

不要把远程服务器错误配置成 `localhost`。

## 常见问题

### Connection closed 或连接失败

- 确认使用 `--transport http`，而不是 SSE 或 stdio。
- 确认 URL 以 `/mcp` 结尾。
- 使用 `curl` 或浏览器之外的同一运行环境检查网络可达性。

### UNAUTHENTICATED

确认 header 的值为 `Bearer ${SQLTUNNEL_API_KEY}`，并检查启动 Claude Code 的进程是否能读取 `SQLTUNNEL_API_KEY`。

### 工具没有出现

运行 `claude mcp get sqltunnel`，重新启动 Claude Code，并在 `/mcp` 中查看连接错误。

### 删除配置

```bash
claude mcp remove sqltunnel
```

## 安全建议

- 默认使用只读 client 和只读数据库账号。
- 用环境变量保存 API key。
- 审查项目中的 `.mcp.json` 后再授权。
- 远程连接使用 HTTPS。

参考：[Claude Code MCP 官方文档](https://docs.anthropic.com/en/docs/claude-code/mcp)。
