# Codex 配置

## 桌面端

打开 **Settings → MCP servers → Add server**。

明文配置和环境变量配置二选一。

### 明文配置

```text
Name: SQLTunnel
Type: Streamable HTTP
URL: http://127.0.0.1:3000/mcp

HTTP Headers
Name: Authorization
Value: Bearer replace-with-a-random-secret
```

### 环境变量

```bash
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"
```

```text
Name: SQLTunnel
Type: Streamable HTTP
URL: http://127.0.0.1:3000/mcp
Bearer Token Environment Variable: SQLTUNNEL_API_KEY
```

## CLI

明文配置和环境变量配置二选一。

### 明文配置

在 `~/.codex/config.toml` 中添加：

```toml
[mcp_servers.sqltunnel]
url = "http://127.0.0.1:3000/mcp"
http_headers = { Authorization = "Bearer replace-with-a-random-secret" }
```

### 环境变量

```bash
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"

codex mcp add sqltunnel \
  --url "http://127.0.0.1:3000/mcp" \
  --bearer-token-env-var SQLTUNNEL_API_KEY
```

## 使用

先告诉 Codex：

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
