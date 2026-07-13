# Codex の設定

## デスクトップアプリ

**Settings → MCP servers → Add server** を開きます。

平文設定または環境変数設定のどちらかを選択します。

### 平文設定

```text
Name: SQLTunnel
Type: Streamable HTTP
URL: http://127.0.0.1:3000/mcp
Bearer Token Environment Variable: 空欄

HTTP Headers
Name: Authorization
Value: Bearer replace-with-a-random-secret
```

### 環境変数

```bash
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"
```

```text
Name: SQLTunnel
Type: Streamable HTTP
URL: http://127.0.0.1:3000/mcp
Bearer Token Environment Variable: SQLTUNNEL_API_KEY
HTTP Headers: 空欄（ヘッダーを追加しない）
```

## CLI

平文設定または環境変数設定のどちらかを選択します。

### 平文設定

次の内容を `~/.codex/config.toml` に追加します。

```toml
[mcp_servers.sqltunnel]
url = "http://127.0.0.1:3000/mcp"
http_headers = { Authorization = "Bearer replace-with-a-random-secret" }
```

### 環境変数

```bash
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"

codex mcp add sqltunnel \
  --url "http://127.0.0.1:3000/mcp" \
  --bearer-token-env-var SQLTUNNEL_API_KEY
```

## 使い方

まず Codex に次のように伝えます。

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
