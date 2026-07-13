# Claude Code の設定

## CLI

平文設定または環境変数設定のどちらかを選択します。

### 平文設定

```bash
claude mcp add --transport http --scope user sqltunnel \
  "http://127.0.0.1:3000/mcp" \
  --header "Authorization: Bearer replace-with-a-random-secret"
```

### 環境変数

```bash
export SQLTUNNEL_MCP_URL="http://127.0.0.1:3000/mcp"
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"

claude mcp add --transport http --scope user sqltunnel "$SQLTUNNEL_MCP_URL" \
  --header "Authorization: Bearer $SQLTUNNEL_API_KEY"
```

現在のプロジェクトだけに追加する場合は `--scope user` を `--scope project` に置き換えます。

## プロジェクト設定

プロジェクトルートの `.mcp.json` で、平文設定または環境変数設定のどちらかを選択します。

### 平文設定

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

### 環境変数

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

実際の API キーを `.mcp.json` にコミットしないでください。

## 使い方

まず Claude Code に次のように伝えます。

```text
SQLTunnel を使用してデータベースを照会できます。
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
