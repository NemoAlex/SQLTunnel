# SQLTunnel 設定リファレンス

[README に戻る](README.md) | [API リファレンス](api.md) | [Dify 設定ガイド](dify.md)

## 設定

ヘッドレスサービスは `gateway.yaml` を使用してゲートウェイ設定を行います。

設定には 3 つの主要セクションがあります:

- `sshServers`: 再利用可能な SSH トンネルエントリ。`~/.ssh/config` と `ProxyJump` をサポートします。
- `dbServers`: データベースサーバー。データベースタイプ、アドレス、認証情報、オプションの SSH アクセスを含みます。
- `clients`: API クライアント、その API キー、各クライアントがアクセスできるデータベースサーバー。

任意のグローバルデフォルト:

- `defaults.maxRows`: デフォルトの最大行数。デフォルト: `1000`。
- `defaults.queryTimeoutMs`: デフォルトのデータベースクエリタイムアウト。デフォルト: `10000`。
- `defaults.connectTimeoutMs`: デフォルトの SSH トンネルとデータベース接続タイムアウト。デフォルト: `10000`。
- `defaults.schemaCacheTtlMs`: メモリ内のデータベーススキーマメタデータキャッシュの TTL。デフォルト: `300000`（5 分）。`0` に設定するとキャッシュを無効化します。

### 設定ファイルとパス

推奨レイアウト:

```text
config/
  gateway.yaml
  gateway.example.yaml
  ssh/                 # オプション
    config             # SSH Host エイリアス、ユーザー、ポート、ProxyJump などの設定
    id_rsa             # キーベース認証で使用する秘密鍵
```

デフォルトのファイルは `config/gateway.yaml` です。`SQLTUNNEL_CONFIG=/path/to/gateway.yaml` を設定すると、別の場所から読み込みます。

`sshConfigPath` と `privateKeyPath` の相対値は、`gateway.yaml` があるディレクトリから解決されます。これにより、完全な `config` ディレクトリを Docker 内の `/app/config` に直接マウントできます。

`gateway.yaml` にはデータベースパスワード、クライアント API キー、SSH パスワード、秘密鍵のパスが含まれる可能性があります。実際の設定をバージョン管理にコミットしないでください。ファイル権限を制限し、各クライアントには必要なデータベースと `read` または `write` アクセスのみを許可してください。

### SSH サーバー

`sshServers` は再利用可能な SSH トンネルエントリを定義します。データベースサーバーは `sshServerId` で参照します。

```yaml
sshServers:
  - id: bastion-prod
    sshConfigPath: ssh/config
    host: db-prod
    port: 22
    username: deploy
    password: optional-password
    privateKeyPath: ssh/id_rsa
    passphrase: optional-key-passphrase
    idleTimeoutMs: 60000
```

フィールド:

- `id`: 必須。`dbServers[].sshServerId` で使用される SSH サーバー id。
- `host`: 必須。実際の SSH ホスト、または SSH config の Host エイリアス。
- `sshConfigPath`: 任意。SSH config パス。相対パスは `gateway.yaml` のあるディレクトリから解決されます。省略すると、SQLTunnel は実行時のユーザーの `~/.ssh/config` を読みます。
- `port`: 任意。SSH ポート。デフォルト: `22`。
- `username`: 任意。SSH ユーザー名。デフォルト: 現在の実行ユーザー。
- `password`: 任意。パスワード認証用の SSH パスワード。
- `privateKeyPath`: 任意。秘密鍵のパス。相対パスは `gateway.yaml` のあるディレクトリから解決されます。省略すると、SQLTunnel は SSH config の `IdentityFile` または実行ユーザーの一般的なデフォルト秘密鍵を使用する場合があります。
- `passphrase`: 任意。暗号化された秘密鍵のパスフレーズ。
- `idleTimeoutMs`: 任意。アイドル SSH 接続を維持する時間。デフォルト: `60000`。
- `proxyJumps`: 任意。ProxyJump チェーン。ほとんどの場合、ProxyJump は SSH config に記述し、SQLTunnel はそこから読み取ります。

サポートされる SSH config フィールド:

- `Host`
- `HostName`
- `User`
- `Port`
- `IdentityFile`
- `ProxyJump`

SQLTunnel は上記にリストされた SSH config フィールドのみを実装しています。他の OpenSSH オプションは無視されます:

- `ProxyCommand`
- `Include`
- `HostKeyAlias`
- `LocalForward`
- `RemoteForward`
- `DynamicForward`

