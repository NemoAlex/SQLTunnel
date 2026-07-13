# SQLTunnel API リファレンス

[README に戻る](README.md) | [設定リファレンス](configuration.md) | [Dify 設定ガイド](dify.md)

## API

Dify 専用の設定は [dify.md](dify.md) を参照してください。

### GET /health

サービスが稼働しているかを確認します。

リクエストパラメータ: なし。

成功レスポンス:

```json
{
  "status": "ok"
}
```

### GET /openapi.json

OpenAPI ドキュメントを返します。

リクエストパラメータ: なし。

成功レスポンス: 現在のリクエスト URL に `servers` を追加した `openapi.json` ベースの JSON です。リバースプロキシの後ろでは、`X-Forwarded-Proto` と `X-Forwarded-Host` を使って外部 URL を推定します。

### POST /schema

データベース、テーブル、テーブルスキーマのメタデータを `operation` 指定で取得します。`Authorization: Bearer <SQLTUNNEL_API_KEY>` リクエストヘッダーが必要です。

現在のクライアントが利用できるデータベースを一覧表示:

```json
{
  "operation": "list_databases"
}
```

レスポンスにはデータベースサーバー ID、実際のデータベース名、タイプ、権限が含まれます:

```json
{
  "operation": "list_databases",
  "databases": [
    {
      "dbServerId": "prod-postgres",
      "databaseName": "app",
      "databaseType": "postgres",
      "permission": "read"
    }
  ]
}
```

1 つのデータベース内のテーブルとビューを一覧表示:

```json
{
  "operation": "list_tables",
  "dbServerId": "prod-postgres",
  "refresh": false
}
```

レスポンスはコンパクトなテーブル一覧です。`schemaName` と `tableName` を describe 操作にコピーします:

```json
{
  "operation": "list_tables",
  "dbServerId": "prod-postgres",
  "databaseName": "app",
  "databaseType": "postgres",
  "tables": [
    {
      "schemaName": "public",
      "tableName": "users",
      "type": "table",
      "comment": "アプリケーションユーザー"
    }
  ],
  "cached": false,
  "cachedAt": "2026-07-10T00:00:00.000Z"
}
```

1 つのテーブルまたはビューを詳細表示:

```json
{
  "operation": "describe_table",
  "dbServerId": "prod-postgres",
  "schemaName": "public",
  "tableName": "users"
}
```

レスポンスの `table` には `columns` が含まれ、型、NULL 可否、デフォルト値、コメント、主キー制約の所属、一意制約の所属が含まれます。`unique` は、主キーまたは一意制約に含まれる列を意味します。複合制約のすべてのメンバーは `true` とマークされます。

MySQL の場合、`schemaName` は設定されたデータベース名です。PostgreSQL は実際のスキーマ名を使用します。スキーマメタデータはデフォルトで 5 分間キャッシュされます。`list_tables` と `describe_table` の両方で `refresh: true` を指定できます。キャッシュの設定または無効化は `defaults.schemaCacheTtlMs` で行います。SQLTunnel 経由で実行された成功した書き込みまたは DDL ステートメントは、対応するキャッシュエントリを無効化します。データベーススキーマはキャッシュ列数が 20,000 列に制限されており、それを超える場合は `SCHEMA_TOO_LARGE` を返します。

### POST /query

SQL クエリを実行します。

リクエスト本文:

```json
{
  "dbServerId": "prod-postgres",
  "sql": "select * from users limit 10",
  "params": [],
  "maxRows": 100,
  "responseFormat": "json"
}
```

リクエストフィールド:

- ヘッダー `Authorization: Bearer <SQLTUNNEL_API_KEY>`: 必須。クライアント API キー。
- `dbServerId`: 必須。対象のデータベースサーバー ID。
- `sql`: 必須。実行する SQL。
- `params`: 任意。SQL パラメータ配列。デフォルト: `[]`。
- `maxRows`: 任意。このクエリの最大行数リクエスト。設定済みのサーバー/クライアント制限を超えることはできません。
- `responseFormat`: 任意。`raw` または `json`。デフォルト: `raw`。

デフォルトの `responseFormat: "raw"` の場合、レスポンスは `text/plain` です:

- 単一列の結果: 1 行に 1 つの生の値。
- 複数列の結果: 1 行目に列名が入る TSV テキスト。

`responseFormat: "json"` の場合、レスポンスは構造化された JSON です:

```json
{
  "columns": ["id", "name"],
  "rows": [
    { "id": 1, "name": "Alice" }
  ],
  "rowCount": 1,
  "durationMs": 24,
  "dbServerId": "prod-postgres"
}
```

レスポンスフィールド:

- `columns`: 結果の列名。
- `rows`: 結果の行。
- `rowCount`: 返された行数。
- `durationMs`: クエリ実行時間（ミリ秒）。
- `dbServerId`: このクエリで使用されたデータベースサーバー。

権限と制限:

- `permission: read` は `select`、`with`、`show`、`describe`、`explain` などの読み取り専用 SQL を許可します。
- `permission: write` は読み取りと書き込みの両方の SQL を許可します。
- 複数ステートメントを含む SQL は読み取り専用 SQL として扱われません。
- クエリは常に `maxRows` と `queryTimeoutMs` を強制します。
- SSH トンネルのセットアップとデータベース接続には `connectTimeoutMs` を、SQL 実行には `queryTimeoutMs` を使用します。

エラーレスポンス形式:

```json
{
  "code": "ERROR_CODE",
  "message": "人が読めるエラーメッセージ",
  "requestId": "req-1"
}
```
