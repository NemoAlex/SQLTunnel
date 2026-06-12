# SQLTunnel

[English](README.md)

SQLTunnel 是一个数据库访问网关，用来让外部应用安全地查询只有内网才能访问的数据库。

它的主要使用场景是：数据库位于内网或只能通过跳板机访问，但 Dify、AI Agent、自动化平台、内部工具等应用需要按权限执行查询。SQLTunnel 部署在能访问数据库或跳板机的环境中，对外提供受控 API；外部应用只需要调用 SQLTunnel，不需要直接暴露数据库端口。

SQLTunnel 特别适合给 Dify 等 AI 工具提供数据库查询能力：

- 通过 API key 区分调用方。
- 每个调用方只能访问被授权的 db servers。
- 每个调用方对每个 db server 可以单独设置只读或写入权限。
- 支持通过 SSH 隧道访问内网数据库。
- 支持读取 SSH config，包括 Host alias 和 ProxyJump。
- 强制限制查询行数和查询超时，减少误操作影响。
- 默认适合只读查询场景，写入需要显式授权。

## 工作方式

典型链路如下：

```text
Dify / AI Agent / 外部应用
  -> SQLTunnel API
  -> SSH tunnel 或直连
  -> 内网数据库
```

SQLTunnel 的配置文件声明三类对象：

- `dbServers`：可访问的数据库。
- `sshServers`：可复用的 SSH 隧道入口，可引用 SSH config。
- `clients`：外部调用方，以及它能访问哪些 db servers。

外部应用不会看到数据库真实密码或 SSH 私钥，只会拿到自己的 API key 和允许使用的 db server id。

## 适用场景

SQLTunnel 适合这些场景：

- Dify 或其他 AI 工具需要查询内网数据库。
- 数据库不能直接暴露公网端口，只能通过跳板机或 SSH config 访问。
- 多个外部应用需要共享同一批数据库访问入口，但权限各不相同。
- 希望把数据库账号、SSH 私钥、跳板机细节集中放在服务端配置中。
- 希望对 AI 生成 SQL 设置统一的只读权限、行数限制和超时限制。

SQLTunnel 不负责生成 SQL，也不替代数据库审计系统。它的职责是把已经授权的查询请求转发到正确的 db server，并执行基础的权限和安全限制。

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

`compose.yaml` 的默认设置：

- 服务名是 `sqltunnel`。
- 使用当前目录的 `Dockerfile` 构建镜像，镜像名为 `sqltunnel:local`。
- 容器名固定为 `sqltunnel`。
- 重启策略是 `unless-stopped`。
- 将宿主机 `3000` 端口映射到容器 `3000` 端口。
- 将本地 `./config` 只读挂载到容器内的 `/app/config`。
- 不额外指定配置文件环境变量，服务默认读取 `/app/config/gateway.yaml`。

如果需要在 Docker 环境中使用 SSH config，建议把 SSH config 和私钥放在 `config/ssh/` 下，并在 `gateway.yaml` 中使用相对路径，例如 `sshConfigPath: ssh/config`、`privateKeyPath: ssh/id_rsa`。`config` 目录会整体挂载进容器，路径会基于 `gateway.yaml` 所在目录解析。

## 配置

网关默认读取 `config/gateway.yaml`。可通过 `SQLTUNNEL_CONFIG=/path/to/gateway.yaml` 覆盖。

配置里使用三个核心概念：

- `sshServers`：可复用的 SSH 隧道配置，支持 `~/.ssh/config` 和 `ProxyJump`。
- `dbServers`：真实数据库服务器，包含数据库类型、地址、账号密码、SSH 隧道等连接信息。
- `clients`：调用网关的客户端，包含 `apiKey`，并逐个声明它能访问哪些 `dbServers`。

### SSH Servers

`sshServers` 定义可复用的 SSH 隧道入口。db server 通过 `sshServerId` 引用它。

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

字段说明：

