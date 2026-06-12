# SQLTunnel

基于 Fastify 的 Node.js/TypeScript 数据库连接网关。它提供 REST API 用于列出已配置的连接，并直接或通过 SSH 隧道对 MySQL 或 PostgreSQL 执行受限的 SQL 查询。

## 快速开始

```bash
npm install
cp config/gateway.example.yaml config/gateway.yaml
npm run dev
```

服务默认监听 `0.0.0.0:3000`，可通过环境变量覆盖：

```bash
FASTIFY_HOST=127.0.0.1 FASTIFY_PORT=3001 npm run dev
```

## Docker Compose

```bash
cp config/gateway.example.yaml config/gateway.yaml
docker compose up --build
```

Compose 会把本地 `./config` 挂载到容器内的 `/app/config`。应用默认读取工作目录下的 `config/gateway.yaml`。

调用方法如下：

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/db-servers \
  -H 'X-SQLTunnel-API-Key: dev-read-key'

curl -X POST http://localhost:3000/query \
  -H 'X-SQLTunnel-API-Key: dev-read-key' \
  -H 'content-type: application/json' \
  -d '{
    "dbServerId": "prod-postgres",
    "sql": "select * from users limit 10",
    "params": [],
    "maxRows": 100,
    "responseFormat": "json"
  }'
```

## 配置

网关默认读取 `config/gateway.yaml`。可通过 `SQLTUNNEL_CONFIG=/path/to/gateway.yaml` 覆盖。

配置里使用两个核心概念：

- `sshServers`：可复用的 SSH 隧道配置，支持 `~/.ssh/config` 和 `ProxyJump`。
- `dbServers`：真实数据库服务器，包含数据库类型、地址、账号密码、SSH 隧道等连接信息。
- `clients`：调用网关的客户端，包含 `apiKey`，并逐个声明它能访问哪些 `dbServers`。

### SSH Servers

`sshServers` 定义可复用的 SSH 连接。db server 通过 `sshServerId` 引用它；运行时会按 SSH server id 建立连接池，同一个 id 的查询复用同一条 SSH 链路，只为每次查询打开新的转发 channel。

```yaml
sshServers:
  - id: bastion-prod
    sshConfigPath: ssh/config
    host: db-prod
    idleTimeoutMs: 60000
```

`idleTimeoutMs` 表示没有活跃查询后多久关闭 SSH 连接，默认 60000 毫秒。

如果 `host` 写的是 SSH config 中的 Host alias，网关会从 SSH config 补 `HostName`、`User`、`Port`、`IdentityFile` 和 `ProxyJump`。YAML 中显式配置的值优先。

`sshConfigPath` 用来指定 SSH config 文件。相对路径基于当前 `gateway.yaml` 所在目录解析。未配置时，默认读取运行用户的 `~/.ssh/config`。Docker 环境推荐把 SSH config 放到 `config/ssh/config`，然后写：

```yaml
sshConfigPath: ssh/config
```

例如 SSH config：

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

YAML 中可以只引用 Host alias：

```yaml
sshServers:
  - id: db-prod
    sshConfigPath: ssh/config
    host: db-prod
```

本地运行时会使用 `SSH_AUTH_SOCK` 连接 ssh-agent。容器运行时如果也想使用 agent，需要把 agent socket 挂进容器；否则请在 YAML 或 SSH config 中配置可读取的 `IdentityFile`，加密私钥还需要在 YAML 中配置 `passphrase`。

`privateKeyPath` 写相对路径时，会基于当前配置文件所在目录解析。例如默认配置文件是 `config/gateway.yaml`，则 `privateKeyPath: ssh/id_rsa` 会解析为 `config/ssh/id_rsa`。

### DB Servers

`dbServers` 定义可以连接的数据库服务器。每个 server 需要一个唯一 `id`，后续 client 用这个 `id` 引用它。

```yaml
dbServers:
  - id: prod-postgres
    type: postgres
    maxRows: 1000
    timeoutMs: 10000
    database:
      host: 127.0.0.1
      port: 5432
      user: postgres
      password: postgres-password
      database: app
