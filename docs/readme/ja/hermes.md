# Hermes の設定

SQLTunnel を `~/.hermes/config.yaml` に追加します。平文設定または環境変数設定を選択できます。

## 平文設定

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

## 環境変数

`~/.hermes/.env` に追加します。

```dotenv
SQLTUNNEL_MCP_URL=http://127.0.0.1:3000/mcp
SQLTUNNEL_API_KEY=replace-with-a-random-secret
```

続いて、`~/.hermes/config.yaml` に次の内容を追加します。

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

## 使い方

```bash
hermes mcp test sqltunnel
hermes chat
```

その後、各リクエストを自然言語で指示します。例:

```text
アクセスできるデータベースを一覧表示してください。
```

```text
prod-postgres のテーブルを一覧表示してください。
```

```text
最新の注文を 10 件取得してください。クエリを実行する前に、関連するテーブルスキーマを確認してください。
```
