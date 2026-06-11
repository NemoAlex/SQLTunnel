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
curl -X POST http://localhost:3000/connections \
  -H 'content-type: application/json' \
  -d '{"apiKey":"dev-read-key"}'

curl -X POST http://localhost:3000/query \
  -H 'content-type: application/json' \
  -d '{
    "apiKey": "dev-read-key",
    "connectionId": "prod-postgres",
    "sql": "select * from users limit 10",
    "params": [],
    "maxRows": 100
  }'
```

## 配置

网关默认读取 `config/gateway.yaml`。可通过 `SQLTUNNEL_CONFIG=/path/to/gateway.yaml` 覆盖。

配置里使用两个核心概念：

- `dbServers`：真实数据库服务器，包含数据库类型、地址、账号密码、SSH 隧道等连接信息。
- `clients`：调用网关的客户端，包含 `apiKey`，并逐个声明它能访问哪些 `dbServers`。

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

数据库密码直接写在 `database.password`。SSH 可配置 `ssh.password`，或配置 `ssh.privateKeyPath` 使用私钥；`ssh.passphrase` 用于带密码的私钥。

如果 `ssh.host` 写的是 `~/.ssh/config` 中的 Host alias，网关会从 SSH config 补 `HostName`、`User`、`Port`、`IdentityFile` 和 `ProxyJump`。YAML 中显式配置的值优先。

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
ssh:
  host: db-prod
```

本地运行时会使用 `SSH_AUTH_SOCK` 连接 ssh-agent。容器运行时如果也想使用 agent，需要把 agent socket 挂进容器；否则请在 YAML 或 SSH config 中配置可读取的 `IdentityFile`，加密私钥还需要在 YAML 中配置 `ssh.passphrase`。

`ssh.privateKeyPath` 写相对路径时，会基于当前配置文件所在目录解析。例如默认配置文件是 `config/gateway.yaml`，则 `privateKeyPath: ssh/id_rsa` 会解析为 `config/ssh/id_rsa`。

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

- `GET /health`
- `GET /openapi.json`
- `POST /connections`
- `POST /query`

错误返回格式：

```json
{
  "code": "ERROR_CODE",
  "message": "人类可读的消息",
  "requestId": "req-1"
}
```
