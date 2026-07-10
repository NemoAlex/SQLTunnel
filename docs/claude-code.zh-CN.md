# Claude Code 配置

## CLI

明文配置和环境变量配置二选一。

### 明文配置

```bash
claude mcp add --transport http --scope user sqltunnel \
  "http://127.0.0.1:3000/mcp" \
  --header "Authorization: Bearer replace-with-a-random-secret"
```

### 环境变量

```bash
export SQLTUNNEL_MCP_URL="http://127.0.0.1:3000/mcp"
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"

claude mcp add --transport http --scope user sqltunnel "$SQLTUNNEL_MCP_URL" \
  --header "Authorization: Bearer $SQLTUNNEL_API_KEY"
```

如果只想在当前项目中添加服务，将 `--scope user` 改成 `--scope project`。

## 项目配置

在项目根目录的 `.mcp.json` 中，明文配置和环境变量配置二选一。

### 明文配置

```json
{
  "mcpServers": {
    "sqltunnel": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp",
      "headers": {
        "Authorization": "Bearer replace-with-a-random-secret"
      }
    }
  }
}
```

### 环境变量

```bash
export SQLTUNNEL_MCP_URL="http://127.0.0.1:3000/mcp"
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"
```

```json
{
  "mcpServers": {
    "sqltunnel": {
      "type": "http",
      "url": "${SQLTUNNEL_MCP_URL}",
      "headers": {
        "Authorization": "Bearer ${SQLTUNNEL_API_KEY}"
      }
    }
  }
}
```

不要在 `.mcp.json` 中提交真实 API key。

## 使用

先告诉 Claude Code：

```text
你可以使用 SQLTunnel 查询数据库。
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