`host` が Host エイリアスの場合、SQLTunnel は SSH config から実際のホスト、ユーザー、ポート、秘密鍵、ProxyJump を補完できます。

Docker 向け SSH config 例:

```yaml
sshServers:
  - id: db-prod
    sshConfigPath: ssh/config
    host: db-prod
```

対応する SSH config:

```sshconfig
Host bastion-prod
  HostName bastion.example.com
  User deploy
  Port 22
  IdentityFile ~/.ssh/id_rsa

Host db-prod
  HostName 10.0.8.12
  User deploy
  ProxyJump bastion-prod
```

SQLTunnel は SSH サーバー id ごとに SSH 接続を再利用します。各クエリは新しい転送チャネルを開きます。アイドル SSH 接続は `idleTimeoutMs` 後に閉じられます。

ローカル実行時は、ssh-agent が利用可能な場合 `SSH_AUTH_SOCK` を使用します。Docker 内で ssh-agent を使用したい場合は、自分でエージェントソケットをマウントしてください。それ以外の場合は、コンテナ内で読み取り可能な秘密鍵を設定してください。

### DB サーバー

`dbServers` は SQLTunnel がアクセスできるデータベースを定義します。クライアントにはデータベースサーバー ID ごとにアクセス権を付与します。

```yaml
dbServers:
  - id: reporting-mysql
    description: 日次売上、商品パフォーマンス、コンバージョンファネル指標を含む EC 分析データベース
    type: mysql
    sshServerId: bastion-prod
    maxRows: 1000
    queryTimeoutMs: 10000
    connectTimeoutMs: 10000
    database:
      host: 127.0.0.1
      port: 3306
      user: app
      password: mysql-password
      database: app
```

フィールド:

- `id`: 必須。`clients[].dbServers[].serverId` とクエリリクエストの `dbServerId` で使用されます。
- `description`: 任意。データベースの目的と主要なデータを説明します。`list_db_servers` と `POST /schema` の `list_databases` 操作でクライアントに返されます。
- `type`: 必須。データベースタイプ: `mysql` または `postgres`。
- `sshServerId`: 任意。`sshServers[].id` を参照します。省略すると、SQLTunnel はデータベースに直接接続します。
- `maxRows`: 任意。このデータベースサーバーのデフォルト最大行数。省略すると、`defaults.maxRows` が使用されます。
- `queryTimeoutMs`: 任意。このデータベースサーバーのデフォルトクエリタイムアウト。省略すると、`defaults.queryTimeoutMs` が使用されます。
- `connectTimeoutMs`: 任意。このデータベースサーバーの SSH トンネルとデータベース接続タイムアウト。省略すると、`defaults.connectTimeoutMs` が使用されます。デフォルト: `10000`。
- `database.host`: 必須。データベースホスト。SSH トンネルを使用する場合、このアドレスは SSH サーバー側から解決されます。
- `database.port`: 必須。データベースポート。
- `database.user`: 必須。データベースユーザー名。
- `database.password`: 必須。データベースパスワード。設定ファイル内に直接保存されます。
- `database.database`: 必須。データベース名。

### クライアント

`clients` は SQLTunnel を呼び出せる外部アプリケーションと、それらがアクセスできるデータベースサーバーを定義します。

```yaml
clients:
  - id: analytics-app
    apiKey: dev-read-key
    dbServers:
      - serverId: prod-postgres
        permission: read
        maxRows: 500
        queryTimeoutMs: 5000
      - serverId: reporting-mysql
```

フィールド:

- `id`: 必須。呼び出し元を識別するクライアント id。
- `apiKey`: 必須。呼び出し元が `Authorization: Bearer <SQLTUNNEL_API_KEY>` トークンとして送信する API キー。
- `dbServers`: 必須。このクライアントがアクセスできるデータベースサーバーのリスト。
- `dbServers[].serverId`: 必須。`dbServers[].id` を参照します。
- `dbServers[].permission`: 任意。権限: `read` または `write`。デフォルトは `read` です。`read` は読み取り専用 SQL を許可し、`write` は読み取りと書き込みの両方の SQL を許可します。
- `dbServers[].maxRows`: 任意。このクライアントがこのデータベースサーバーで取得できる最大行数。省略すると、データベースサーバーまたはグローバルのデフォルトが使用されます。
- `dbServers[].queryTimeoutMs`: 任意。このクライアントがこのデータベースサーバーで使用するクエリタイムアウト。省略すると、データベースサーバーまたはグローバルのデフォルトが使用されます。