- `id`：必填。SSH server id，供 `dbServers[].sshServerId` 引用。
- `host`：必填。真实 SSH host，或 SSH config 中的 Host alias。
- `sshConfigPath`：可选。SSH config 文件路径。相对路径基于 `gateway.yaml` 所在目录解析；未配置时读取运行用户的 `~/.ssh/config`。
- `port`：可选。SSH 端口，默认 `22`。
- `username`：可选。SSH 用户名，默认当前运行用户。
- `password`：可选。SSH 密码。适合密码登录；也可以和私钥方式二选一。
- `privateKeyPath`：可选。私钥路径。相对路径基于 `gateway.yaml` 所在目录解析；未配置时会尝试使用 SSH config `IdentityFile` 或运行用户的常见默认私钥。
- `passphrase`：可选。加密私钥的 passphrase。
- `idleTimeoutMs`：可选。没有活跃查询后多久关闭 SSH 连接，默认 `60000`。
- `proxyJumps`：可选。ProxyJump 链。通常建议写在 SSH config 中，SQLTunnel 会从 SSH config 的 `ProxyJump` 自动解析。

支持的 SSH config 字段：

- `Host`
- `HostName`
- `User`
- `Port`
- `IdentityFile`
- `ProxyJump`

`host` 如果是 Host alias，会从 SSH config 补齐真实地址、用户、端口、私钥和 ProxyJump。

Docker 环境推荐把 SSH config 放到 `config/ssh/config`，然后在 `gateway.yaml` 中写：

```yaml
sshServers:
  - id: db-prod
    sshConfigPath: ssh/config
    host: db-prod
```

对应 SSH config 示例：

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

运行时会按 SSH server id 复用 SSH 链路；每次查询只打开新的转发 channel。闲置超过 `idleTimeoutMs` 后关闭链路。

本地运行时会使用 `SSH_AUTH_SOCK` 连接 ssh-agent。容器运行时如果也想使用 agent，需要额外挂载 agent socket；否则请在 YAML 或 SSH config 中配置容器可读取的私钥。

### DB Servers

`dbServers` 定义可以访问的数据库服务器。client 通过 db server id 获得访问授权。

```yaml
dbServers:
  - id: reporting-mysql
    type: mysql
    sshServerId: bastion-prod
    maxRows: 1000
    timeoutMs: 10000
    database:
      host: 127.0.0.1
      port: 3306
      user: app
      password: mysql-password
      database: app
```

字段说明：

- `id`：必填。db server id，供 `clients[].dbServers[].serverId` 和查询请求中的 `dbServerId` 引用。
- `type`：必填。数据库类型，支持 `mysql` 或 `postgres`。
- `sshServerId`：可选。引用 `sshServers[].id`；未配置时直接连接数据库。
- `maxRows`：可选。该 db server 的默认最大返回行数；未配置时使用 `defaults.maxRows`。
- `timeoutMs`：可选。该 db server 的默认查询超时时间；未配置时使用 `defaults.timeoutMs`。
- `database.host`：必填。数据库主机。通过 SSH 隧道访问时，这是从 SSH server 侧可访问的地址。
- `database.port`：必填。数据库端口。
- `database.user`：必填。数据库用户名。
- `database.password`：必填。数据库密码，直接写在配置文件中。
- `database.database`：必填。数据库名。

### Clients

`clients` 定义可以调用 SQLTunnel 的外部应用，以及它们能访问哪些 db servers。

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

字段说明：

- `id`：必填。client id，用来标识调用方。
- `apiKey`：必填。调用方请求 SQLTunnel 时使用的 API key，放在 `X-SQLTunnel-API-Key` header 中。
- `dbServers`：必填。该 client 可以访问的 db server 列表。
- `dbServers[].serverId`：必填。引用 `dbServers[].id`。
- `dbServers[].permission`：必填。权限，支持 `read` 或 `write`。`read` 只允许只读 SQL；`write` 允许写入 SQL。
- `dbServers[].maxRows`：可选。该 client 访问该 db server 时的最大返回行数；未配置时使用 db server 或全局默认值。
- `dbServers[].timeoutMs`：可选。该 client 访问该 db server 时的查询超时时间；未配置时使用 db server 或全局默认值。

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
