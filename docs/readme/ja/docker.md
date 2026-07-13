# Docker で SQLTunnel をデプロイする

ヘッドレス版 SQLTunnel は [Docker Hub](https://hub.docker.com/r/nemoalex/sqltunnel) で公開されており、サーバーや NAS での常時運用に適しています。

## 設定を準備する

デプロイ先のディレクトリに `compose.yaml` を作成します。

```yaml
services:
  sqltunnel:
    image: nemoalex/sqltunnel:latest
    container_name: sqltunnel
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./config:/app/config:ro
```

ポート指定では、最初の `3000` が外部公開するホスト側ポート、後の `3000` がコンテナ内部のポートです。

```text
config/
├── gateway.yaml       # SQLTunnel のメイン設定
└── ssh/               # 任意：SSH トンネル接続で使用
    ├── config          # 任意：SSH Config、Host エイリアス、ProxyJump
    └── id_rsa          # 任意：SSH 秘密鍵
```

`ssh/` ディレクトリは任意です。データベースへ直接接続する場合、または独自の SSH Config や秘密鍵が不要な場合は、`gateway.yaml` だけで構いません。

設定テンプレートをダウンロードします。

```bash
mkdir config
curl -fsSL https://raw.githubusercontent.com/NemoAlex/SQLTunnel/main/config/gateway.example.yaml \
  -o config/gateway.yaml
```

環境に合わせて編集してください。全フィールドは[設定リファレンス](configuration.md)を参照してください。

## サービスを起動する

イメージを取得してサービスを起動します。

```bash
docker compose up -d
```

サービスが正常に動作していることを確認します。

```bash
docker compose ps
docker compose logs -f sqltunnel
curl http://127.0.0.1:3000/health
```

## コンテナ環境の注意点

- `gateway.yaml` の `127.0.0.1` はホストではなく SQLTunnel コンテナ自身を指します。
- SSH Config と秘密鍵は `config/ssh/` に置き、`gateway.yaml` から相対パスで参照できます。
- `gateway.yaml` にはパスワードや API キーが含まれます。バージョン管理に追加せず、読み取り権限を制限してください。
- 外部公開時は HTTPS 対応のリバースプロキシを使用し、データベースのポートをインターネットに公開しないでください。
