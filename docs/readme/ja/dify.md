# Dify の設定

## MCP サーバー

Dify ワークスペースのツール管理画面で HTTP MCP サーバーを追加します。Dify のバージョンによりメニュー名が多少異なる場合があります。

```text
名前: SQLTunnel
サーバー識別子: sqltunnel
サーバーエンドポイント URL: http://sqltunnel:3000/mcp

認証
動的クライアント登録: 無効
クライアント ID: 空欄
クライアントシークレット: 空欄

ヘッダー
名前: Authorization
値: Bearer replace-with-a-random-secret
```

Dify から到達できる URL を指定します。

- Dify と SQLTunnel が同じ Docker ネットワーク: `http://sqltunnel:3000/mcp`
- Dify が Docker、SQLTunnel がホスト: `http://host.docker.internal:3000/mcp`
- Dify Cloud またはリモート環境: `https://sqltunnel.example.com/mcp`

接続後、Agent アプリで SQLTunnel の 4 つのツールをすべて有効にします。

## 使い方

Agent の指示に次を追加します。

```text
SQLTunnel を使用してデータベースを照会できます。SQL を生成する前に、利用可能なデータベース、テーブル、関連するテーブルスキーマを確認してください。スキーマ名やカラム名を推測しないでください。
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

## Workflow と Chatflow

モデルにテーブル選択と SQL 生成を任せる場合は Agent ノードを使用します。固定 SQL はツールノードから `query_database` を呼び出します。

```json
{
  "dbServerId": "prod-postgres",
  "sql": "select id, status from orders where id = $1",
  "params": [123],
  "maxRows": 10
}
```

PostgreSQL のプレースホルダーは `$1`, `$2`、MySQL は `?` を使用します。
