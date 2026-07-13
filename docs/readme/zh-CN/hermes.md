# Hermes 配置

在 `~/.hermes/config.yaml` 中添加 SQLTunnel。明文配置和环境变量配置二选一。

## 明文配置

```yaml
mcp_servers:
  sqltunnel:
    url: "http://127.0.0.1:3000/mcp"
    headers:
      Authorization: "Bearer replace-with-a-random-secret"
    enabled: true
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

## 环境变量

在 `~/.hermes/.env` 中添加：

```dotenv
SQLTUNNEL_MCP_URL=http://127.0.0.1:3000/mcp
SQLTUNNEL_API_KEY=replace-with-a-random-secret
```

然后在 `~/.hermes/config.yaml` 中添加：

```yaml
mcp_servers:
  sqltunnel:
    url: "${SQLTUNNEL_MCP_URL}"
    headers:
      Authorization: "Bearer ${SQLTUNNEL_API_KEY}"
    enabled: true
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

## 使用

测试服务并启动 Hermes：

```bash
hermes mcp test sqltunnel
hermes chat
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