```

数据库密码直接写在 `database.password`。如果数据库需要通过 SSH 访问，配置 `sshServerId`：

```yaml
dbServers:
  - id: reporting-mysql
    type: mysql
    sshServerId: bastion-prod
    database:
      host: 127.0.0.1
      port: 3306
      user: app
      password: mysql-password
      database: app
```

### Clients

`clients` 定义调用网关的客户端。每个 client 有自己的 `apiKey`，并逐个声明它能访问哪些 db server。

```yaml
clients:
  - id: analytics-app
    apiKey: dev-read-key
    dbServers:
      - serverId: prod-postgres
        permission: read
        maxRows: 500
        timeoutMs: 5000
      - serverId: reporting-mysql
        permission: read
```

每个 client 对每个 db server 都单独配置权限。`permission: read` 只能查询，`permission: write` 可以执行写入。client 侧的 `maxRows` 和 `timeoutMs` 会进一步收紧该 client 对该 server 的限制。

## API

面向 Dify 的配置和调用说明见 [docs/dify.md](docs/dify.md)。

### GET /health

检查服务是否存活。

请求参数：无。

成功响应：

```json
{
  "status": "ok"
}
```

### GET /openapi.json

返回 OpenAPI 文档。

请求参数：无。

成功响应：基于 `docs/openapi.json` 的 JSON 内容，并自动加入当前请求地址对应的 `servers`。如果服务在反向代理后面，优先使用 `X-Forwarded-Proto` 和 `X-Forwarded-Host` 推断外部访问地址。

### POST /db-servers

返回当前 client 可以访问的 db servers。

请求 header：

- `X-SQLTunnel-API-Key`：必填。client 的 API key。

请求 body：可省略，也可以传空 JSON 对象。

```json
{}
```

成功响应：

```json
{
  "dbServers": [
    {
      "id": "prod-postgres",
      "type": "postgres",
      "permission": "read",
      "maxRows": 500,
      "timeoutMs": 5000,
      "ssh": false
    }
  ]
}
```

响应字段：

- `dbServers[].id`：db server id，查询时作为 `dbServerId` 使用。
- `dbServers[].type`：数据库类型，`mysql` 或 `postgres`。
- `dbServers[].permission`：当前 client 对该 db server 的权限，`read` 或 `write`。
- `dbServers[].maxRows`：该 client 在该 db server 上的最终最大返回行数。
- `dbServers[].timeoutMs`：该 client 在该 db server 上的最终查询超时时间。
- `dbServers[].ssh`：是否通过 SSH tunnel 连接。

### POST /query

执行 SQL 查询。

请求 body：

```json
{
  "dbServerId": "prod-postgres",
  "sql": "select * from users limit 10",
  "params": [],
  "maxRows": 100,
  "responseFormat": "json"
}
```

请求字段：

- Header `X-SQLTunnel-API-Key`：必填。client 的 API key。
- `dbServerId`：必填。目标 db server id。
- `sql`：必填。要执行的 SQL。
- `params`：可选。SQL 参数数组，默认 `[]`。
- `maxRows`：可选。本次请求希望返回的最大行数；最终值不会超过配置中的 server/client 限制。
- `responseFormat`：可选，`raw` 或 `json`，默认 `raw`。

默认 `responseFormat: "raw"` 时返回 `text/plain`：

- 单列结果：每行一个原始值。
- 多列结果：TSV 文本，第一行为列名。

传 `responseFormat: "json"` 时返回结构化 JSON 对象：

成功响应：

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

响应字段：

- `columns`：结果列名。
- `rows`：结果行数组。
- `rowCount`：返回行数。
- `durationMs`：查询耗时，单位毫秒。
- `dbServerId`：本次查询使用的 db server id。

权限和限制：

- `permission: read` 只允许只读 SQL，例如 `select`、`with`、`show`、`describe`、`explain`。
- `permission: write` 允许写 SQL。
- 多语句 SQL 会被当作非只读 SQL 处理。
- 查询会强制套用 `maxRows` 和 `timeoutMs`。

错误返回格式：

```json
{
  "code": "ERROR_CODE",
  "message": "人类可读的消息",
  "requestId": "req-1"
}
```
